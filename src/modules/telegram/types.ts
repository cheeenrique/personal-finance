export type TelegramTransactionType = "INCOME" | "EXPENSE";

/**
 * Comando tipado resolvido pelo parser (docs/30-TELEGRAM.md, "Comandos" +
 * "Regras de Parsing"). `keywordCandidates` são as palavras candidatas a
 * bater com o nome de uma categoria do usuário — palavra explícita extra
 * (ex.: "restaurante" em "almoço 45 restaurante") vem antes da descrição na
 * lista, porque uma palavra explícita é mais confiável que a descrição
 * genérica (ver `resolve.ts`, `matchByKeyword`).
 */
export type ParsedCommand =
  | {
      kind: "create_transaction";
      type: TelegramTransactionType;
      amount: string;
      description: string;
      keywordCandidates: string[];
    }
  | { kind: "query_balance" }
  | { kind: "query_month_expenses" }
  | { kind: "query_today" }
  | { kind: "unknown" };

/**
 * Botão inline do Telegram (`InlineKeyboardButton`) — tipagem mínima pra
 * `reply_markup` sem acoplar o domínio à Bot API inteira.
 */
export type TelegramInlineButton = { text: string; callback_data: string };

/** Teclado inline opcional anexado a uma resposta (fluxo híbrido médio). */
export type TelegramReplyMarkup = { inline_keyboard: TelegramInlineButton[][] };

/**
 * Resultado de executar um comando: texto de resposta pro usuário + código
 * curto pro log (`chat_id=X -> resultCode`). O log NUNCA usa `text` — só
 * `resultCode` (docs/30-TELEGRAM.md, "Segurança": nunca logar corpo da
 * mensagem nem valores monetários). `replyMarkup` opcional — confirmação
 * pós-save e pergunta de origem com botões (docs/30-TELEGRAM.md, híbrido).
 */
export type CommandResult = {
  text: string;
  resultCode: string;
  replyMarkup?: TelegramReplyMarkup;
};

/** Origem citada numa mensagem de lançamento livre — "cartão X" vs "conta X" (ver `ai-parser.ts`/`resolve.ts`). */
export type TelegramOriginKind = "account" | "card";

/** Origem já resolvida pra um `accountId`/`cardId` real do usuário, com label pronto pra exibição na confirmação (ver `reply.ts`). */
export type TelegramOrigin =
  | { kind: "account"; id: string; label: string }
  | { kind: "card"; id: string; label: string };

/**
 * Canal usado no lançamento (docs/30-TELEGRAM.md, "paymentMethod") — refina
 * `originKind`/`originName`: "credit" só resolve pra CARTÃO, os demais só pra
 * CONTA (ver `resolve.ts`, `expectedOriginKind`). `null` quando a mensagem não
 * menciona nenhum canal (ambíguo — aceita conta OU cartão no match).
 */
export type TelegramPaymentMethod = "credit" | "debit" | "pix" | "transfer" | "cash";

/**
 * Intenção classificada pela IA pra mensagem de texto livre (docs/30-TELEGRAM.md,
 * "Consulta por IA"): "register" (lançamento, fluxo já existente), "query"
 * (pergunta sobre as finanças do usuário — ver `TelegramQueryParsed`) ou
 * "unknown" (nem um nem outro). A extração por IMAGEM nunca classifica intent
 * (foto continua só register) — `AiParsedTransaction.intent` vem `undefined`
 * nesse caminho; `handlers.ts` cai no default `isTransaction ? "register" :
 * "unknown"` quando ausente.
 */
/**
 * "invest" = aporte em produto cadastrado em `/investments` (docs/28-INVESTMENTS.md
 * + docs/30-TELEGRAM.md) — não é lançamento genérico nem consulta.
 */
export type TelegramIntent = "register" | "query" | "invest" | "unknown";

/** Tipo de pergunta reconhecido pela IA (docs/30-TELEGRAM.md, "Consulta por IA") — mapeado 1:1 pro executor (`query.ts`, `executeTelegramQuery`). */
export type TelegramQueryType =
  | "spent"
  | "received"
  | "balance"
  | "category_total"
  | "top_categories"
  | "card_invoice"
  | "unpaid"
  | "investments";

/** Período do range da consulta — "this_month" é o default quando a mensagem não menciona período (ver `ai-parser.ts`). */
export type TelegramQueryPeriod = "this_month" | "last_month" | "this_year";

/**
 * Saída estruturada da IA pra uma mensagem classificada como `intent="query"`
 * (docs/30-TELEGRAM.md, "Consulta por IA"). `categoryName`/`cardName` só são
 * relevantes pros `queryType`s que os usam (`category_total`/`card_invoice`,
 * respectivamente) — `null` nos demais casos.
 */
export type TelegramQueryParsed = {
  queryType: TelegramQueryType;
  period: TelegramQueryPeriod;
  categoryName: string | null;
  cardName: string | null;
};

/**
 * Payload de aporte via Telegram (`intent="invest"`) — valor + nome do
 * produto (Asset INVESTMENT) + conta opcional (default = conta ativa).
 */
export type TelegramInvestParsed = {
  amount: string | null;
  investmentName: string | null;
  accountName: string | null;
};

/**
 * Resultado tipado de executar uma consulta (`query.ts`,
 * `executeTelegramQuery`) — formatado em texto por `reply.ts`
 * (`buildQueryReply`). Estados de "não encontrado"/"ambíguo" são resultados
 * válidos (categoria/cartão citado pela IA não bate com nada real do
 * usuário), nunca exceptions — erros são dados
 * (~/.claude/rules/06-composition-errors.md).
 */
export type TelegramQueryResult =
  | { kind: "spent"; total: string; period: TelegramQueryPeriod }
  | { kind: "received"; total: string; period: TelegramQueryPeriod }
  | { kind: "unpaid"; total: string; period: TelegramQueryPeriod }
  | { kind: "balance"; total: string }
  | { kind: "category_total"; categoryName: string; total: string; period: TelegramQueryPeriod }
  | { kind: "category_not_found"; categoryName: string }
  | { kind: "top_categories"; categories: Array<{ name: string; total: string }>; period: TelegramQueryPeriod }
  | { kind: "card_invoice"; cardName: string; total: string; dueDate: Date }
  | { kind: "card_not_found"; cardName: string }
  | { kind: "card_ambiguous"; candidates: string[] }
  | { kind: "card_no_invoice"; cardName: string }
  | {
      kind: "investments";
      items: Array<{ name: string; currentValue: string; yieldPercentOfBenchmark: string | null }>;
      total: string;
    };

/**
 * Saída estruturada do parsing por IA (docs/30-TELEGRAM.md, "Parsing por
 * IA") — já validada contra `aiResponseSchema` (zod) em `ai-parser.ts`.
 * `isTransaction=false` quando a mensagem não é um lançamento (saudação,
 * pergunta etc.). `amount` vem `null` quando a mensagem não menciona nenhum
 * valor (docs/30-TELEGRAM.md, "Fluxo conversacional" — vira pergunta, nunca
 * um valor inventado). `date`/`categoryName`/`paymentMethod`/`originKind`/
 * `originName` vêm `null` quando a mensagem não menciona o respectivo dado —
 * resolução determinística (data default = hoje, categoria = fallback) fica
 * por conta do chamador (`draft.ts`), nunca da IA. `intent`/`query`: ver
 * `TelegramIntent`/`TelegramQueryParsed` acima — só preenchidos na extração
 * por TEXTO (`parseTransactionWithAI`), nunca na de imagem.
 */
export type AiParsedTransaction = {
  isTransaction: boolean;
  type: TelegramTransactionType;
  amount: string | null;
  description: string;
  date: string | null;
  categoryName: string | null;
  paymentMethod: TelegramPaymentMethod | null;
  originKind: TelegramOriginKind | null;
  originName: string | null;
  intent?: TelegramIntent;
  query?: TelegramQueryParsed | null;
  /** Só preenchido quando `intent="invest"` (aporte em investimento). */
  invest?: TelegramInvestParsed | null;
};

/** Campo obrigatório ainda faltando num lançamento em progresso (docs/30-TELEGRAM.md, "Fluxo conversacional"). Categoria nunca entra aqui — sempre tem fallback ("Outros"/"Outros (Receita)"), nunca bloqueia. */
export type TelegramMissingField = "amount" | "origin";

/**
 * Resultado de casar o texto de origem citado (IA ou resposta de pending)
 * contra contas/cartões REAIS e ATIVOS do usuário (`resolve.ts`,
 * `resolveOriginStrict` — docs/30-TELEGRAM.md, bug fix "match por contém" +
 * ambiguidade): "resolved" = exatamente 1 candidato bateu; "ambiguous" = mais
 * de um bateu (ex.: "Nubank" batendo em "Nubank - Pessoal" E "Nubank - MEI")
 * — o chamador (`draft.ts`) pergunta qual, listando `candidates`; "none" =
 * nada bateu (ou não havia origem nenhuma pra tentar casar).
 */
export type OriginMatchResult =
  | { status: "resolved"; origin: TelegramOrigin }
  | { status: "ambiguous"; candidates: TelegramOrigin[] }
  | { status: "none" };

/** Um item do array `message.photo` do Telegram — do menor pro maior (thumb→full). */
export type TelegramPhotoSize = { file_id: string; width: number; height: number };

/**
 * Foto já detectada/normalizada de um update (docs/30-TELEGRAM.md — extração
 * por Gemini vision, ver `photo.ts`): `fileId` da MAIOR resolução disponível +
 * `caption` opcional (texto que o usuário mandou junto da foto), usado como
 * dica extra no prompt (`ai-parser.ts`, `buildImagePrompt`).
 */
export type TelegramPhotoInput = { fileId: string; caption: string | null };

/**
 * Documento já detectado/normalizado de um update (docs/30-TELEGRAM.md —
 * ingestão de DOCUMENTO de financiamento por Gemini, ver `document.ts`):
 * `fileId` do `message.document` + `mimeType` já resolvido (`mime_type` do
 * Telegram quando presente, senão inferido pela extensão do `file_name` —
 * `mime_type` é opcional na Bot API pra documentos). `null` quando a mensagem
 * não tem documento ou quando não dá pra resolver nenhum mimeType.
 */
export type TelegramDocumentInput = { fileId: string; mimeType: string };

/**
 * Nota de voz já detectada (`message.voice`, docs/30-TELEGRAM.md — parsing
 * por áudio via Gemini). Telegram grava OGG Opus; `mimeType` default
 * `audio/ogg`. `durationSeconds` opcional — usado pra rejeitar áudios longos
 * antes de baixar.
 */
export type TelegramVoiceInput = {
  fileId: string;
  durationSeconds: number | null;
  mimeType: string;
};

/**
 * Rascunho de um lançamento em progresso — persistido em
 * `TelegramPendingEntry.draftJson` (Prisma `Json`) enquanto falta valor e/ou
 * origem (docs/30-TELEGRAM.md, "Fluxo conversacional"). Superset serializável
 * de `AiParsedTransaction` sem `isTransaction` (sempre `true` a partir do
 * momento em que vira draft — ver `draft.ts`, `draftFromAi`).
 */
export type TelegramDraft = {
  type: TelegramTransactionType;
  amount: string | null;
  description: string;
  date: string | null;
  categoryName: string | null;
  paymentMethod: TelegramPaymentMethod | null;
  originKind: TelegramOriginKind | null;
  originName: string | null;
};

/** Sistema de amortização identificado num documento de financiamento (`financing-parser.ts`) — mesmos valores do enum Prisma `AmortizationSystem` (`prisma/schema.prisma`, model `Loan`). */
export type ParsedAmortizationSystem = "PRICE" | "SAC" | "CUSTOM";

/** Periodicidade da taxa de juros/CET lida do documento — mesmos valores do enum Prisma `InterestPeriod`. */
export type ParsedInterestPeriod = "MONTHLY" | "ANNUAL";

/** Uma parcela lida da TABELA de parcelas do documento (só presente quando o documento traz valores variáveis — SAC/CUSTOM "lidos prontos", ver `financing-parser.ts`, `buildFinancingPrompt`). */
export type ParsedFinancingInstallment = {
  amount: string;
  dueDate: string;
};

/**
 * Saída estruturada do parsing de um DOCUMENTO de financiamento (CCB/contrato
 * de banco, PDF ou foto) via Gemini (`financing-parser.ts`,
 * `parseFinancingFromDocument`) — já validada contra `parsedFinancingSchema`
 * (zod). Todo campo monetário vem como STRING decimal (ponto decimal, sem
 * separador de milhar) pra não perder precisão antes de virar `Decimal` no
 * Prisma. Todo campo é nullable — o Gemini preenche só o que encontrar no
 * documento; o módulo `loans` (fora do escopo deste parser) decide o que é
 * obrigatório antes de criar o `Loan`. Nomes espelham 1:1 os campos de
 * `prisma/schema.prisma`, model `Loan` (`kind=FINANCING`), pra zero fricção
 * na hora de mapear pro input de criação do módulo `loans`. `installments`
 * só vem preenchido quando o documento traz a tabela de parcelas com valores
 * variáveis (ver `ParsedFinancingInstallment`).
 */
export type ParsedFinancing = {
  description: string | null;
  lender: string | null;
  operationRef: string | null;
  principal: string | null;
  downPayment: string | null;
  assetValue: string | null;
  assetDescription: string | null;
  installmentsCount: number | null;
  installmentAmount: string | null;
  totalToPay: string | null;
  firstDueDate: string | null;
  interestRate: string | null;
  interestPeriod: ParsedInterestPeriod | null;
  cet: string | null;
  amortizationSystem: ParsedAmortizationSystem | null;
  financedTaxes: string | null;
  financedInsurance: string | null;
  financedFees: string | null;
  installments: ParsedFinancingInstallment[] | null;
};
