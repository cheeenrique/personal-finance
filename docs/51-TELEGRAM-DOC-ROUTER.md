# 51 — Telegram: Router de Documentos (assistente financeiro)

**Status:** planejado. Fazer **depois** da feature de financiamento (Stages 1-5).
Data do plano: 2026-07-08.

Transformar o bot num assistente que aceita **qualquer coisa** (foto, print de
notificação, PDF, comprovante Pix, extrato OFX, texto) → classifica → extrai →
confirma → salva na ação certa.

## Decisão-base: multimodal, não OCR
Hoje o app manda a **imagem/PDF original** pro Gemini 2.5 Flash via `inlineData`
(base64), sem OCR (`ai-parser.ts` `parseTransactionFromImage` → `callGemini`).
**Manter multimodal** — Gemini lê layout/tabela/carimbo que OCR+texto perde, e
evita erro acumulado. PDF entra igual (`mimeType: application/pdf`).

## Arquitetura: classificar → rotear → extrair
**2 chamadas ao Gemini** (classificar genérico → extrair especializado). Custo/
latência irrelevante pra 2 usuários (~2-4s). Reusa o `callGemini` parametrizado
que o Stage 3 do financiamento já criou.

**1ª chamada — classificador** retorna `{ tipo, confianca }`:
`comprovante_pix | recibo_maquininha | nota_fiscal | cupom_fiscal | fatura_cartao | boleto | extrato | contrato | desconhecido`.

**2ª chamada — extrator do tipo**, e cada tipo ROTEIA pra uma ação:
| Tipo | Ação no app |
|---|---|
| pix / recibo_maquininha / cupom / nota | 1 transação (despesa/receita) |
| boleto | 1 transação PREVISTA (isPaid=false, com vencimento) |
| fatura_cartao | itens da fatura do cartão |
| extrato (imagem/PDF) | várias transações (multi-extract) |
| contrato | feature de financiamento (parser do Stage 3) |
| desconhecido | pede esclarecimento |

O que interessa pro app sempre reduz a **valor, contraparte, data, categoria,
tipo, conta/cartão**. Extras por tipo (id Pix, CNPJ, itens do cupom) → `notes`
ou ignorar no MVP.

## Confiança + validação + confirmação
- Toda extração retorna `confianca` (0-1).
- **Validação antes de salvar**: valor é número > 0? data válida e plausível
  (não 1900/2099)? categoria resolve? moeda BRL? Falhou → pede confirmação.
- **Gate de confiança**: `< 0.8` → bot pergunta antes de salvar ("Identifiquei
  R$59,90 na Padaria Central, mas não tenho certeza. Confirma?"); `≥ 0.8` →
  salva e oferece desfazer.
- **Confirmação por BOTÕES INLINE** do Telegram (Salvar / Editar / Cancelar,
  callback_query). Hoje o webhook só trata texto/foto — adicionar
  `callback_query` no `app/api/telegram/route.ts` + handlers.

## Reusa o que já existe (não reinventar)
- `extrato` (arquivo OFX) → importador OFX já pronto (`modules/imports`).
- `contrato` → parser de financiamento (Stage 3).
- `fatura_cartao` → fatura do cartão.

## Fases
- **F-A** (espinha): classificador + `confianca` + validação + confirmação por
  botões inline. Migra o webhook pra tratar `callback_query`.
- **F-B**: handlers especializados (pix/cupom/recibo/nota → transação; boleto →
  previsto). Prompts por tipo.
- **F-C**: multi (extrato imagem → várias transações) + fatura cartão.

## Notas de implementação
- `callGemini` já parametrizado (schema + validador) pelo Stage 3 do financiamento.
- Nunca logar conteúdo do documento nem a `GEMINI_API_KEY`.
- Ingestão de `message.document` (PDF) no webhook — hoje só `message.photo`
  (`telegram-api.ts downloadPhoto`); adicionar `downloadDocument`.
