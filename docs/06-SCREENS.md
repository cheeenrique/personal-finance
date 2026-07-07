# 06 - SCREENS.md

# Telas

Este documento é o brief de implementação de UI. Ele define, para cada tela autenticada do sistema: layout (desktop + mobile), quais componentes ela usa, o que cada componente FAZ nessa tela (funções, comportamentos, estados) e quais dados/Server Actions ela consome.

Não é sobre pixel/espaçamento exato — isso é `04-DESIGN_SYSTEM.md`. Não é sobre regra de comportamento genérica de UX — isso é `05-UX_RULES.md`. Aqui a pergunta é: **o que existe nesta tela e o que cada peça faz**.

Toda tela lida com os 4 estados obrigatórios (loading/empty/error/success — `05-UX_RULES.md`) e com as cores financeiras e de alerta travadas em `04-DESIGN_SYSTEM.md`. Nenhuma tela aqui documentada pode contradizer `03-DATABASE.md` (schema) ou os docs de feature (`1x`-`3x`) — em caso de dúvida, o doc de feature manda sobre o dado, este doc manda sobre a UI.

---

# Shell da Aplicação

Layout base compartilhado por toda rota dentro do grupo autenticado (`(app)/`). `/login` não usa este shell.

## Sidebar (Desktop)

Fixa à esquerda, sempre visível em telas desktop/wide. Nunca aparece em mobile (ver `04-DESIGN_SYSTEM.md`).

**Itens de navegação, nesta ordem:**

```text
Dashboard        → /dashboard
Transações       → /transactions
Contas           → /accounts
Cartões          → /cards
Parcelamentos    → /installments
Orçamentos       → /budgets
Patrimônio       → /assets
Categorias       → /categories
Tags             → /tags
Relatórios       → /reports
Alertas          → /alerts
Configurações    → /settings
```

**Funções:**
- Marca o item ativo com base na rota atual (`usePathname`), estilo visualmente distinto (cor primária azul/fundo destacado — navegação e estrutura usam `--primary`, nunca `--accent`) — nunca cor isolada, sempre cor + peso/indicador (regra "cor nunca é único indicador", `04-DESIGN_SYSTEM.md`).
- Colapsável: botão de colapsar reduz a sidebar a só ícones (com `title`/tooltip no hover mostrando o nome). Estado do colapso persiste em `localStorage`.
- Cada item é navegável via `Tab` e ativável via `Enter`/`Space`.
- Rodapé da sidebar: nome do usuário logado + avatar (link curto pra Configurações).

## Header

Presente em toda tela autenticada, no topo da área de conteúdo.

**Sempre contém, nesta ordem:**
1. Título da rota atual + descrição curta (ex.: "Transações" / "Todas as suas movimentações financeiras").
2. Busca global (abre o Command Palette, `Ctrl+K`).
3. Botão de ação rápida — "+ Nova transação" (cor accent laranja, é uma ação que move dinheiro — não a cor primária de navegação; abre `FormModal`/`FormDrawer` de transação, `Ctrl+N`).
4. Toggle de tema (Light/Dark/System) — aplica imediatamente, sem reload (`12-SETTINGS.md`).
5. Perfil (avatar) — dropdown com "Configurações" e "Sair" (logout, `10-AUTH.md`).

**Funções:**
- Título/descrição são dinâmicos por rota (mapa rota → título/descrição, mantido num só lugar, não hardcoded em cada página).
- Botão de ação rápida abre o mesmo componente usado em qualquer outro ponto do sistema para criar transação (não duplicar modal).
- Não bloqueia navegação: trocar de rota nunca espera o header re-renderizar (Server Components onde possível).

## Bottom Navigation (Mobile)

Substitui a Sidebar em mobile. Nunca ambos ao mesmo tempo.

**Itens (4-5 principais + botão central):**

```text
Dashboard | Transações | [+] | Cartões | Menu
```

- `[+]` é o botão central, destacado (cor accent laranja — mesma lógica do botão do header: ação de criar transação, não navegação), abre direto o `FormDrawer` de nova transação — mesma função do `Ctrl+N`/botão do header no desktop.
- `Menu` abre o Drawer lateral com o restante da navegação (Contas, Parcelamentos, Orçamentos, Patrimônio, Categorias, Tags, Relatórios, Alertas, Configurações) — mesma lista de itens da Sidebar desktop, só que dentro de um Drawer.
- Item ativo destacado (ícone + label), mesma regra de "cor nunca é único indicador" da Sidebar.

## Command Palette (`Ctrl+K`)

Overlay modal, abre de qualquer tela autenticada.

**Funções:**
- Campo de busca com foco automático ao abrir.
- Busca (com debounce ~300ms) em: transações (por descrição), contas, cartões, categorias, tags, patrimônio (assets) — mesma lista do `04-DESIGN_SYSTEM.md`.
- Resultados agrupados por tipo de entidade, com highlight do trecho buscado no texto do resultado.
- Navegação por teclado: `↑`/`↓` move seleção entre resultados, `Enter` abre/navega para a entidade selecionada, `Esc` fecha o palette.
- Seção fixa de "Ações rápidas" sempre visível mesmo sem digitar nada: Nova transação, Nova conta, Novo cartão, Nova categoria, Nova tag, Ir para Dashboard/Transações/Cartões (atalhos `G+D`/`G+T`/`G+C`).
- Enquanto a busca carrega, mostra skeleton de linhas nos resultados (nunca spinner ocupando o modal inteiro).
- Sem resultado: mensagem curta ("Nada encontrado para 'x'") + atalho pra "Nova transação" com a descrição já preenchida (se o texto digitado parecer um lançamento, ex. "mercado 120").

---

# Componentes Compartilhados

Componentes reutilizados em múltiplas telas. Vivem em local compartilhado (`components/ui/`, `components/tables/`, `components/forms/` — ver `99-CLAUDE.md`). Toda tela que usa um destes componentes herda o mesmo comportamento — nunca uma versão "levemente diferente" por tela (regra de consistência, `04-DESIGN_SYSTEM.md`/`05-UX_RULES.md`).

## DataTable

Componente único de tabela para toda a aplicação (Transações, Contas, Cartões, Categorias, Tags, Orçamentos, Assets, Parcelamentos, Alertas).

**Props/funções:**
- `search`: campo de busca textual com debounce (~300ms), sem botão "buscar" — busca instantânea, com highlight do termo nos resultados.
- `filters`: filtros por coluna (dropdown/popover leve, nunca modal complexo para filtro simples). Cada tela define quais colunas são filtráveis (ex.: Transações filtra tipo/categoria/conta/cartão/período/tag/isPaid).
- `sort`: ordenação por coluna (clique no header alterna asc/desc/nenhum), com indicador visual de direção.
- `selection`: seleção múltipla de linhas via checkbox (linha + "selecionar todos" no header), habilita barra de ações em massa.
- `rowActions`: menu de ações por linha (ex.: editar, duplicar, excluir) — nunca mais que os verbos necessários por entidade.
- `bulkActions`: ações em massa quando há seleção (ex.: excluir selecionadas, marcar como pago) — sempre com `ConfirmDialog` se destrutivo.
- `persistFiltersInSession`: filtros aplicados (busca, coluna, ordenação, página) persistem em `sessionStorage`/query string durante a sessão — ao sair e voltar pra mesma tela, filtros continuam aplicados. Não persiste entre sessões diferentes (fecha o navegador, reseta).
- `pagination`: paginação server-side quando a lista cresce sem limite — `/transactions` e o histórico de transações do detalhe de conta (`/accounts/[id]`, ver `21-ACCOUNTS.md`). Todas as demais telas (Contas — grid de cards, Cartões, Categorias, Tags, Orçamentos, Assets, Parcelamentos) usam a mesma `DataTable` mas com `pagination={false}` — carregam tudo de uma vez.
- Estados: `loading` (skeleton de linhas, mesmo número de colunas da tabela real), `empty` (mensagem + CTA específico da entidade, ex. "Nenhuma transação encontrada. [Criar transação]"), `error` (mensagem humana + botão "Tentar novamente"), `success` (dados renderizados).

## KPICard

Usado no Dashboard e em telas de detalhe (Contas, Cartões).

**Props/funções:**
- `icon`: ícone Lucide, mesmo tamanho/estilo em toda aplicação.
- `title`: rótulo curto (ex. "Saldo Atual").
- `value`: valor formatado em BRL (nunca float cru — formatação só na borda).
- `variation`: variação percentual opcional, com cor (verde para positivo/bom, vermelho para negativo/ruim, conforme semântica financeira do card — não é sempre "verde=positivo": num card de Despesas, uma alta pode ser vermelha mesmo sendo "número maior").
- `loading`: renderiza skeleton no lugar do valor/variação, mantendo o layout do card (ícone e título podem aparecer, só valor e variação ficam em skeleton).
- Nunca mostra mais de uma informação principal por card (regra do Design System).

## FormModal / FormDrawer

Par de componentes que representam o mesmo formulário: `FormModal` no desktop (Dialog centralizado), `FormDrawer` no mobile — nunca uma tela separada só pra formulário (`05-UX_RULES.md`).

**Funções (aplicam-se aos dois):**
- Foco automático no primeiro campo ao abrir.
- `Enter` salva o formulário (exceto em textarea multi-linha, onde `Enter` quebra linha — usar `Ctrl+Enter`/botão nesse caso específico).
- `Esc` fecha sem salvar (com confirmação silenciosa apenas se houver alterações não salvas — não bloquear com dialog extra em formulários curtos).
- `Tab` navega entre campos na ordem visual/lógica.
- Validação inline por campo (on blur) e validação de formulário no submit — erros aparecem ao lado/abaixo do campo, nunca só em toast.
- Estado de submissão: botão de salvar mostra spinner inline e fica desabilitado durante o envio (nunca trava a tela inteira).
- Optimistic UI quando a mutation permite (ex.: nova transação aparece na lista antes da confirmação do servidor, revertida se der erro).
- Sucesso: fecha o modal/drawer e dispara toast discreto (ex. "Transação salva"). Erro: mantém o modal/drawer aberto, preserva os valores digitados, mostra mensagem de erro humana perto do campo ou do botão de salvar.

## EntitySelect

Select padrão para qualquer entidade (categoria, conta, cartão, tag, etc.), usado dentro dos formulários.

**Funções:**
- Lista todas as opções quando ≤10 itens (sem campo de busca visível).
- Ativa campo de busca interno quando >10 itens (mesma regra do `04-DESIGN_SYSTEM.md`).
- `createOnTheFly`: quando aplicável (categoria, tag), permite criar uma nova opção direto no fluxo de digitação — ex. digitar "Viagem" e não existir a tag → opção "Criar tag 'Viagem'" aparece na lista, criando-a sem sair do formulário.
- Suporta valor default pré-selecionado (ex.: última categoria usada por tipo de transação — regra de ouro de `05-UX_RULES.md`).
- Navegável 100% por teclado: `↓`/`↑` percorre opções, `Enter` seleciona, `Esc` fecha sem alterar.

## CurrencyInput

Input de valor monetário usado em toda transação/conta/orçamento/asset.

**Funções:**
- Máscara BRL em tempo real (`R$ 0,00`) enquanto o usuário digita, sempre operando sobre centavos (inteiro) internamente — nunca `parseFloat` de string mascarada.
- Valor final convertido para `Decimal` antes de qualquer submit (nunca `Number`/float trafega para o backend).
- Sempre positivo — o sinal (entrada/saída) é definido pelo tipo da transação, nunca pelo valor (`20-TRANSACTIONS.md`).
- Foco automático quando é o primeiro campo do formulário (caso do fluxo `Ctrl+N` de nova transação).

## DateField

Input de data usado em toda a aplicação.

**Funções:**
- Default: hoje, em `America/Sao_Paulo` (nunca UTC puro exibido ao usuário).
- Permite digitação rápida (ex. `dd/mm`) além do date picker visual.
- Aceita atalhos comuns quando fizer sentido no contexto (ex. "hoje", "ontem") — opcional, não bloqueante.

## Chart Wrapper

Camada comum sobre a lib de gráficos (usada em Dashboard, Reports, Assets/evolução, Cards/gastos, Budgets).

**Funções:**
- Tooltip ao hover/tap mostrando valor formatado em BRL e label do ponto/categoria.
- Responsivo: redesenha ao mudar o tamanho do container (resize observer), nunca gráfico fixo que estoura a tela mobile.
- `loading`: skeleton no formato aproximado do gráfico (barras/linha cinza pulsante).
- `empty`: mensagem central substituindo o gráfico (ex. "Nenhum dado disponível para este período" — mesma frase do `28-REPORTS.md`).
- Legenda sempre visível quando há mais de 1 série/categoria, usando as cores financeiras travadas (`04-DESIGN_SYSTEM.md`).

## Badge

Usado para status, categoria, tag e tipo — nunca por estética isolada.

**Funções/variantes:**
- Tipo de transação: Receita (verde), Despesa (vermelho), Transferência (azul — usar tom distinto do `--primary` navy da marca, ex. azul/ciano mais claro, pra badge não parecer elemento de navegação), Parcelamento (laranja — se colidir visualmente com botões `--accent` na mesma tela, usar um tom de laranja próprio, ver `04-DESIGN_SYSTEM.md`).
- Patrimônio: roxo.
- Alerta: GOOD (verde), WARN (amarelo/laranja), DANGER (vermelho).
- Categoria/Tag: cor definida pelo próprio registro (campo `color`).
- Nunca combina cor sozinha como único indicador — sempre acompanhada de texto/ícone.

## ConfirmDialog

Usado **somente** para ações destrutivas (excluir transação, cancelar parcelamento, remover cartão/conta/categoria/tag/asset, remover fatura paga por engano).

**Funções:**
- Mostra claramente o que será afetado (nome/descrição da entidade), nunca um "tem certeza?" genérico sem contexto.
- Botão de confirmar usa variante destrutiva (cor de perigo), botão de cancelar é o padrão/ghost.
- `Esc` cancela, `Enter` não confirma automaticamente ações destrutivas (exige clique ou `Tab`+`Enter` explícito no botão de confirmar) — evita exclusão acidental por hábito de apertar Enter.
- Ao confirmar exclusão de transação: soft delete + toast com opção "Desfazer" (undo) por alguns segundos.

## Toast

Feedback discreto para toda ação (criar/editar/excluir/salvar).

**Funções:**
- Aparece num canto fixo da tela, empilha se houver mais de um.
- Mensagens curtas no padrão "✔ Transação salva", "✔ Cartão atualizado", "✔ Categoria removida" (`04-DESIGN_SYSTEM.md`).
- Ação inline opcional (ex. "Desfazer" no caso de exclusão).
- Some sozinho após alguns segundos; nunca bloqueia interação com a tela.

## EmptyState

Usado em toda lista/tela sem dados.

**Funções:**
- Ícone/ilustração simples + mensagem curta + botão de ação (cor accent laranja, é uma ação de criar) que já leva à criação do primeiro item daquela entidade.
- Texto específico por entidade (ex. "Nenhuma transação encontrada.", "Nenhuma conta cadastrada.", "Nenhum cartão cadastrado.", "Nenhum orçamento criado.", "Nenhum parcelamento ativo.", "Nenhum patrimônio registrado.", "Nenhuma categoria criada.", "Nenhuma tag criada.") — textos já travados nos docs de feature correspondentes.

## Skeleton

Placeholder de carregamento. Nunca spinner ocupando a tela inteira (`04-DESIGN_SYSTEM.md`).

**Funções:**
- Formatos específicos por contexto: linha de tabela, card de KPI, card de cartão/conta/asset, box de gráfico, box de alerta.
- Sempre no mesmo formato/tamanho aproximado do conteúdo real, pra não gerar "pulo" de layout quando os dados chegam.

## AlertCard

Usado no Dashboard, bloco "Lista de Alertas Ativos" (`29-ALERTS.md`).

**Funções:**
- Renderiza os 3 tipos: `WEEKLY_SUMMARY` (severity INFO), `ANOMALY` (severity WARN, cor laranja/vermelho), `GREEN` (severity GOOD, cor verde).
- Mostra título, mensagem e dados já calculados vindos do campo `payload` do Alert (nunca reprocessa números no frontend).
- Clicar no card marca o alerta como lido (`readAt = now()`, Server Action) e remove do destaque — não apaga, some da lista de ativos.
- Ordenação: mais recentes primeiro.
- Estado vazio (sem alertas ativos): "Nenhum alerta novo esta semana. Continue assim!"

---

# Telas

## Login (`/login`)

**Objetivo:** autenticar um dos 2 usuários fixos do sistema (dono + esposa). Não existe cadastro público.

**Layout desktop:**

```text
┌──────────────────────────────────────────┐
│                                            │
│              [ Logo / Nome ]              │
│                                            │
│         ┌────────────────────┐            │
│         │ Email              │            │
│         │ [____________]     │            │
│         │                    │            │
│         │ Senha              │            │
│         │ [____________]     │            │
│         │                    │            │
│         │ [ Entrar ]         │            │
│         └────────────────────┘            │
│                                            │
└──────────────────────────────────────────┘
```

**Layout mobile:** mesmo card, ocupando praticamente a largura da tela, padding reduzido, sem sidebar/bottom nav (tela não autenticada não usa o shell).

**Componentes e funções:**
- `FormModal`-like card centralizado (não é modal de verdade aqui, é a própria página — única exceção onde formulário é página inteira, já que é pré-shell).
- Campo email (label + placeholder + mensagem de erro), campo senha (idem, com toggle mostrar/ocultar).
- Botão "Entrar" com estado de loading (spinner inline) durante a chamada.
- Chama Server Action de login (Auth.js `Credentials`, ver `10-AUTH.md`).

**Interações/atalhos:**
- `Enter` em qualquer campo submete o formulário.
- Foco automático no campo email ao carregar a página.

**Estados:**
- Erro: mensagem genérica única para credenciais inválidas OU rate limit estourado — "Credenciais inválidas ou muitas tentativas. Tente novamente em instantes." (nunca revela qual campo errou nem quantas tentativas restam, ver `10-AUTH.md`).
- Loading: botão com spinner, campos desabilitados durante o submit.
- Sucesso: redireciona para `/dashboard`.

**Referência:** `10-AUTH.md`.

---

## Dashboard (`/dashboard`)

**Objetivo:** responder em menos de 5 segundos "como está minha vida financeira agora" — sem navegação adicional.

**Layout desktop:**

```text
┌ Header: Dashboard ───────────────────────────────────┐
│ [ Box Resumo Semanal ]  (visível dom manhã→seg 14h)   │
│ [ Lista de Alertas Ativos ]                           │
├────────────────────────────────────────────────────── │
│ [KPI Saldo] [KPI Receitas] [KPI Despesas] [KPI Prev.] │
│ [KPI Resultado do mês]     [KPI Patrimônio Total]     │
├────────────────────────────────────────────────────── │
│ Cartões e Dívidas          │ Parcelamentos Ativos     │
│ [card Nubank ███░ 78%]     │ [MacBook ████░ 4/10]     │
├────────────────────────────────────────────────────── │
│ Gastos por categoria (pizza) │ Evolução mensal (linha)│
├────────────────────────────────────────────────────── │
│ Últimas Transações (tabela compacta)                  │
└────────────────────────────────────────────────────── │
```

**Layout mobile:** blocos empilhados em coluna, na mesma ordem (Resumo Semanal/Alertas → KPIs → Cartões → Parcelamentos → Gráficos → Últimas transações). Cards de KPI em grid 2 colunas. Gráficos simplificados (menos legendas simultâneas).

**Componentes e funções:**
- Box Resumo Semanal: card com receitas/despesas/saldo da semana fechada (domingo-sábado) + top 3 categorias + Δ% vs semana anterior. Gerado pelo cron (`29-ALERTS.md`), só leitura aqui. Visível apenas na janela domingo manhã → segunda 14:00 (America/Sao_Paulo); fora disso, o bloco não renderiza.
- `AlertCard` (lista): alertas com `readAt = null`, mais recentes primeiro. Clique marca como lido.
- 6x `KPICard`: Saldo Atual, Receitas do mês, Despesas do mês (isPaid=true, exclui TRANSFER), Previsto/A Pagar (isPaid=false), Resultado do mês (receitas-despesas), Patrimônio Total (contas+assets).
- Mini cards de Cartões: nome, barra de progresso (limite usado/total), valor da fatura atual. Clique leva para `/cards` (detalhe do cartão).
- Mini cards de Parcelamentos: nome da compra, barra de progresso (N/M parcelas), valor pago/restante. Ação rápida de abrir detalhes (leva para `/installments`).
- `Chart Wrapper` (pizza/barras): gastos por categoria do mês atual.
- `Chart Wrapper` (linha): receitas vs despesas dos últimos meses.
- `DataTable` compacta (sem paginação nesta view, é só um preview): últimas transações — colunas descrição/valor/categoria/conta-cartão/data, ações editar/excluir/duplicar por linha. Sem busca/filtro completo aqui (isso vive na tela `/transactions`; aqui é só as N mais recentes com link "ver todas").
- Ações rápidas fixas: Nova Receita, Nova Despesa, Nova Transferência, Novo Cartão, Nova Conta — todas em cor accent laranja (são ações de criar, não navegação) — cada uma abre o `FormModal`/`FormDrawer` correspondente já com o tipo pré-selecionado.

**Interações/atalhos:** `Ctrl+N` nova transação, `Ctrl+K` busca global, `G+D` já está na tela.

**Estados:**
- Loading: skeleton em toda a tela (todos os blocos com seus formatos de skeleton).
- Empty: quando não há nenhuma transação ainda → "Nenhuma movimentação ainda. [ Criar primeira transação ]" no lugar dos blocos de dados.
- Error: "Não foi possível carregar o dashboard." com botão de tentar novamente.

**Referência:** `11-DASHBOARD.md`, `29-ALERTS.md`.

---

## Transações (`/transactions`)

**Objetivo:** ver, filtrar e lançar toda movimentação financeira — o módulo mais usado do sistema.

**Layout desktop:**

```text
┌ Header: Transações  [+ Nova transação] ───────────────┐
│ [Busca] [Tipo▾] [Categoria▾] [Conta/Cartão▾] [Período▾]│
│ [Tag▾] [isPaid▾]                                       │
├────────────────────────────────────────────────────── │
│ Data │ Descrição │ Categoria │ Conta/Cartão │Tipo│Valor│
│ ...  │ ...       │ ...       │ ...          │... │ ... │
├────────────────────────────────────────────────────── │
│                    [ Paginação ]                       │
└────────────────────────────────────────────────────── │
```

**Layout mobile:** filtros colapsam num botão "Filtros" que abre um painel/drawer leve (nunca modal complexo). Tabela vira lista de cards empilhados (data/descrição em destaque, valor com cor por tipo, categoria e conta como texto secundário). Paginação vira "carregar mais" ou paginação simples no rodapé.

**Componentes e funções:**
- `DataTable` completa: busca (descrição), filtros por tipo/categoria/conta/cartão/período/tag/isPaid, ordenação (default: mais recentes primeiro), seleção múltipla, ações de linha (editar, excluir, duplicar), paginação server-side (mesmo padrão reaproveitado no histórico de transações do detalhe de conta, `21-ACCOUNTS.md`), persistência de filtros na sessão.
- Linha de transação vinculada a parcelamento mostra indicador visual (ícone + "3/10") em vez de aparecer como parcela solta e desconectada (`23-INSTALLMENTS.md`).
- Linha de TRANSFER mostra badge "Transferência" (azul distinto do `--primary` navy — ver nota em `04-DESIGN_SYSTEM.md`/Badge acima) e não tem categoria (célula vazia/"—").
- `FormModal`/`FormDrawer` de Nova Transação: campos na ordem descrição → valor → tipo → categoria → conta/cartão → data → tags (opcional) → observações (opcional). Categoria vem pré-preenchida com a última categoria usada para aquele tipo (regra de ouro ≤3 interações, `05-UX_RULES.md`). Ao escolher tipo=Transferência, o formulário troca "categoria" por "conta destino" (esconde categoria, já que TRANSFER nasce com `categoryId=null`).
- Edição: mesmo `FormModal`/`FormDrawer`, ou edição inline direto na célula da tabela para campos simples (valor, descrição, data) — nunca navega para página separada.
- Exclusão: `ConfirmDialog` + soft delete (`deletedAt`) + toast com "Desfazer".
- Transferência: editar/excluir uma perna propaga para a outra (mesma `transferId`) — o formulário de edição de uma perna de transfer mostra as duas contas (origem/destino) juntas, não como duas transações separadas.
- Parcelamento representado como compra única + progresso — criar uma nova compra parcelada abre um formulário específico (descrição, valor total, nº parcelas, cartão, categoria), que gera 1 `InstallmentPurchase` + N `Transaction` por trás, sem expor isso na UI como N transações.
- Ações em massa: excluir selecionadas (com `ConfirmDialog`), marcar como paga(s) em massa.

**Interações/atalhos:** `Ctrl+N` nova transação (mesma ação do botão), `Enter` salva o formulário, `Esc` fecha modal/drawer.

**Estados:**
- Loading: skeleton da tabela (linhas).
- Empty: "Nenhuma transação encontrada. [ Criar transação ]".
- Error: "Não foi possível carregar transações." + tentar novamente.

**Referência:** `20-TRANSACTIONS.md`, `23-INSTALLMENTS.md`.

---

## Contas (`/accounts`)

**Objetivo:** ver saldo disponível por conta e mover dinheiro entre contas.

**Layout desktop:**

```text
┌ Header: Contas  [+ Nova conta] ───────────────────────┐
│ [Conta Corrente]  [Poupança]  [Carteira]  [Conta PJ]  │
│ R$ 5.200          R$ 12.000   R$ 300      R$ 8.400    │
│ +R$800 este mês   ...         ...         ...         │
└────────────────────────────────────────────────────── │
```

Grid de cards, sem paginação (lista completa sempre — `21-ACCOUNTS.md`).

**Layout mobile:** cards em coluna única, largura total.

**Componentes e funções:**
- Cards de conta (não é a `DataTable`, é grid de cards — regra de "listar tudo sem paginação"): nome, tipo, saldo atual (derivado: `initialBalance + INCOME pagas - EXPENSE pagas`, TRANSFER entra normalmente), saldo inicial, indicador de variação do mês.
- Clique no card abre detalhe da conta: saldo atual, histórico de transações (reaproveita `DataTable` filtrada por `accountId`), filtros por categoria/tipo/tag/período/valor, gráfico simples de entradas/saídas.
- `FormModal`/`FormDrawer` de Nova/Editar Conta: nome, tipo, saldo inicial, cor, ícone.
- Botão "Transferir" (na tela ou no detalhe da conta) abre formulário de transferência: conta origem, conta destino, valor, data — gera as 2 Transactions vinculadas por `transferId`.
- Exclusão: `ConfirmDialog`, só permitida se não houver inconsistência de saldo ou transações associadas (ou after mover as transações) — soft delete preferencial.

**Interações/atalhos:** `Ctrl+N` continua abrindo nova transação (não nova conta); ação "Nova conta" fica no botão de ação rápida da tela/header.

**Estados:**
- Loading: skeleton de cards.
- Empty: "Nenhuma conta cadastrada. [ Criar primeira conta ]".
- Error: mensagem humana + tentar novamente.

**Referência:** `21-ACCOUNTS.md`.

---

## Cartões (`/cards`)

**Objetivo:** entender quanto já foi gasto no cartão, quanto falta de limite e o que vem na próxima fatura.

**Layout desktop:**

```text
┌ Header: Cartões  [+ Novo cartão] ─────────────────────┐
│ [Nubank]              [XP Visa]                       │
│ ████████░░ 78%         ███░░░░░░░ 30%                  │
│ R$3.200/R$4.000        R$600/R$2.000                   │
│ Disponível: R$800      Disponível: R$1.400             │
└────────────────────────────────────────────────────── │
```

Ao clicar num cartão, abre visão de detalhe (mesma rota com sub-seção ou painel lateral):

```text
┌ Nubank ────────────────────────────────────────────────┐
│ Limite total / usado / disponível                       │
│ Fatura atual: R$ 3.200  [ Pagar fatura ]                 │
│ [Compras da fatura atual — DataTable]                    │
│ [Parcelamentos deste cartão]                             │
│ [Histórico de faturas anteriores]                        │
└────────────────────────────────────────────────────── │
```

**Layout mobile:** cards empilhados; detalhe do cartão vira tela cheia (drill-down), com as seções acima em abas ou accordion.

**Componentes e funções:**
- Cards de cartão (grid, sem paginação): nome, barra de progresso limite usado/total, valor disponível, valor da fatura atual.
- `KPICard`/resumo no topo do detalhe: limite total, usado, disponível, fatura atual (calculada dinamicamente por `closingDay`/`dueDay`, `22-CREDIT_CARDS.md`).
- `DataTable` de "Compras da fatura atual": transações com `cardId` dentro do ciclo atual (data ≥ fechamento anterior e < fechamento atual), sem paginação (lista do ciclo é limitada).
- Botão "Pagar fatura": abre `FormModal`/`FormDrawer` que cria uma Transaction separada (`type=EXPENSE`, `accountId=<conta escolhida>`, `cardId=null`, `categoryId=null`, valor = valor da fatura) — nunca duplica a despesa por categoria (`22-CREDIT_CARDS.md`).
- Seção "Parcelamentos deste cartão": lista compacta reaproveitando o mesmo componente da tela `/installments`, filtrada por `cardId`.
- Histórico de faturas anteriores: lista de ciclos passados com total de cada um (derivado, sem tabela Statement).
- `FormModal`/`FormDrawer` de Novo/Editar Cartão: nome, bandeira, limite, dia de fechamento, dia de vencimento, cor.
- Exclusão: `ConfirmDialog`, soft delete.

**Interações/atalhos:** `G+C` navega direto para `/cards`.

**Estados:**
- Loading: skeleton de cartões.
- Empty: "Nenhum cartão cadastrado. [ Criar primeiro cartão ]".
- Error: mensagem humana + tentar novamente.

**Referência:** `22-CREDIT_CARDS.md`, `23-INSTALLMENTS.md`.

---

## Parcelamentos (`/installments`)

Decisão: tela própria (não só sub-aba de Cartões), porque parcelamento é uma pergunta que o usuário faz de forma independente do cartão ("quanto ainda devo parcelado, no total, entre todos os cartões?") — mas o cartão também expõe uma versão filtrada da mesma listagem (ver tela Cartões acima), reaproveitando o mesmo componente.

**Objetivo:** ver compras parceladas ativas e finalizadas como progresso, sem nunca expandir em N transações soltas.

**Layout desktop:**

```text
┌ Header: Parcelamentos  [+ Nova compra parcelada] ─────┐
│ [Ativos▾] [Cartão▾] [Categoria▾] [Valor▾] [Data▾]     │
├────────────────────────────────────────────────────── │
│ MacBook Pro          │ Nubank │ Eletrônicos            │
│ ████░░░░░░ 4/10       │ pago R$5.944 · restante R$8.916│
│ [+1 parcela] [Detalhes]                                │
├────────────────────────────────────────────────────── │
│ iPhone                │ XP     │ Eletrônicos            │
│ ███████░░░ 7/10 ...                                     │
└────────────────────────────────────────────────────── │
```

Sem paginação — lista completa sempre (mesma decisão de Contas/Cartões/Categorias/Tags/Assets).

**Layout mobile:** cards empilhados, mesmas informações, ações em menu de contexto (⋮) por card em vez de botões lado a lado.

**Componentes e funções:**
- Cards de parcelamento: nome/descrição, barra de progresso (parcelas pagas/total, derivado — nunca contador manual), valor pago (derivado), valor restante (derivado), cartão associado, categoria.
- Filtros: Ativos (parcelas restantes > 0) / Finalizados (restantes = 0), cartão, categoria, valor, data.
- Ação rápida "+1 parcela paga" — na prática é só um indicador de progresso (parcela vira "paga" automaticamente quando a data de vencimento passa, `23-INSTALLMENTS.md`); o botão aqui serve para abrir o detalhe/confirmar visualmente, não para "forçar" pagamento manual fora do fluxo de datas.
- Clique em "Detalhes" abre o detalhe do `InstallmentPurchase`: todas as N parcelas (Transactions) listadas com data de vencimento e status (paga/futura), mas sempre dentro do contexto da compra — nunca aparecem soltas na tabela principal de Transações.
- `FormModal`/`FormDrawer` de Nova compra parcelada: descrição, valor total, número de parcelas, cartão, categoria. Ao salvar, cria 1 `InstallmentPurchase` + N `Transaction` (rateio: todas as parcelas recebem `floor(total/N)`, exceto a última que absorve o resto).
- Cancelamento: `ConfirmDialog` — soft delete apenas das parcelas futuras (`date > hoje`), parcelas já vencidas mantêm histórico intacto.

**Interações/atalhos:** nenhum atalho de teclado específico além dos globais.

**Estados:**
- Loading: skeleton de cards.
- Empty: "Nenhum parcelamento ativo. [ Criar primeiro parcelamento ]".
- Error: mensagem humana + tentar novamente.

**Referência:** `23-INSTALLMENTS.md`, `22-CREDIT_CARDS.md`.

---

## Orçamentos (`/budgets`)

**Objetivo:** comparar planejado vs realizado por categoria/mês e sinalizar estouro.

**Layout desktop:**

```text
┌ Header: Orçamentos  [+ Novo orçamento] ───────────────┐
│ [Mês/Ano▾] [Categoria▾] [Status▾]                     │
├────────────────────────────────────────────────────── │
│ Alimentação                                             │
│ R$1.200 / R$1.500   ████████░░ 80%   +R$300 restantes  │
├────────────────────────────────────────────────────── │
│ Lazer                                                   │
│ R$800 / R$500       ██████████ 160%  ESTOURADO         │
└────────────────────────────────────────────────────── │
```

Sem paginação — lista completa do mês selecionado.

**Layout mobile:** cards empilhados, mesma informação, barra de progresso ocupando a largura total.

**Componentes e funções:**
- Card de orçamento por categoria: nome da categoria, valor gasto (derivado — soma EXPENSE pagas da categoria + subcategorias filhas no período, `26-BUDGETS.md`) / valor planejado, barra de progresso, valor restante (ou excedente).
- Estados visuais da barra: normal (até 80%), atenção (80%-100%, laranja/vermelho leve), estourado (>100%, vermelho forte) — mesmas faixas do `26-BUDGETS.md`.
- Seletor de Mês/Ano no topo (orçamento é sempre por categoria+mês+ano).
- Filtro por categoria e por status (ok/atenção/estourado).
- `FormModal`/`FormDrawer` de Novo/Editar orçamento: categoria, mês, ano, valor planejado. Um orçamento é único por categoria+mês (criar um já existente deve editar o existente, não duplicar).
- Orçamento criado em categoria pai soma automaticamente os gastos das categorias filhas (o card já reflete isso, sem exigir ação do usuário).
- Exclusão: `ConfirmDialog`, soft delete.

**Interações/atalhos:** nenhum específico além dos globais.

**Estados:**
- Loading: skeleton de cards.
- Empty: "Nenhum orçamento criado. [ Criar orçamento ]".
- Error: mensagem humana + tentar novamente.

**Referência:** `26-BUDGETS.md`.

---

## Patrimônio (`/assets`)

**Objetivo:** ver o que foi construído ao longo do tempo (bens/investimentos), separado do fluxo de caixa do dia a dia.

**Layout desktop:**

```text
┌ Header: Patrimônio  [+ Novo ativo] ───────────────────┐
│ [Gráfico de evolução do patrimônio total]              │
│ [Gráfico de composição: Imóveis/Investimentos/...]     │
├────────────────────────────────────────────────────── │
│ Imóveis                                                 │
│  [Polo Highline card]                                   │
│ Investimentos                                            │
│  [Tesouro Direto card] [CDB card]                        │
│ Reserva de Emergência                                    │
│  [Reserva card]                                          │
└────────────────────────────────────────────────────── │
```

Sem paginação — lista completa, agrupada por tipo (`27-ASSETS.md`).

**Layout mobile:** gráficos em coluna única (empilhados), cards de asset em lista simples abaixo, agrupados pelo mesmo critério de tipo.

**Componentes e funções:**
- `Chart Wrapper` (linha): evolução do patrimônio total, construída a partir da série de `AssetSnapshot` de todos os assets agregada por data.
- `Chart Wrapper` (pizza/barras): composição do patrimônio por tipo (Imóveis, Veículos, Investimentos, FGTS, Reserva, Outros).
- Cards de asset, agrupados por `type`: nome, valor atual (`currentValue`), variação (atual vs compra), tipo (badge roxo — cor de patrimônio).
- `FormModal`/`FormDrawer` de Novo/Editar Asset: nome, tipo, valor de compra, valor atual, data de aquisição, notas. Ao editar `currentValue`, o sistema cria um novo `AssetSnapshot(assetId, value, date)` automaticamente (histórico, não é só um update).
- Detalhe do asset (clique no card): histórico de valor (série de snapshots em gráfico de linha), comparação compra vs atual, notas.
- Exclusão: `ConfirmDialog`, soft delete.

**Interações/atalhos:** nenhum específico além dos globais.

**Estados:**
- Loading: skeleton de gráficos + cards.
- Empty: "Nenhum patrimônio registrado. [ Adicionar primeiro ativo ]".
- Error: mensagem humana + tentar novamente.

**Referência:** `27-ASSETS.md`.

---

## Categorias (`/categories`)

**Objetivo:** organizar a estrutura de categorias (pai/filho) usada por toda transação.

**Layout desktop:**

```text
┌ Header: Categorias  [+ Nova categoria] ───────────────┐
│ [Busca] [Tipo: Receita/Despesa▾]                       │
├────────────────────────────────────────────────────── │
│ 🏠 Casa                                    [editar][⋮] │
│   ├─ ⚡ Energia                            [editar][⋮] │
│   ├─ 💧 Água                               [editar][⋮] │
│   └─ 📶 Internet                           [editar][⋮] │
│ 🚗 Carro/Transporte                        [editar][⋮] │
│   ├─ ⛽ Combustível                        [editar][⋮] │
└────────────────────────────────────────────────────── │
```

Árvore colapsável, sem paginação — carrega tudo de uma vez (estrutura pequena, `24-CATEGORIES.md`).

**Layout mobile:** mesma árvore, indentação reduzida, ações da linha viram menu de contexto (⋮) em vez de botões lado a lado.

**Componentes e funções:**
- Lista em árvore (não é a `DataTable` genérica — é uma view específica de hierarquia pai/filho), cada nó mostra ícone (Lucide), cor, nome, tipo (Receita/Despesa via badge).
- Nó pai é colapsável/expansível (clique no chevron).
- Busca filtra por nome, expandindo automaticamente os pais que contêm um filho correspondente.
- Filtro por tipo (Receita/Despesa).
- `FormModal`/`FormDrawer` de Nova/Editar categoria: nome, tipo, ícone, cor, categoria pai (opcional — select de categorias existentes do mesmo tipo).
- Seed padrão (Alimentação, Casa, Carro/Transporte, Lazer, Saúde, Mercado, Contas Fixas, Outros) já populado no primeiro deploy — a tela nunca deveria estar vazia para um usuário existente, mas ainda documenta o empty state pra completude/dev.
- Exclusão: `ConfirmDialog`. Categoria com transações associadas ou com filhos exige tratamento explícito (mover transações/filhos ou bloquear exclusão com mensagem clara).

**Interações/atalhos:** nenhum específico além dos globais.

**Estados:**
- Loading: skeleton da árvore.
- Empty: "Nenhuma categoria criada. [ Criar categoria ]".
- Error: mensagem humana + tentar novamente.

**Referência:** `24-CATEGORIES.md`.

---

## Tags (`/tags`)

**Objetivo:** gerenciar marcadores livres usados para contextualizar transações.

**Layout desktop:**

```text
┌ Header: Tags  [+ Nova tag] ───────────────────────────┐
│ [Busca]                                                │
├────────────────────────────────────────────────────── │
│ [ Filho ✎⋮ ] [ Viagem ✎⋮ ] [ MacBook ✎⋮ ] [ Carro ✎⋮ ]│
│ [ Apartamento ✎⋮ ] [ Natal ✎⋮ ] [ Trabalho ✎⋮ ]       │
└────────────────────────────────────────────────────── │
```

Chips numa grade fluida, sem paginação — carrega tudo (`25-TAGS.md`).

**Layout mobile:** mesmos chips, quebra de linha conforme a largura da tela.

**Componentes e funções:**
- Chips (`Badge`) com cor própria de cada tag, ícone de editar e menu (⋮) com excluir.
- Busca instantânea filtra os chips por nome.
- `FormModal`/`FormDrawer` de Nova/Editar tag: nome, cor (opcional).
- Exclusão: `ConfirmDialog` — soft delete. Tag associada a transações mantém as associações históricas visíveis (não quebra a transação antiga), só deixa de estar disponível para novas seleções.

**Interações/atalhos:** nenhum específico além dos globais.

**Estados:**
- Loading: skeleton de chips.
- Empty: "Nenhuma tag criada. [ Criar primeira tag ]".
- Error: mensagem humana + tentar novamente.

**Referência:** `25-TAGS.md`.

---

## Relatórios (`/reports`)

**Objetivo:** análise profunda e exploratória — onde o Dashboard é resumo rápido, Reports é onde o usuário compara e entende tendências.

**Layout desktop:**

```text
┌ Header: Relatórios  [Exportar CSV] ───────────────────┐
│ [Período▾] [Categoria▾] [Tags▾] [Conta▾] [Cartão▾]    │
│ [Tipo▾]                                                │
├────────────────────────────────────────────────────── │
│ Categorias (barras)        │ Tags (barras)             │
│ Fluxo de Caixa (linha)      │ Por Conta (tabela)        │
│ Por Cartão (tabela)         │ Parcelamentos (tabela)    │
│ Orçamento: planejado x realizado (tabela)               │
│ Patrimônio: evolução (linha, via AssetSnapshot)         │
└────────────────────────────────────────────────────── │
```

**Layout mobile:** cada relatório vira uma seção/aba própria (evita empilhar 8 gráficos numa tela só); navegação entre relatórios por abas horizontais roláveis ou accordion.

**Componentes e funções:**
- Filtros globais no topo (período, categoria, tags, conta, cartão, tipo) aplicados a todos os relatórios da tela.
- `Chart Wrapper`/`DataTable` para cada um dos 8 relatórios de `28-REPORTS.md`: Categorias, Tags, Fluxo de Caixa, Por Conta, Por Cartão, Parcelamentos, Orçamento (planejado vs realizado), Patrimônio (evolução via `AssetSnapshot`).
- Todos os relatórios de receita/despesa (Categorias, Tags, Fluxo de Caixa e demais) **excluem `TRANSFER`**; o relatório "Por Conta" é a única exceção — ali TRANSFER conta normalmente, porque o que importa é movimentação da conta, não ganho/gasto (`28-REPORTS.md`).
- Botão "Exportar CSV" no header: dispara Server Action que gera CSV das transações filtradas pelos filtros globais atuais (mesma exportação também acessível via atalho em `12-SETTINGS.md`).
- Cada valor exibido é `Decimal` formatado em BRL na borda — soma/agregação sempre no backend.

**Interações/atalhos:** nenhum específico além dos globais.

**Estados:**
- Loading: skeleton de gráficos e tabelas.
- Empty: "Nenhum dado disponível para este período." (por relatório/seção, não a tela inteira — um relatório pode estar vazio enquanto outro tem dado).
- Error: mensagem humana + tentar novamente.

**Referência:** `28-REPORTS.md`.

---

## Alertas (`/alerts`)

**Objetivo:** histórico completo de alertas gerados pelo sistema (resumo semanal, anomalia, verde), inclusive os já lidos — o Dashboard só mostra os ativos (`readAt = null`), aqui é o histórico completo.

**Layout desktop:**

```text
┌ Header: Alertas ───────────────────────────────────────┐
│ [Tipo: Todos/Resumo/Anomalia/Verde▾] [Lido: Todos▾]    │
├────────────────────────────────────────────────────── │
│ ⚠ Anomalia — Alimentação 83% acima do normal  [Lido]   │
│ ✔ Verde — Lazer 60% abaixo do normal          [Lido]   │
│ 📊 Resumo da semana (30/06 a 06/07)           [Lido]   │
└────────────────────────────────────────────────────── │
```

Sem paginação server-side documentada (volume baixo — 2 usuários, geração semanal); se crescer, tratar como as demais listas sem paginação real, exibindo tudo.

**Layout mobile:** lista de `AlertCard` empilhados, mesmos filtros num painel colapsável no topo.

**Componentes e funções:**
- `AlertCard` reaproveitado do Dashboard, em modo lista completa (inclui já lidos, com indicador visual "Lido").
- Filtro por tipo (`WEEKLY_SUMMARY`/`ANOMALY`/`GREEN`) e por status de leitura.
- Clique/ação "marcar como lido" funciona igual ao Dashboard (`readAt = now()`), idempotente se já lido.
- Nenhuma ação de exclusão — alertas não são apagados manualmente (`29-ALERTS.md`).

**Interações/atalhos:** nenhum específico além dos globais.

**Estados:**
- Loading: skeleton de `AlertCard`s.
- Empty: "Nenhum alerta novo esta semana. Continue assim!" (ou variação "Nenhum alerta no histórico." quando os filtros não retornam nada).
- Error: "Não foi possível carregar os alertas."

**Referência:** `29-ALERTS.md`.

---

## Configurações (`/settings`)

**Objetivo:** ajuste fino das preferências do usuário logado — moeda/timezone/tema, sensibilidade de alertas, status do Telegram, atalhos para categorias/tags, export/backup.

**Layout desktop:**

```text
┌ Header: Configurações ────────────────────────────────┐
│ Preferências Gerais                                     │
│  Moeda: BRL (fixo)   Timezone: America/Sao_Paulo (fixo)│
│  Tema: ( ) Claro (•) Escuro ( ) Sistema                │
├────────────────────────────────────────────────────── │
│ Alertas                                                 │
│  Multiplicador anomalia [1.5]  Mínimo absoluto [R$50]  │
│  Multiplicador verde [0.6]                             │
├────────────────────────────────────────────────────── │
│ Telegram                                                │
│  Status: Vinculado — chat_id: 123456789 (read-only)    │
├────────────────────────────────────────────────────── │
│ Categorias e Tags                                       │
│  [ Gerenciar categorias ]  [ Gerenciar tags ]           │
├────────────────────────────────────────────────────── │
│ Dados                                                    │
│  [ Exportar transações (CSV) ]  [ Ver info de backup ]  │
└────────────────────────────────────────────────────── │
```

**Layout mobile:** seções empilhadas em cards/accordion, mesma ordem.

**Componentes e funções:**
- Seção Preferências Gerais: campo Moeda (hoje só "BRL", desabilitado/informativo — sem multi-moeda real, YAGNI), campo Timezone (hoje só "America/Sao_Paulo", idem), seletor de Tema (Light/Dark/System) aplicado imediatamente via toggle do header (mesma função, refletida aqui).
- Seção Alertas: 3 campos numéricos (multiplicador anomalia, mínimo absoluto em `CurrencyInput`, multiplicador verde) com texto explicativo dinâmico mostrando a fórmula com os valores atuais preenchidos (`12-SETTINGS.md`). Salvar afeta só as próximas execuções do cron — texto deixa isso explícito ("alertas já gerados não mudam").
- Seção Telegram: exibe status Vinculado/Não vinculado + `chat_id` **somente leitura** (sem botão de editar/desvincular — vínculo só muda via env var + redeploy). Se não vinculado, instrui a procurar o administrador do sistema.
- Seção Categorias e Tags: 2 botões de atalho que navegam para `/categories` e `/tags` — não duplica UI de gerenciamento aqui.
- Seção Dados: botão "Exportar transações (CSV)" (mesma Server Action de `/reports`), botão "Ver informações de backup" que abre um painel/modal informativo (texto estático sobre PITR do Postgres gerenciado + data do último dump manual, se houver).
- Cada seção salva de forma independente (submit por seção, não um form gigante) — feedback via toast "Configurações atualizadas." sem reload de página.

**Interações/atalhos:** nenhum específico além dos globais.

**Estados:**
- Loading: skeleton dos cards de cada seção.
- Error: "Não foi possível carregar suas configurações."
- Sucesso: toast "Configurações atualizadas." inline, por seção salva.

**Referência:** `12-SETTINGS.md`, `29-ALERTS.md`, `30-TELEGRAM.md`, `28-REPORTS.md`.

---

# Responsividade

Resumo do que muda entre desktop e mobile — regras completas em `04-DESIGN_SYSTEM.md`/`05-UX_RULES.md`, aqui é só o mapeamento por padrão de componente:

```text
Sidebar (desktop)         → Bottom Navigation + Drawer (mobile). Nunca ambos, nunca sidebar em mobile.
Dialog centralizado       → Drawer (mobile). Todo FormModal tem seu par FormDrawer.
DataTable (linhas/colunas)→ Lista de cards empilhados (mobile), mantendo as mesmas ações por item.
Filtros em linha (desktop)→ Painel/drawer de filtros colapsado atrás de um botão "Filtros" (mobile).
Grid de KPIs em 1 linha   → Grid 2 colunas (mobile).
Grid de gráficos lado a lado → Gráficos empilhados em coluna única, com menos legendas simultâneas (mobile).
Botão de ação no header   → Botão central [+] fixo na Bottom Navigation (mobile), mesma função.
Ações de linha em botões  → Menu de contexto (⋮) por item (mobile).
```

Toda tela funciona nos 3 breakpoints (mobile 375px, tablet 768px, desktop 1280px+), sem scroll horizontal em nenhum deles.

---

# Acessibilidade/Teclado

- Todo elemento interativo (botão, link, item de menu, linha de tabela com ação) é alcançável via `Tab` e ativável via `Enter`/`Space`.
- Foco visível (outline/ring) em qualquer elemento focado via teclado, em toda a aplicação.
- Todo formulário (`FormModal`/`FormDrawer`) abre com foco automático no primeiro campo, é navegável via `Tab` na ordem visual, salva com `Enter` (exceto em textarea multi-linha) e fecha com `Esc`.
- `ConfirmDialog` nunca confirma ação destrutiva via `Enter` sozinho — exige foco explícito no botão de confirmar (evita exclusão acidental).
- Toda imagem/ícone decorativo usa `alt=""`/`aria-hidden`; ícones com função (ex. botão só-ícone) têm `aria-label` descritivo.
- Cor nunca é o único indicador de estado (badges de tipo/status sempre acompanham texto ou ícone, além da cor).
- Command Palette (`Ctrl+K`) e todos os atalhos globais (`Ctrl+N`, `G+D`, `G+T`, `G+C`) funcionam de qualquer tela autenticada, sem exigir foco prévio em elemento específico, mas nunca interceptam digitação normal dentro de um campo de texto/textarea focado.
- Toda ação possível via mouse tem equivalente via teclado — sem exceção (`05-UX_RULES.md`, "Teclado Primeiro").
