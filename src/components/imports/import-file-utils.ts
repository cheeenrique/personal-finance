import { CategoryType, TransactionType } from "@/generated/prisma/enums";
import { normalizeWord } from "@/modules/telegram/normalize";
import type { ImportPreviewItem, ParsedTransaction } from "@/modules/imports/types";
import type { ImportFileEntry } from "./import-types";

/** Extensões aceitas pelo dropzone — espelha `modules/imports/parsers/index.ts` (`.xls` é aceito e enviado; o backend devolve erro claro pro binário legado, não bloqueamos no client). */
export const ACCEPTED_EXTENSIONS = [".ofx", ".csv", ".xls", ".xlsx", ".pdf"] as const;

/** Extensões binárias — lidas via `file.arrayBuffer()` + base64 em vez de `file.text()` (XLSX/PDF não são texto; `parsers/index.ts` espera base64 pra esses formatos). */
const BINARY_EXTENSIONS = [".xls", ".xlsx", ".pdf"];

function normalizedName(fileName: string): string {
  return fileName.trim().toLowerCase();
}

export function isSupportedImportFile(fileName: string): boolean {
  const lower = normalizedName(fileName);
  return ACCEPTED_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function isBinaryImportFile(fileName: string): boolean {
  const lower = normalizedName(fileName);
  return BINARY_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export function isPdfImportFile(fileName: string): boolean {
  return normalizedName(fileName).endsWith(".pdf");
}

/** `ArrayBuffer` → base64 sem passar por `FileReader` (a `data:` URL do `FileReader` traria o prefixo `data:<mime>;base64,` junto). */
async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

/** OFX/CSV são texto (`file.text()`); XLS/XLSX/PDF é binário (base64) — cada parser em `modules/imports/parsers/` espera o encoding certo pro seu formato. */
export function readEntryContent(file: File): Promise<string> {
  return isBinaryImportFile(file.name) ? fileToBase64(file) : file.text();
}

/** Entrada inicial de um arquivo recém-solto/selecionado — extensão inválida já nasce em erro, sem chamar o backend. */
export function buildFileEntry(file: File): ImportFileEntry {
  const supported = isSupportedImportFile(file.name);

  return {
    id: crypto.randomUUID(),
    file,
    name: file.name,
    size: file.size,
    status: supported ? "reading" : "error",
    content: null,
    error: supported ? null : "Formato não suportado — use OFX, CSV, XLS, XLSX ou PDF.",
    hasPassword: false,
    password: "",
    preview: null,
    parsed: null,
    previewError: null,
    commit: null,
    commitError: null,
    novosParsedIndexes: null,
    categoryOverrides: [],
  };
}

/**
 * Casa cada item de `preview.novos` (subsequência sem duplicatas, MESMA ordem
 * relativa) com seu índice em `parsed` (array completo devolvido por
 * `previewImportAction`, inclui duplicatas — `modules/imports/service.ts`
 * `previewImport`). Casa por igualdade dos 4 campos espelhados em
 * `ImportPreviewItem` (data/valor/tipo/descrição), andando os dois arrays com
 * 2 ponteiros — nunca ambíguo mesmo com linhas de valores idênticos, porque
 * cada `novos[i]` consome o próximo `parsed` que bate a partir de onde o
 * anterior parou.
 */
export function mapNovosToParsedIndexes(
  novos: ImportPreviewItem[],
  parsed: ParsedTransaction[],
): number[] {
  const indexes: number[] = [];
  let cursor = 0;

  for (const item of novos) {
    while (
      cursor < parsed.length &&
      !(
        parsed[cursor].date.getTime() === item.date.getTime() &&
        parsed[cursor].amount === item.amount &&
        parsed[cursor].type === item.type &&
        parsed[cursor].description === item.description
      )
    ) {
      cursor += 1;
    }
    indexes.push(cursor);
    cursor += 1;
  }

  return indexes;
}

/**
 * Injeta o `categoryId` escolhido na prévia (Refino 3) nos itens de `parsed`
 * antes do commit — usa `novosParsedIndexes` pra saber qual posição de `parsed`
 * cada override (`categoryOverrides`, mesmo índice de `preview.novos`)
 * corresponde. Itens fora do mapeamento (duplicatas, nunca mostradas na
 * prévia) seguem sem `categoryId`, como hoje.
 */
export function applyCategoryOverrides(
  parsed: ParsedTransaction[],
  novosParsedIndexes: number[] | null,
  categoryOverrides: (string | null)[],
): ParsedTransaction[] {
  if (!novosParsedIndexes || novosParsedIndexes.length === 0) return parsed;

  const overrideByParsedIndex = new Map(
    novosParsedIndexes.map((parsedIndex, novosIndex) => [parsedIndex, categoryOverrides[novosIndex] ?? null]),
  );

  return parsed.map((item, index) =>
    overrideByParsedIndex.has(index) ? { ...item, categoryId: overrideByParsedIndex.get(index) } : item,
  );
}

/**
 * Sentinela pro override "criar categoria nova" — `categoryOverrides[i]` (Refino "Criar
 * categoria no import") guarda um id real de categoria, `null` ("Sem categoria") ou este
 * sentinela + o nome sugerido pela IA quando o usuário ainda não tem uma categoria equivalente
 * (`use-import-files.ts` `analyze()`). Prefixo nunca colide com um `cuid` real do Prisma.
 */
const CREATE_CATEGORY_PREFIX = "__create__:";

export function createCategoryOverrideValue(name: string): string {
  return `${CREATE_CATEGORY_PREFIX}${name}`;
}

export function isCreateCategoryOverride(value: string): boolean {
  return value.startsWith(CREATE_CATEGORY_PREFIX);
}

export function categoryNameFromOverride(value: string): string {
  return value.slice(CREATE_CATEGORY_PREFIX.length);
}

/** Tipo de categoria (`CategoryType`) equivalente ao tipo do lançamento (`ImportTransactionType`) — mesmos valores string ("INCOME"/"EXPENSE"), só troca o tipo TS pro que `createCategoryAction` espera. */
function toCategoryType(type: TransactionType): CategoryType {
  return type === TransactionType.INCOME ? CategoryType.INCOME : CategoryType.EXPENSE;
}

/** Chave de dedup pra "categorias a criar" — nome normalizado (case/acento-insensível, mesma regra de `matchCategoryByName` em `modules/imports/service.ts`) + tipo, porque o mesmo nome pode existir em Receita E Despesa (ex.: "Reembolso"). */
function buildCreateCategoryKey(name: string, type: CategoryType): string {
  return `${normalizeWord(name)}:${type}`;
}

/**
 * Junta as sugestões "Criar: <nome>" (sentinela `CREATE_CATEGORY_PREFIX`) de TODOS os itens de
 * TODOS os arquivos já analisados, dedup por nome+tipo — se 3 itens (mesmo em arquivos
 * diferentes) pedem "Alimentação" (Despesa), só 1 categoria é criada (`use-import-files.ts`
 * `confirm()` chama `createCategoryAction` uma vez por entrada deste mapa).
 */
export function collectCategoriesToCreate(
  entries: ImportFileEntry[],
): Map<string, { name: string; type: CategoryType }> {
  const toCreate = new Map<string, { name: string; type: CategoryType }>();

  for (const entry of entries) {
    if (!entry.preview) continue;
    entry.categoryOverrides.forEach((override, index) => {
      if (!override || !isCreateCategoryOverride(override)) return;
      const itemType = entry.preview!.novos[index]?.type;
      if (!itemType) return;

      const name = categoryNameFromOverride(override);
      const type = toCategoryType(itemType);
      const key = buildCreateCategoryKey(name, type);
      if (!toCreate.has(key)) toCreate.set(key, { name, type });
    });
  }

  return toCreate;
}

/**
 * Resolve os overrides "Criar: <nome>" de UM arquivo pro `categoryId` recém-criado
 * (`createdIdByKey`, vindo de `collectCategoriesToCreate` + `createCategoryAction`,
 * `use-import-files.ts` `confirm()`) — chamado logo antes do commit. Categoria que falhou ao
 * criar (erro-como-dado, sem entrada no mapa) cai em `null`: o item nasce "Sem categoria" em
 * vez de derrubar a importação inteira por causa de 1 categoria.
 */
export function resolveCreateOverrides(
  entry: ImportFileEntry,
  createdIdByKey: Map<string, string>,
): (string | null)[] {
  return entry.categoryOverrides.map((override, index) => {
    if (!override || !isCreateCategoryOverride(override)) return override ?? null;
    const itemType = entry.preview?.novos[index]?.type;
    if (!itemType) return null;

    const name = categoryNameFromOverride(override);
    const key = buildCreateCategoryKey(name, toCategoryType(itemType));
    return createdIdByKey.get(key) ?? null;
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/** Soma de `novos` de UM tipo (INCOME/EXPENSE) — insumo dos 2 blocos "Entradas/Saídas a importar" (`import-preview.tsx`). */
function sumNovosByType(novos: ImportPreviewItem[], type: TransactionType): number {
  return novos.filter((item) => item.type === type).reduce((sum, item) => sum + Number(item.amount), 0);
}

/**
 * Totais agregados de todos os arquivos já analisados — usado nos KPIs do
 * step preview (total/novos/duplicados, handoff "Step preview") + nos 2
 * blocos "Entradas/Saídas a importar" (soma de `novos` por tipo, mesmo motivo
 * de exibir de antemão o impacto no fluxo de caixa antes de confirmar).
 */
export function aggregatePreview(entries: ImportFileEntry[]) {
  return entries.reduce(
    (totals, entry) => {
      if (!entry.preview) return totals;
      return {
        total: totals.total + entry.preview.total,
        novos: totals.novos + entry.preview.novos.length,
        duplicados: totals.duplicados + entry.preview.duplicados,
        incomeTotal: totals.incomeTotal + sumNovosByType(entry.preview.novos, TransactionType.INCOME),
        expenseTotal: totals.expenseTotal + sumNovosByType(entry.preview.novos, TransactionType.EXPENSE),
      };
    },
    { total: 0, novos: 0, duplicados: 0, incomeTotal: 0, expenseTotal: 0 },
  );
}

/** Totais agregados de todos os arquivos já confirmados — usado no KPI do step result. */
export function aggregateCommit(entries: ImportFileEntry[]) {
  return entries.reduce(
    (totals, entry) => {
      if (!entry.commit) return totals;
      return {
        imported: totals.imported + entry.commit.imported,
        duplicados: totals.duplicados + entry.commit.duplicados,
        erros: totals.erros + entry.commit.erros.length,
      };
    },
    { imported: 0, duplicados: 0, erros: 0 },
  );
}
