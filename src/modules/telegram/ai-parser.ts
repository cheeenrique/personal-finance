import { z } from "zod";
import type { KnownMerchant } from "@/modules/transactions/types";
import type { AiParsedTransaction } from "./types";

/**
 * Parsing de lançamento livre via Gemini Flash (docs/30-TELEGRAM.md, "Parsing
 * por IA") — híbrido com o parser regex (`parser.ts`): só mensagens que
 * cairiam em `create_transaction`/`unknown` passam por aqui (comandos
 * determinísticos como "saldo"/"hoje"/"gastos mes" continuam 100% regex,
 * nunca chamam a IA).
 *
 * REST API via `fetch` nativo — sem SDK (Vercel serverless já tem fetch,
 * ver guard-rail da task). Structured output (`responseSchema`) garante JSON
 * bem-formado; ainda assim validamos com zod (nunca confiar cegamente em
 * saída de LLM, é input externo como qualquer outro).
 */
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const REQUEST_TIMEOUT_MS = 8000;

/** `queryType`s reconhecidos (docs/30-TELEGRAM.md, "Consulta por IA") — mesmos valores de `TelegramQueryType` (types.ts). */
const QUERY_TYPE_VALUES = [
  "spent",
  "received",
  "balance",
  "category_total",
  "top_categories",
  "card_invoice",
  "unpaid",
] as const;

const QUERY_PERIOD_VALUES = ["this_month", "last_month", "this_year"] as const;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    isTransaction: { type: "BOOLEAN" },
    type: { type: "STRING", enum: ["EXPENSE", "INCOME"] },
    amount: { type: "STRING", nullable: true },
    description: { type: "STRING" },
    date: { type: "STRING", nullable: true },
    categoryName: { type: "STRING", nullable: true },
    paymentMethod: { type: "STRING", enum: ["credit", "debit", "pix", "transfer", "cash"], nullable: true },
    originKind: { type: "STRING", enum: ["account", "card"], nullable: true },
    originName: { type: "STRING", nullable: true },
    // Classificação de intenção + pergunta estruturada (docs/30-TELEGRAM.md,
    // "Consulta por IA") — só usadas pela extração de TEXTO (`buildPrompt`);
    // a extração de imagem (`buildImagePrompt`) nunca as menciona, então o
    // modelo tende a omiti-las nesse caminho (nenhuma delas é `required`
    // abaixo, de propósito — zero regressão no caminho de foto/register).
    intent: { type: "STRING", enum: ["register", "query", "unknown"], nullable: true },
    query: {
      type: "OBJECT",
      nullable: true,
      properties: {
        queryType: { type: "STRING", enum: QUERY_TYPE_VALUES },
        period: { type: "STRING", enum: QUERY_PERIOD_VALUES },
        categoryName: { type: "STRING", nullable: true },
        cardName: { type: "STRING", nullable: true },
      },
      required: ["queryType", "period"],
    },
  },
  required: ["isTransaction", "type", "description"],
} as const;

const queryResponseSchema = z.object({
  queryType: z.enum(QUERY_TYPE_VALUES),
  period: z.enum(QUERY_PERIOD_VALUES).default("this_month"),
  categoryName: z.string().nullable().optional(),
  cardName: z.string().nullable().optional(),
});

/** Valida a saída do modelo — nunca confiamos no JSON de um LLM sem checar shape (mesmo com `responseSchema`). */
const aiResponseSchema = z.object({
  isTransaction: z.boolean(),
  type: z.enum(["EXPENSE", "INCOME"]),
  // `amount` nullable (docs/30-TELEGRAM.md, "Fluxo conversacional"): mensagem
  // sem valor numérico vira pergunta em vez de a IA inventar um número.
  amount: z.string().min(1).nullable().optional(),
  description: z.string().min(1),
  date: z.string().nullable().optional(),
  categoryName: z.string().nullable().optional(),
  paymentMethod: z.enum(["credit", "debit", "pix", "transfer", "cash"]).nullable().optional(),
  originKind: z.enum(["account", "card"]).nullable().optional(),
  originName: z.string().nullable().optional(),
  intent: z.enum(["register", "query", "unknown"]).nullable().optional(),
  query: queryResponseSchema.nullable().optional(),
});

export type AiParserContext = {
  /** `YYYY-MM-DD` em America/Sao_Paulo — referência de "hoje" pra resolver datas relativas. */
  todaySaoPaulo: string;
  /** Nomes das categorias (ambos os tipos) do usuário — a IA escolhe a mais próxima dessa lista. */
  categoryNames: string[];
  /** Nomes das contas ATIVAS do usuário. */
  accountNames: string[];
  /** Nomes dos cartões ATIVOS do usuário. */
  cardNames: string[];
  /**
   * Pagadores/merchants conhecidos do usuário — descrição já usada + a
   * categoria dominante dela (`transactionService.listKnownMerchants`, ver
   * `resolve.ts`, `listKnownMerchantsForAI`). Deixa a IA casar SEMANTICAMENTE
   * um pagador já visto mesmo com o texto novo diferente (docs/30-TELEGRAM.md,
   * "Parsing por IA"), em vez do match exato frágil do fallback determinístico.
   */
  knownMerchants: KnownMerchant[];
};

function labelOrPlaceholder(names: string[], placeholder: string): string {
  return names.length > 0 ? names.join(", ") : placeholder;
}

/** Descrições longas truncadas — a lista de merchants não pode inflar o prompt em tokens (docs/30-TELEGRAM.md, top ~40 já compacto por si). */
const MAX_MERCHANT_DESCRIPTION_LENGTH = 60;

function truncateMerchantDescription(description: string): string {
  return description.length > MAX_MERCHANT_DESCRIPTION_LENGTH
    ? `${description.slice(0, MAX_MERCHANT_DESCRIPTION_LENGTH)}…`
    : description;
}

function knownMerchantsLabel(merchants: KnownMerchant[]): string {
  if (merchants.length === 0) return "(nenhum ainda)";
  return merchants
    .map((merchant) => `"${truncateMerchantDescription(merchant.description)}" → ${merchant.categoryName}`)
    .join("; ");
}

function buildPrompt(rawText: string, ctx: AiParserContext): string {
  const categoriesLabel = labelOrPlaceholder(ctx.categoryNames, "(nenhuma cadastrada)");
  const accountsLabel = labelOrPlaceholder(ctx.accountNames, "(nenhuma cadastrada)");
  const cardsLabel = labelOrPlaceholder(ctx.cardNames, "(nenhum cadastrado)");
  const merchantsLabel = knownMerchantsLabel(ctx.knownMerchants);

  return [
    "Você processa uma mensagem (pt-BR) enviada por um usuário a um bot do Telegram de finanças pessoais.",
    `Data de referência ("hoje"): ${ctx.todaySaoPaulo} (America/Sao_Paulo).`,
    "",
    "PRIMEIRO classifique a mensagem em um `intent`:",
    '- "register": o usuário quer REGISTRAR um lançamento novo (gasto ou receita) — ex.: "mercado 120", "recebi 500 de freela".',
    '- "query": o usuário está PERGUNTANDO sobre as finanças dele, sem querer registrar nada novo — ex.: "quanto gastei esse mês", "qual meu saldo", "fatura do Nubank", "quanto falta pagar".',
    '- "unknown": nem lançamento nem pergunta reconhecível (saudação, mensagem aleatória, pergunta fora de escopo financeiro).',
    "",
    'Se intent="register": preencha isTransaction=true e siga as "Regras de lançamento" abaixo. Deixe query=null.',
    'Se intent="query": preencha isTransaction=false, description com qualquer texto curto (não é usado), e preencha o objeto `query` seguindo as "Regras de pergunta" abaixo.',
    'Se intent="unknown": preencha isTransaction=false e deixe query=null.',
    "",
    'Regras de lançamento (só valem quando intent="register"):',
    "- isTransaction=false se a mensagem NÃO for um lançamento (saudação, pergunta, texto aleatório sem qualquer menção a gasto/recebimento de dinheiro).",
    '- type: INCOME quando o dinheiro ENTRA pro usuário (ex.: "recebi", "recebido de", "pix recebido", "caiu", salário, freela); EXPENSE quando o dinheiro SAI (ex.: "paguei", "comprei", "pix para", "transferência para", gasto do dia a dia). Assuma EXPENSE quando ambíguo.',
    '- amount: valor decimal em string (ex.: "30" ou "30.50"), sem símbolo de moeda. Se a mensagem NÃO mencionar nenhum valor numérico, retorne null — NUNCA invente um valor.',
    "- description: descrição curta do lançamento (poucas palavras). Pessoa ou empresa EXTERNA citada (ex.: \"mãe\", \"Romeika\", \"Funape\" — alguém que NÃO é o próprio usuário) SEMPRE vai na descrição, nunca é uma conta/cartão do usuário. Se o pagador/beneficiário for o MESMO de um item da lista \"Pagadores/recebedores conhecidos\" abaixo (mesmo com o texto diferente — variação de grafia, abreviação, razão social com CNPJ junto etc.), escreva a description com o nome CANÔNICO desse item (o texto entre aspas antes da seta), em vez de repetir o texto cru da mensagem.",
    '- date: resolva datas relativas ("hoje", "ontem", "amanhã") e absolutas ("dia 18/06", "18/06") usando a data de referência acima como "hoje" e o ano corrente quando omitido. Formato YYYY-MM-DD. Se a mensagem não mencionar data, retorne null.',
    `- categoryName: escolha o nome MAIS PRÓXIMO dentre esta lista de categorias do usuário: [${categoriesLabel}]. Se o pagador/beneficiário bater com um item da lista "Pagadores/recebedores conhecidos" abaixo (mesmo critério da regra de description), use a categoria DESSE item. Senão, se nenhuma categoria for uma boa correspondência, retorne null.`,
    '- paymentMethod: identifique COMO o dinheiro saiu/entrou — "credit" (cartão de crédito), "debit" (cartão de débito), "pix", "transfer" (transferência/TED/DOC), "cash" (dinheiro/espécie). Se a mensagem não mencionar nenhum canal, retorne null.',
    '- originKind/originName: só preencha se o nome citado bater com um item REAL das listas abaixo. Se citar um CARTÃO da lista (geralmente junto de "crédito"/"débito"), originKind="card" e originName = nome EXATO da lista de cartões. Se citar uma CONTA da lista (geralmente junto de "pix"/"transferência"/banco), originKind="account" e originName = nome EXATO da lista de contas. IMPORTANTE: nome de pessoa/empresa EXTERNA (que foi pra description) NUNCA é origem, mesmo aparecendo perto de "pix" ou "transferência". Sem menção de conta/cartão real do usuário, ambos null.',
    "",
    'Regras de pergunta (só valem quando intent="query"):',
    '- queryType: "spent" (quanto gastou), "received" (quanto recebeu), "balance" (saldo das contas), "category_total" (quanto gastou numa categoria específica — preencha categoryName), "top_categories" (quais categorias tiveram maior gasto), "card_invoice" (fatura de um cartão específico — preencha cardName) ou "unpaid" (quanto falta pagar / previsto).',
    `- categoryName (só relevante para queryType="category_total"): nome MAIS PRÓXIMO dentre a lista de categorias do usuário: [${categoriesLabel}]. null se a mensagem não citar uma categoria ou o queryType for outro.`,
    `- cardName (só relevante para queryType="card_invoice"): nome MAIS PRÓXIMO dentre a lista de cartões do usuário: [${cardsLabel}]. null se a mensagem não citar um cartão ou o queryType for outro.`,
    '- period: "this_month" (padrão — quando a mensagem não menciona período, ou fala do mês atual), "last_month" (mês passado), "this_year" (esse ano/ano todo).',
    "",
    `Contas do usuário: [${accountsLabel}]`,
    `Cartões do usuário: [${cardsLabel}]`,
    `Pagadores/recebedores conhecidos do usuário (descrição → categoria mais usada): [${merchantsLabel}]`,
    "",
    `Mensagem do usuário: "${rawText}"`,
  ].join("\n");
}

/**
 * Prompt da extração via Gemini VISION (docs/30-TELEGRAM.md — bot aceita
 * foto de nota/comprovante/notificação). A imagem pode ser um recibo/nota
 * fiscal, um comprovante de Pix/transferência OU uma notificação push do
 * banco/cartão (print de tela do celular) — as mesmas regras de
 * type/amount/description/categoryName/paymentMethod/originKind/originName
 * de `buildPrompt` valem aqui, só a FONTE dos dados muda (imagem em vez de
 * texto). `caption` (texto que o usuário mandou junto da foto, opcional) vira
 * dica extra no fim do prompt.
 */
function buildImagePrompt(caption: string | null, ctx: AiParserContext): string {
  const categoriesLabel = labelOrPlaceholder(ctx.categoryNames, "(nenhuma cadastrada)");
  const accountsLabel = labelOrPlaceholder(ctx.accountNames, "(nenhuma cadastrada)");
  const cardsLabel = labelOrPlaceholder(ctx.cardNames, "(nenhum cadastrado)");
  const merchantsLabel = knownMerchantsLabel(ctx.knownMerchants);

  const lines = [
    "Você extrai dados de uma IMAGEM de um lançamento financeiro pessoal (pt-BR) enviada por um usuário a um bot do Telegram.",
    'A imagem pode ser um recibo/nota fiscal de compra, um comprovante de Pix/transferência OU uma notificação push do banco/cartão (print de tela do celular) — ex.: "Compra no crédito aprovada — Compra de R$ 67,89 APROVADA em FILIAL ELDORA para o cartão com final 7547." Trate qualquer um desses formatos igual.',
    `Data de referência ("hoje"): ${ctx.todaySaoPaulo} (America/Sao_Paulo).`,
    "",
    "Regras:",
    "- isTransaction=false se a imagem NÃO mostrar nenhum lançamento financeiro reconhecível (foto sem valor nem estabelecimento/lançamento visível).",
    '- type: INCOME quando o dinheiro ENTRA pro usuário (recebimento, Pix recebido, depósito); EXPENSE quando o dinheiro SAI (compra aprovada, pagamento, Pix enviado). Assuma EXPENSE quando ambíguo — a maioria das notificações de cartão/recibo é gasto.',
    '- amount: valor TOTAL exatamente como aparece na imagem (o valor "aprovado"/"pago"/da compra), em string decimal (ex.: "67.89"), sem símbolo de moeda. Se a imagem NÃO mostrar nenhum valor numérico legível, retorne null — NUNCA invente um valor.',
    '- description: o ESTABELECIMENTO/comércio citado na imagem (ex.: "FILIAL ELDORA"), poucas palavras. Pessoa/empresa EXTERNA (destinatário de um Pix, por exemplo) segue a mesma regra do texto: vai na descrição, nunca é origem. Se o estabelecimento/pagador bater com um item da lista "Pagadores/recebedores conhecidos" abaixo (mesmo com o texto diferente — variação de grafia, abreviação, razão social com CNPJ junto etc.), escreva a description com o nome CANÔNICO desse item (o texto entre aspas antes da seta).',
    "- date: se a imagem mostrar a data/hora do lançamento, resolva pro formato YYYY-MM-DD (ano corrente quando omitido). Sem nenhuma data visível na imagem, retorne null (o sistema assume hoje).",
    `- categoryName: escolha o nome MAIS PRÓXIMO dentre esta lista de categorias do usuário: [${categoriesLabel}]. Se o estabelecimento/pagador bater com um item da lista "Pagadores/recebedores conhecidos" abaixo (mesmo critério da regra de description), use a categoria DESSE item. Senão, sem boa correspondência, retorne null.`,
    '- paymentMethod: identifique o canal pelas palavras da imagem — "credit" (crédito), "debit" (débito), "pix", "transfer" (TED/DOC/transferência), "cash" (dinheiro/espécie). Sem menção clara, retorne null.',
    `- originKind/originName: só preencha se o NOME (não o número) de uma conta ou cartão REAL do usuário aparecer na imagem, batendo com um item das listas abaixo. Menções como "cartão com final 7547" ou os últimos dígitos de um cartão NÃO bastam pra identificar QUAL cartão cadastrado é — o app não guarda os últimos dígitos dos cartões, então NUNCA infira qual cartão a partir só desse número. Nesse caso deixe originKind/originName null (o sistema pergunta ao usuário qual cartão/conta foi).`,
    `Contas do usuário: [${accountsLabel}]`,
    `Cartões do usuário: [${cardsLabel}]`,
    `Pagadores/recebedores conhecidos do usuário (descrição → categoria mais usada): [${merchantsLabel}]`,
  ];

  if (caption) {
    lines.push(
      "",
      `IMPORTANTE — o usuário escreveu esta legenda junto da foto, que é o RÓTULO/intenção dele para o lançamento: "${caption}".`,
      "A CATEGORIA sempre vem do produto/serviço descrito na legenda (a imagem serve pro VALOR/data/canal, nunca pra categoria quando há legenda).",
      "Para a DESCRIÇÃO, DECIDA pelo contexto se deve COMBINAR o pagador/destinatário da imagem com o produto da legenda, ou usar SÓ a legenda:",
      "  - COMBINE no formato \"Pagador - Produto\" quando o pagador/destinatário da imagem AGREGA informação nova (é uma pessoa ou estabelecimento específico, diferente do próprio usuário). Ex.: imagem = pagamento para 'LucasDeLimaSilva', legenda = 'Açaí delivery' → description = \"LucasDeLimaSilva - Açaí\".",
      "  - Use SÓ a legenda quando o pagador/destinatário da imagem é RUÍDO ou REDUNDANTE — não agrega nada (ex.: é a própria empresa/PJ do usuário recebendo uma transferência do próprio usuário, então repetir o nome dela na descrição não ajuda). Ex.: imagem = transferência para a PJ do próprio usuário, legenda = 'Imposto TFE' → description = \"Imposto TFE\", sem o nome da PJ.",
      "Se a legenda citar conta/cartão (ex.: 'pix Nubank'), use como origem também.",
    );
  }

  return lines.join("\n");
}

/** Parte de um `content` da API Gemini — texto puro ou bytes inline (imagem/PDF) em base64. Exportado pra `financing-parser.ts` montar seu próprio `contents` (mesmo formato, documento em vez de foto de lançamento). */
export type GeminiContentPart = { text: string } | { inlineData: { mimeType: string; data: string } };

/**
 * Chamada Gemini genérica — compartilhada por transação (texto
 * `parseTransactionWithAI`, imagem `parseTransactionFromImage`) e documento
 * de financiamento (`financing-parser.ts`, `parseFinancingFromDocument`).
 * `responseSchema` (formato Gemini/OpenAPI) e `parseResponse` (valida com zod
 * + mapeia pro tipo final do caller) são parametrizados pra reuso — só o
 * `contents` e o shape esperado mudam entre os casos de uso; a chamada
 * HTTP/timeout/tratamento de erro é idêntico (rule 02-dry-kiss-yagni, DRY a
 * partir do 2º caso concreto real). `source` só rotula os logs pra
 * diferenciar qual caminho falhou. `null` em qualquer falha (sem
 * `GEMINI_API_KEY`, erro de rede, timeout, resposta não-2xx, JSON
 * inválido/fora do shape esperado — `parseResponse` decide isso) — NUNCA
 * lança, webhook do Telegram não pode quebrar por causa de uma dependência
 * externa opcional. NUNCA loga o conteúdo de `contents` (texto do
 * usuário/bytes de imagem/documento) nem a API key (docs/30-TELEGRAM.md,
 * "Segurança").
 */
export async function callGemini<T>(
  contents: Array<{ parts: GeminiContentPart[] }>,
  source: string,
  responseSchema: object,
  parseResponse: (rawJson: unknown) => T | null,
): Promise<T | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema,
        },
      }),
    });

    if (!response.ok) {
      console.error(`[modules/telegram] gemini ${source} request failed`, { status: response.status });
      return null;
    }

    const body = (await response.json().catch(() => null)) as
      | { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
      | null;
    const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") return null;

    const rawJson: unknown = JSON.parse(text);
    return parseResponse(rawJson);
  } catch (error) {
    console.error(`[modules/telegram] gemini ${source} parse failed`, {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Valida a saída bruta do Gemini contra `aiResponseSchema` e mapeia pro shape
 * final `AiParsedTransaction` — usado como `parseResponse` de `callGemini`
 * nos dois caminhos de transação (texto e imagem). `null` quando o shape não
 * bate (nunca confiamos cegamente em saída de LLM, é input externo como
 * qualquer outro).
 */
function parseAiTransactionResponse(rawJson: unknown): AiParsedTransaction | null {
  const parsed = aiResponseSchema.safeParse(rawJson);
  if (!parsed.success) return null;

  return {
    isTransaction: parsed.data.isTransaction,
    type: parsed.data.type,
    amount: parsed.data.amount ?? null,
    description: parsed.data.description,
    date: parsed.data.date ?? null,
    categoryName: parsed.data.categoryName ?? null,
    paymentMethod: parsed.data.paymentMethod ?? null,
    originKind: parsed.data.originKind ?? null,
    originName: parsed.data.originName ?? null,
    intent: parsed.data.intent ?? undefined,
    query: parsed.data.query
      ? {
          queryType: parsed.data.query.queryType,
          period: parsed.data.query.period,
          categoryName: parsed.data.query.categoryName ?? null,
          cardName: parsed.data.query.cardName ?? null,
        }
      : null,
  };
}

/**
 * `null` em qualquer falha (sem `GEMINI_API_KEY`, erro de rede, timeout,
 * resposta não-2xx, JSON inválido/fora do shape esperado) — o chamador
 * (`handlers.ts`) sempre tem um fallback determinístico (parser regex) pra
 * esses casos. NUNCA lança — webhook do Telegram não pode quebrar por causa
 * de uma dependência externa opcional. NUNCA loga `rawText` nem a API key
 * (docs/30-TELEGRAM.md, "Segurança").
 */
export async function parseTransactionWithAI(
  rawText: string,
  ctx: AiParserContext,
): Promise<AiParsedTransaction | null> {
  return callGemini([{ parts: [{ text: buildPrompt(rawText, ctx) }] }], "text", RESPONSE_SCHEMA, parseAiTransactionResponse);
}

/**
 * Extração via Gemini VISION a partir de uma FOTO de nota/comprovante/
 * notificação (docs/30-TELEGRAM.md — bot aceita foto). Mesmo `responseSchema`/
 * validação zod da extração de texto — só a entrada muda (`inlineData` com a
 * imagem em base64 + o prompt de imagem). `null` em qualquer falha — DIFERENTE
 * do texto, aqui não existe fallback determinístico (não dá pra "regex" uma
 * imagem); o chamador (`handlers.ts`, `handleImageEntry`) responde pedindo
 * pra reenviar a foto ou digitar o lançamento. NUNCA loga os bytes da imagem
 * nem a API key.
 */
export async function parseTransactionFromImage(
  imageBytes: Buffer,
  mimeType: string,
  caption: string | null,
  ctx: AiParserContext,
): Promise<AiParsedTransaction | null> {
  return callGemini(
    [
      {
        parts: [
          { inlineData: { mimeType, data: imageBytes.toString("base64") } },
          { text: buildImagePrompt(caption, ctx) },
        ],
      },
    ],
    "vision",
    RESPONSE_SCHEMA,
    parseAiTransactionResponse,
  );
}
