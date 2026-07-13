import { z } from "zod";
import type { KnownMerchant } from "@/modules/transactions/types";
import { callGemini, type GeminiContentPart } from "@/lib/ai/gemini";
import { extractStructured } from "@/lib/ai/extract";
import type { JsonSchema } from "@/lib/ai/types";
import type { AiParsedTransaction } from "./types";

/**
 * Parsing de lançamento livre via Gemini Flash (docs/30-TELEGRAM.md, "Parsing
 * por IA") — híbrido com o parser regex (`parser.ts`): só mensagens que
 * cairiam em `create_transaction`/`unknown` passam por aqui (comandos
 * determinísticos como "saldo"/"hoje"/"gastos mes" continuam 100% regex,
 * nunca chamam a IA).
 *
 * O transporte genérico (REST via `fetch` nativo, sem SDK; timeout;
 * tratamento de erro→null) vive em `@/lib/ai/gemini.ts` (infra compartilhada
 * com `financing-parser.ts` e `modules/imports/parsers/pdf-parser.ts`) —
 * reexportado abaixo pra não quebrar quem importa `callGemini`/
 * `GeminiContentPart` daqui. Structured output (`responseSchema`) garante
 * JSON bem-formado; ainda assim validamos com zod (nunca confiar cegamente em
 * saída de LLM, é input externo como qualquer outro).
 */
export { callGemini, type GeminiContentPart };

/** `queryType`s reconhecidos (docs/30-TELEGRAM.md, "Consulta por IA") — mesmos valores de `TelegramQueryType` (types.ts). */
const QUERY_TYPE_VALUES = [
  "spent",
  "received",
  "balance",
  "category_total",
  "top_categories",
  "card_invoice",
  "unpaid",
  "investments",
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
    intent: {
      type: "STRING",
      enum: ["register", "query", "ask", "invest", "create_category", "unknown"],
      nullable: true,
    },
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
    invest: {
      type: "OBJECT",
      nullable: true,
      properties: {
        amount: { type: "STRING", nullable: true },
        investmentName: { type: "STRING", nullable: true },
        accountName: { type: "STRING", nullable: true },
      },
      required: [],
    },
    createCategory: {
      type: "OBJECT",
      nullable: true,
      properties: {
        categoryName: { type: "STRING", nullable: true },
        parentName: { type: "STRING", nullable: true },
      },
      required: [],
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

const investResponseSchema = z.object({
  amount: z.string().min(1).nullable().optional(),
  investmentName: z.string().nullable().optional(),
  accountName: z.string().nullable().optional(),
});

const createCategoryResponseSchema = z.object({
  categoryName: z.string().nullable().optional(),
  parentName: z.string().nullable().optional(),
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
  intent: z.enum(["register", "query", "ask", "invest", "create_category", "unknown"]).nullable().optional(),
  query: queryResponseSchema.nullable().optional(),
  invest: investResponseSchema.nullable().optional(),
  createCategory: createCategoryResponseSchema.nullable().optional(),
});

/**
 * Schema (formato lowercase da camada de IA nova, `@/lib/ai/types.ts`
 * `JsonSchema`) da extração de IMAGEM — DIFERENTE de `RESPONSE_SCHEMA` acima
 * (formato Gemini UPPERCASE, só usado pelo `callGemini` direto de texto/voz).
 * Envelope `{ transactions: [...] }` — a imagem pode conter 1 OU VÁRIOS
 * lançamentos (docs/30-TELEGRAM.md, "Parsing por IA (lançamento via FOTO)");
 * cada item é só register (sem intent/query/invest — imagem nunca classifica
 * isso). `GeminiExtractor` (fallback) converte pro formato Gemini via
 * `toGeminiSchema`; `NvidiaNimExtractor` (primário) embute este JSON cru no
 * prompt (prompt-constrained, ver `nvidia.ts`).
 */
const IMAGE_TRANSACTION_ITEM_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["EXPENSE", "INCOME"] },
    amount: { type: "string", nullable: true },
    description: { type: "string" },
    date: { type: "string", nullable: true },
    categoryName: { type: "string", nullable: true },
    paymentMethod: { type: "string", enum: ["credit", "debit", "pix", "transfer", "cash"], nullable: true },
    originKind: { type: "string", enum: ["account", "card"], nullable: true },
    originName: { type: "string", nullable: true },
  },
  required: ["type", "description"],
};

const IMAGE_RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    transactions: { type: "array", items: IMAGE_TRANSACTION_ITEM_SCHEMA },
  },
  required: ["transactions"],
};

/** Espelha `IMAGE_TRANSACTION_ITEM_SCHEMA` acima — validação real (nunca confiamos cegamente
 * em saída de LLM, mesmo com schema pedido no prompt/`responseSchema`). Sem `isTransaction`
 * (cada item da lista JÁ é um lançamento — a ausência de lançamento vira array vazio, não um
 * item com a flag falsa). */
const imageTransactionItemSchema = z.object({
  type: z.enum(["EXPENSE", "INCOME"]),
  amount: z.string().min(1).nullable().optional(),
  description: z.string().min(1),
  date: z.string().nullable().optional(),
  categoryName: z.string().nullable().optional(),
  paymentMethod: z.enum(["credit", "debit", "pix", "transfer", "cash"]).nullable().optional(),
  originKind: z.enum(["account", "card"]).nullable().optional(),
  originName: z.string().nullable().optional(),
});

const imageTransactionsEnvelopeSchema = z.object({
  transactions: z.array(z.unknown()),
});

/**
 * O VLM (NVIDIA, primário) às vezes devolve o valor com vírgula decimal
 * ("54,23") mesmo instruído a usar ponto no prompt — normaliza ANTES da
 * validação zod (nunca confiamos no formato cru do modelo). Cobre também o
 * padrão BR completo com separador de milhar ("1.234,56" → "1234.56"): sem
 * vírgula, a string já está no formato esperado e volta inalterada.
 */
function normalizeAiAmount(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.includes(",")) return trimmed;
  return trimmed.replace(/\./g, "").replace(",", ".");
}

function normalizeImageItemAmount(rawItem: unknown): unknown {
  if (typeof rawItem !== "object" || rawItem === null) return rawItem;
  const item = rawItem as Record<string, unknown>;
  if (typeof item.amount !== "string") return rawItem;
  return { ...item, amount: normalizeAiAmount(item.amount) };
}

/**
 * Valida o envelope `{ transactions: [...] }` e cada item individualmente —
 * item malformado é DESCARTADO isoladamente (erro-como-dado,
 * ~/.claude/rules/06-composition-errors.md), nunca derruba os demais itens
 * válidos da mesma imagem. `null` só quando o ENVELOPE inteiro não bate o
 * shape esperado (resposta do modelo totalmente fora do formato).
 */
function parseImageTransactionsResponse(rawJson: unknown): AiParsedTransaction[] | null {
  const envelope = imageTransactionsEnvelopeSchema.safeParse(rawJson);
  if (!envelope.success) return null;

  const transactions: AiParsedTransaction[] = [];
  for (const rawItem of envelope.data.transactions) {
    const parsed = imageTransactionItemSchema.safeParse(normalizeImageItemAmount(rawItem));
    if (!parsed.success) continue;

    transactions.push({
      isTransaction: true,
      type: parsed.data.type,
      amount: parsed.data.amount ?? null,
      description: parsed.data.description,
      date: parsed.data.date ?? null,
      categoryName: parsed.data.categoryName ?? null,
      paymentMethod: parsed.data.paymentMethod ?? null,
      originKind: parsed.data.originKind ?? null,
      originName: parsed.data.originName ?? null,
    });
  }

  return transactions;
}

export type AiParserContext = {
  /** `YYYY-MM-DD` em America/Sao_Paulo — referência de "hoje" pra resolver datas relativas. */
  todaySaoPaulo: string;
  /** Nomes das categorias (ambos os tipos) do usuário — a IA escolhe a mais próxima dessa lista. */
  categoryNames: string[];
  /** Nomes das contas ATIVAS do usuário. */
  accountNames: string[];
  /** Nomes dos cartões ATIVOS do usuário. */
  cardNames: string[];
  /** Nomes dos investimentos (Asset INVESTMENT) — aporte/consulta via Telegram. */
  investmentNames: string[];
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

/**
 * Blocos de regra compartilhados entre os prompts de TEXTO e VOZ (mesma
 * extração completa: intent + register + invest + query) — extraídos pra
 * matar o drift entre os 3 prompts (regra 02-dry-kiss-yagni, 3+ ocorrências =
 * extrair; o comentário antigo em `RESPONSE_SCHEMA` já admitia que texto e
 * imagem tinham divergido). IMAGEM não usa estes blocos: não classifica
 * intent (só faz register) e tem regras de campo bem diferentes por ler
 * pixels em vez de texto/áudio — ver `buildImagePrompt`.
 */
const INTENT_CLASSIFICATION = [
  "PRIMEIRO classifique o conteúdo em um `intent`:",
  '- "register": o usuário quer REGISTRAR um lançamento novo (gasto ou receita) — ex.: "mercado 120", "recebi 500 de freela". NÃO use register para aporte em investimento (cofrinho/CDB).',
  '- "invest": o usuário quer APORTAR / investir dinheiro num produto cadastrado — ex.: "investi 100 no Cofrinho Nubank", "aportei 200 no CDB", "coloquei 50 no cofrinho".',
  '- "query": o usuário está PERGUNTANDO sobre as finanças dele com uma pergunta ESTRUTURADA/ESPECÍFICA que bate 1:1 com um dos `queryType`s fechados abaixo ("Regras de pergunta") — ex.: "quanto gastei esse mês", "qual meu saldo", "quais meus investimentos", "fatura do Nubank", "quanto falta pagar", "quais minhas top categorias".',
  '- "ask": o usuário está fazendo uma pergunta ANALÍTICA/ABERTA sobre as finanças dele que NENHUM `queryType` fechado de "query" cobre — geralmente envolve "por quê", comparação, causa, previsão ou recomendação — ex.: "por que gastei mais em maio", "quanto posso guardar esse mês", "minhas finanças estão indo bem?", "dá pra economizar em quê". Use "ask" só quando a pergunta não reduz a um `queryType` fechado; se reduzir, prefira "query" (mais preciso e determinístico).',
  '- "create_category": o usuário quer CRIAR uma categoria nova — ex.: "cria categoria pedágio", "cria a categoria pedágio dentro de transporte", "cria categoria academia em saúde". Preencha createCategory={categoryName, parentName}. parentName=null quando o usuário não citar "dentro de"/"em" <categoria pai> — nesse caso a categoria criada é PAI (top-level, EXPENSE). Quando citar, parentName = nome do pai como o usuário escreveu (a resolução contra as categorias REAIS do usuário acontece fora da IA, ver resolve.ts). NÃO INVENTE parentName se o usuário não mencionou nenhum pai.',
  '- "unknown": nem lançamento, nem aporte, nem pergunta reconhecível, nem criação de categoria (saudação, ruído/áudio inaudível, mensagem aleatória, pergunta fora de escopo financeiro).',
  "",
  'Se intent="register": preencha isTransaction=true e siga as "Regras de lançamento" abaixo. Deixe query=null, invest=null e createCategory=null.',
  'Se intent="invest": preencha isTransaction=false, description curto, invest={amount, investmentName, accountName}, query=null e createCategory=null.',
  'Se intent="query": preencha isTransaction=false, description com qualquer texto curto (não é usado), e preencha o objeto `query` seguindo as "Regras de pergunta" abaixo. Deixe invest=null e createCategory=null.',
  'Se intent="ask": preencha isTransaction=false, description com a PERGUNTA transcrita na íntegra (fonte de texto do áudio pro `ask.ts` responder — texto digitado já usa a mensagem original bruta em vez de description, mas voz não tem outra fonte), e deixe query=null, invest=null e createCategory=null (a pergunta em si é respondida fora deste parser, ver `ask.ts`).',
  'Se intent="create_category": preencha isTransaction=false, description curto, createCategory={categoryName, parentName}, e deixe query=null e invest=null.',
  'Se intent="unknown": preencha isTransaction=false e deixe query=null, invest=null e createCategory=null.',
];

function rulesLaunch(categoriesLabel: string): string[] {
  return [
    'Regras de lançamento (só valem quando intent="register"):',
    "- isTransaction=false se o conteúdo NÃO for um lançamento (saudação, pergunta, ruído, texto aleatório sem qualquer menção a gasto/recebimento de dinheiro).",
    '- type: INCOME quando o dinheiro ENTRA pro usuário (ex.: "recebi", "recebido de", "pix recebido", "caiu", salário, freela); EXPENSE quando o dinheiro SAI (ex.: "paguei", "comprei", "pix para", "transferência para", gasto do dia a dia). Assuma EXPENSE quando ambíguo.',
    '- amount: valor decimal em string (ex.: "30" ou "30.50"), sem símbolo de moeda (considere números por extenso quando a fonte for áudio). Se NÃO houver valor numérico, retorne null — NUNCA invente um valor.',
    "- description: descrição curta do lançamento (poucas palavras). Pessoa ou empresa EXTERNA citada (ex.: \"mãe\", \"Romeika\", \"Funape\" — alguém que NÃO é o próprio usuário) SEMPRE vai na descrição, nunca é uma conta/cartão do usuário. Se o pagador/beneficiário for o MESMO de um item da lista \"Pagadores/recebedores conhecidos\" abaixo (mesmo com o texto diferente — variação de grafia, abreviação, razão social com CNPJ junto etc.), escreva a description com o nome CANÔNICO desse item (o texto entre aspas antes da seta), em vez de repetir o texto cru.",
    '- date: resolva datas relativas ("hoje", "ontem", "amanhã") e absolutas ("dia 18/06", "18/06") usando a data de referência acima como "hoje" e o ano corrente quando omitido. Formato YYYY-MM-DD. Sem menção de data, retorne null.',
    `- categoryName: escolha o nome MAIS PRÓXIMO dentre esta lista de categorias do usuário: [${categoriesLabel}]. Se o pagador/beneficiário bater com um item da lista "Pagadores/recebedores conhecidos" abaixo (mesmo critério da regra de description), use a categoria DESSE item. Senão, sem boa correspondência, retorne null.`,
    '- paymentMethod: identifique COMO o dinheiro saiu/entrou — "credit" (cartão de crédito), "debit" (cartão de débito), "pix", "transfer" (transferência/TED/DOC), "cash" (dinheiro/espécie). Sem menção de canal, retorne null.',
    '- originKind/originName: só preencha se o nome citado bater com um item REAL das listas abaixo. Se citar um CARTÃO da lista (geralmente junto de "crédito"/"débito"), originKind="card" e originName = nome EXATO da lista de cartões. Se citar uma CONTA da lista (geralmente junto de "pix"/"transferência"/banco), originKind="account" e originName = nome EXATO da lista de contas. IMPORTANTE: nome de pessoa/empresa EXTERNA (que foi pra description) NUNCA é origem, mesmo aparecendo perto de "pix" ou "transferência". Sem menção de conta/cartão real do usuário, ambos null.',
  ];
}

function rulesInvest(investmentsLabel: string, accountsLabel: string): string[] {
  return [
    'Regras de aporte (só valem quando intent="invest"):',
    '- invest.amount: valor decimal em string (ex.: "100" ou "100.50"). null se não houver valor — NUNCA invente.',
    `- invest.investmentName: nome MAIS PRÓXIMO dentre os investimentos do usuário: [${investmentsLabel}]. null se não citar nenhum.`,
    `- invest.accountName: conta de onde sai o dinheiro, se citada — nome EXATO de [${accountsLabel}]. null se não citar (o app usa a conta default).`,
  ];
}

function rulesQuery(categoriesLabel: string, cardsLabel: string): string[] {
  return [
    'Regras de pergunta (só valem quando intent="query"):',
    '- queryType: "spent" (quanto gastou), "received" (quanto recebeu), "balance" (saldo das contas), "category_total" (quanto gastou numa categoria específica — preencha categoryName), "top_categories" (quais categorias tiveram maior gasto), "card_invoice" (fatura de um cartão específico — preencha cardName), "unpaid" (quanto falta pagar / previsto) ou "investments" (quais investimentos tem / posição / total investido).',
    `- categoryName (só relevante para queryType="category_total"): nome MAIS PRÓXIMO dentre a lista de categorias do usuário: [${categoriesLabel}]. null se não citar categoria ou o queryType for outro.`,
    `- cardName (só relevante para queryType="card_invoice"): nome MAIS PRÓXIMO dentre a lista de cartões do usuário: [${cardsLabel}]. null se não citar cartão ou o queryType for outro.`,
    '- period: "this_month" (padrão — sem período mencionado, ou mês atual), "last_month" (mês passado), "this_year" (esse ano/ano todo). Para queryType="investments" use "this_month" (período é ignorado).',
  ];
}

/**
 * Rodapé com as listas reais do usuário (contas/cartões/investimentos/
 * pagadores conhecidos) — outro bloco duplicado nos 3 prompts. Flags opcionais
 * porque nem todo prompt usa todas as listas: IMAGEM não classifica `invest`
 * (sem `investmentsLabel`) e, no caminho enxuto, também não usa a lista de
 * pagadores conhecidos (docs/30-TELEGRAM.md, "Parsing por IA (lançamento via
 * FOTO)" — menos tokens, leitura mais rápida de fotos simples).
 */
function contextBlock(ctx: AiParserContext, options: { includeInvestments: boolean; includeMerchants: boolean }): string[] {
  const accountsLabel = labelOrPlaceholder(ctx.accountNames, "(nenhuma cadastrada)");
  const cardsLabel = labelOrPlaceholder(ctx.cardNames, "(nenhum cadastrado)");

  const lines = [`Contas do usuário: [${accountsLabel}]`, `Cartões do usuário: [${cardsLabel}]`];

  if (options.includeInvestments) {
    const investmentsLabel = labelOrPlaceholder(ctx.investmentNames, "(nenhum cadastrado)");
    lines.push(`Investimentos do usuário: [${investmentsLabel}]`);
  }
  if (options.includeMerchants) {
    lines.push(`Pagadores/recebedores conhecidos do usuário (descrição → categoria mais usada): [${knownMerchantsLabel(ctx.knownMerchants)}]`);
  }

  return lines;
}

function buildPrompt(rawText: string, ctx: AiParserContext): string {
  const categoriesLabel = labelOrPlaceholder(ctx.categoryNames, "(nenhuma cadastrada)");
  const accountsLabel = labelOrPlaceholder(ctx.accountNames, "(nenhuma cadastrada)");
  const cardsLabel = labelOrPlaceholder(ctx.cardNames, "(nenhum cadastrado)");
  const investmentsLabel = labelOrPlaceholder(ctx.investmentNames, "(nenhum cadastrado)");

  return [
    "Você processa uma mensagem (pt-BR) enviada por um usuário a um bot do Telegram de finanças pessoais.",
    `Data de referência ("hoje"): ${ctx.todaySaoPaulo} (America/Sao_Paulo).`,
    "",
    ...INTENT_CLASSIFICATION,
    "",
    ...rulesLaunch(categoriesLabel),
    "",
    ...rulesInvest(investmentsLabel, accountsLabel),
    "",
    ...rulesQuery(categoriesLabel, cardsLabel),
    "",
    ...contextBlock(ctx, { includeInvestments: true, includeMerchants: true }),
    "",
    `Mensagem do usuário: "${rawText}"`,
  ].join("\n");
}

/**
 * Prompt da extração via VLM (docs/30-TELEGRAM.md, "Parsing por IA
 * (lançamento via FOTO)") — modelo primário `document-vision` (NVIDIA,
 * `nemotron-nano-12b-v2-vl`, ver `models.ts`), fallback Gemini automático via
 * `extractStructured`. A imagem pode ser um recibo/nota fiscal, um
 * comprovante de Pix/transferência, uma notificação push do banco/cartão, a
 * tela de detalhe da compra no app do cartão, OU um print com VÁRIAS dessas
 * notificações/comprovantes empilhados — TODOS os lançamentos reconhecidos
 * viram um item de `transactions[]` (1 item se a imagem só tiver 1
 * lançamento; array vazio se não houver nenhum). Mantém type/amount/
 * description/date/paymentMethod/originKind/originName por ITEM (bem
 * diferentes do texto/voz, por isso NÃO reusa `rulesLaunch`). PROMPT ENXUTO
 * DE PROPÓSITO: sem intent (imagem só faz register), sem a prosa de "regras
 * de categoria" (produtos/loja generalista/merchant canônico) e sem a lista
 * de ~40 pagadores conhecidos — só uma linha simples de categoryName contra
 * os nomes de categoria (menos contexto = leitura mais rápida e confiável,
 * ver `telegram-design-principle` memory). `caption` (texto que o usuário
 * mandou junto da foto, opcional) vira dica extra no fim do prompt.
 */
function buildImagePrompt(caption: string | null, ctx: AiParserContext): string {
  const categoriesLabel = labelOrPlaceholder(ctx.categoryNames, "(nenhuma cadastrada)");

  const lines = [
    "Você extrai lançamentos financeiros pessoais (pt-BR) de uma IMAGEM enviada por um usuário a um bot do Telegram.",
    "A imagem pode conter UM lançamento OU VÁRIOS — ex.: print de UMA notificação de compra (1 lançamento) ou print com VÁRIAS notificações/comprovantes empilhados na mesma tela (um lançamento por notificação). Extraia TODOS os lançamentos que aparecerem, um item POR lançamento em `transactions[]`. Se a imagem trouxer só 1, o array tem 1 item. Se não houver NENHUM lançamento reconhecível, retorne `transactions: []` — NUNCA invente um item.",
    "Cada lançamento pode vir em QUALQUER um destes formatos — trate como válido quando houver valor + estabelecimento/comércio:",
    '  1) recibo/nota fiscal de compra;',
    '  2) comprovante de Pix/transferência;',
    '  3) notificação push do banco/cartão (print) — ex.: "Compra no crédito aprovada — Compra de R$ 67,89 APROVADA em FILIAL ELDORA para o cartão com final 7547.";',
    '  4) TELA DE DETALHE da compra no app do banco/cartão (ex.: Nubank, Inter, C6) — UI escura/clara com logo do estabelecimento, valor grande "R$ 30,45", data por extenso ("Quarta-feira, 8 de julho de 2026, 20:00"), badge "Compra à vista"/"Parcelado", campos "Estabelecimento", "Dado original" (ex.: "99food *Predileto S Sa") e "Cartão virtual .... 7547". ESSA tela É um lançamento — NÃO descarte só porque não é recibo de papel nem push.',
    `Data de referência ("hoje"): ${ctx.todaySaoPaulo} (America/Sao_Paulo).`,
    "",
    "Para CADA item de `transactions`, preencha:",
    '- type: INCOME quando o dinheiro ENTRA pro usuário (recebimento, Pix recebido, depósito); EXPENSE quando o dinheiro SAI (compra aprovada, pagamento, Pix enviado, compra à vista no cartão). Assuma EXPENSE quando ambíguo — a maioria das telas de cartão/recibo é gasto.',
    '- amount: valor TOTAL da compra exatamente como aparece (o valor grande "R$ …", ou "aprovado"/"pago") DESSE item, em string decimal com PONTO (ex.: "30.45"), sem símbolo de moeda. Se esse item específico NÃO mostrar nenhum valor numérico legível, retorne null pra ele — NUNCA invente um valor.',
    '- description: o ESTABELECIMENTO/comércio citado (ex.: "99 Food", "FILIAL ELDORA"), poucas palavras. Em tela de detalhe do cartão, prefira o nome do estabelecimento; se estiver genérico/vazio, use o "Dado original" (ex.: "99food *Predileto S Sa") como descrição. Pessoa/empresa EXTERNA (destinatário de um Pix) vai na descrição, nunca é origem.',
    "- date: se esse item mostrar a data/hora do lançamento (incluindo por extenso em pt-BR), resolva pro formato YYYY-MM-DD. Sem nenhuma data visível, retorne null (o sistema assume hoje).",
    `- categoryName: escolha o nome mais próximo desta lista de categorias do usuário: [${categoriesLabel}], ou null.`,
    '- paymentMethod: "credit" quando esse item mostrar compra no cartão de crédito, "Cartão virtual", "Compra à vista"/"Parcelado" no app do cartão, ou "crédito"; "debit" (débito); "pix"; "transfer" (TED/DOC/transferência); "cash" (dinheiro). Sem menção clara, retorne null.',
    `- originKind/originName: só preencha se o NOME (não o número) de uma conta ou cartão REAL do usuário aparecer nesse item da imagem OU na legenda (ver abaixo), batendo com um item das listas. Menções como "cartão com final 7547" / ".... 7547" NÃO bastam — o app não guarda os últimos dígitos. Nesse caso deixe originKind/originName null.`,
    ...contextBlock(ctx, { includeInvestments: false, includeMerchants: false }),
  ];

  if (caption) {
    lines.push(
      "",
      `IMPORTANTE — o usuário escreveu esta legenda junto da foto: "${caption}".`,
      "DECIDA o papel da legenda (aplica a TODOS os itens que ela puder ajudar a identificar):",
      `  - Se a legenda (ou parte dela) bater com o NOME de um cartão/conta das listas acima (ex.: "Crédito pessoal" = cartão cadastrado "Crédito pessoal"), use como ORIGEM: originName = esse nome, originKind = "card" ou "account" conforme a lista, e paymentMethod = "credit" se for cartão (ou o canal citado na legenda, ex. "pix Nubank"). NÃO use esse texto como categoryName.`,
      "  - Se a legenda descrever o PRODUTO/serviço (ex.: \"Açaí delivery\", \"Imposto TFE\"), aí sim ela influencia description/categoria do item ao qual se aplica:",
      "      · COMBINE \"Pagador - Produto\" quando o estabelecimento desse item agrega info nova.",
      "      · Use SÓ a legenda quando o pagador desse item for ruído/redundante.",
      "  - NUNCA force categoryName = legenda só porque a legenda existe — categoria vem do estabelecimento/produtos da imagem, salvo quando a legenda é claramente um produto/serviço (não um nome de cartão/conta).",
    );
  }

  return lines.join("\n");
}

/**
 * Prompt pra nota de voz — mesmos blocos de regra do texto (`rulesLaunch`/
 * `rulesInvest`/`rulesQuery`/`contextBlock`), só o preâmbulo muda pra pedir
 * transcrição mental do áudio (docs/30-TELEGRAM.md, "Parsing por IA (nota de
 * VOZ / áudio)"). Gemini 2.5 Flash entende áudio nativo (`audio/ogg`); não há
 * STT separado.
 */
function buildVoicePrompt(ctx: AiParserContext): string {
  const categoriesLabel = labelOrPlaceholder(ctx.categoryNames, "(nenhuma cadastrada)");
  const accountsLabel = labelOrPlaceholder(ctx.accountNames, "(nenhuma cadastrada)");
  const cardsLabel = labelOrPlaceholder(ctx.cardNames, "(nenhum cadastrado)");
  const investmentsLabel = labelOrPlaceholder(ctx.investmentNames, "(nenhum cadastrado)");

  return [
    "Você processa uma NOTA DE VOZ (pt-BR) enviada por um usuário a um bot do Telegram de finanças pessoais.",
    "Transcreva mentalmente o áudio e classifique/extraia como se fosse texto digitado.",
    `Data de referência ("hoje"): ${ctx.todaySaoPaulo} (America/Sao_Paulo).`,
    "",
    ...INTENT_CLASSIFICATION,
    "",
    ...rulesLaunch(categoriesLabel),
    "",
    ...rulesInvest(investmentsLabel, accountsLabel),
    "",
    ...rulesQuery(categoriesLabel, cardsLabel),
    "",
    ...contextBlock(ctx, { includeInvestments: true, includeMerchants: true }),
  ].join("\n");
}

/**
 * Valida a saída bruta do Gemini contra `aiResponseSchema` e mapeia pro shape
 * final `AiParsedTransaction` — usado como `parseResponse` de `callGemini`
 * nos caminhos de transação (texto, imagem e voz). `null` quando o shape não
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
    invest: parsed.data.invest
      ? {
          amount: parsed.data.invest.amount ?? null,
          investmentName: parsed.data.invest.investmentName ?? null,
          accountName: parsed.data.invest.accountName ?? null,
        }
      : null,
    createCategory: parsed.data.createCategory
      ? {
          categoryName: parsed.data.createCategory.categoryName ?? null,
          parentName: parsed.data.createCategory.parentName ?? null,
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

/** `extractStructured` cobre NVIDIA (primário) + retry + fallback Gemini automático — 30s dá folga pro pior caso (retry do primário + fallback), abaixo do `maxDuration` serverless do webhook. */
const IMAGE_EXTRACT_TIMEOUT_MS = 30000;

/**
 * Extração via camada de IA nova (`role: "document-vision"` — NVIDIA
 * `nemotron-nano-12b-v2-vl`, fallback Gemini automático, ver `models.ts`) a
 * partir de uma FOTO de nota/comprovante/notificação (docs/30-TELEGRAM.md —
 * bot aceita foto, "Parsing por IA (lançamento via FOTO)"). A imagem pode ter
 * 1 OU VÁRIOS lançamentos (ex.: print com várias notificações empilhadas) —
 * retorna um `AiParsedTransaction[]`, um item por lançamento reconhecido.
 * Array VAZIO em qualquer falha (extração indisponível/timeout/shape
 * inválido) OU quando a imagem genuinamente não tem nenhum lançamento —
 * DIFERENTE do texto, aqui não existe fallback determinístico (não dá pra
 * "regex" uma imagem); o chamador (`handlers.ts`, `handleImageEntry`)
 * responde pedindo pra reenviar a foto ou digitar o lançamento quando o array
 * vem vazio. NUNCA loga os bytes da imagem nem a API key.
 */
export async function parseTransactionFromImage(
  imageBytes: Buffer,
  mimeType: string,
  caption: string | null,
  ctx: AiParserContext,
): Promise<AiParsedTransaction[]> {
  const transactions = await extractStructured(
    "document-vision",
    { kind: "vision", bytes: imageBytes, mimeType },
    buildImagePrompt(caption, ctx),
    IMAGE_RESPONSE_SCHEMA,
    parseImageTransactionsResponse,
    { timeoutMs: IMAGE_EXTRACT_TIMEOUT_MS },
  );

  return transactions ?? [];
}

/** Timeout maior pra voz — áudio + structured output costuma passar de 8s. */
const VOICE_GEMINI_TIMEOUT_MS = 20000;

/**
 * Extração via Gemini a partir de NOTA DE VOZ (OGG Opus). Mesmo schema do
 * texto (inclui intent/query). `null` em falha — sem fallback regex; o
 * caller pede pra digitar. NUNCA loga bytes do áudio nem a API key.
 */
export async function parseTransactionFromVoice(
  audioBytes: Buffer,
  mimeType: string,
  ctx: AiParserContext,
): Promise<AiParsedTransaction | null> {
  return callGemini(
    [
      {
        parts: [
          { inlineData: { mimeType, data: audioBytes.toString("base64") } },
          { text: buildVoicePrompt(ctx) },
        ],
      },
    ],
    "voice",
    RESPONSE_SCHEMA,
    parseAiTransactionResponse,
    VOICE_GEMINI_TIMEOUT_MS,
  );
}
