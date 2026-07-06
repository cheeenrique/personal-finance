# 05 - UX_RULES.md

# Regras de Experiência do Usuário

Este documento define todas as regras de comportamento da interface.

Ele existe para garantir consistência, velocidade e previsibilidade em toda a aplicação.

Nenhuma tela pode fugir dessas regras.

---

# Filosofia

A aplicação deve ser:

* rápida
* previsível
* sem fricção
* altamente navegável por teclado
* consistente

O usuário deve conseguir executar ações financeiras sem pensar na interface.

---

# Regra Principal

Nenhuma ação frequente pode exigir mais de 3 interações.

Exemplo:

* abrir modal
* preencher campo
* salvar

Se precisar de mais que isso, a UX deve ser revisada.

---

# Atalhos Globais

## Pesquisa Global

```text
Ctrl + K
```

Abre busca global.

Busca por:

* transações
* contas
* cartões
* categorias
* tags
* patrimônio

---

## Nova Transação

```text
Ctrl + N
```

Abre modal de nova transação.

---

## Navegação Rápida

```text
G + D → Dashboard  
G + T → Transações  
G + C → Cartões  
```

---

# Navegação

Toda navegação deve ser instantânea.

Nunca bloquear UI por carregamento de página.

Sempre usar loading progressivo.

---

# Criação de Dados

Toda criação deve seguir o padrão:

1. Abrir modal/drawer
2. Preencher poucos campos
3. Confirmar com Enter ou botão

Nunca criar páginas separadas apenas para formulários.

---

# Nova Transação (ação mais frequente do sistema)

Cadastro rápido é o objetivo #1 do produto. No app web, igual ao Telegram, precisa caber em até 3 interações:

1. `Ctrl + N` (ou botão) abre modal com foco no campo valor
2. Categoria vem pré-preenchida (default: última categoria usada pelo tipo de transação, não em branco)
3. Enter salva

Usuário só precisa trocar a categoria quando ela não bater com o default — trocar é 1 interação a mais, não parte do fluxo obrigatório. Sem esse default, a categoria vira um 4º passo obrigatório e a ação deixa de caber na Regra Principal (≤3 interações).

---

# Edição de Dados

Edição deve ser inline ou via modal.

Nunca navegar para páginas de edição longas.

---

# Exclusão

Toda exclusão deve:

* pedir confirmação
* ser rápida
* permitir undo quando possível

---

# Enter / Escape

## Enter

Sempre salvar formulário.

## Escape

Sempre fechar modal/drawer/dialog.

---

# Foco de Input

Todo modal deve abrir com foco automático no primeiro campo.

---

# Tabulação

Todos os formulários devem ser navegáveis via TAB.

---

# Feedback

Toda ação deve gerar feedback imediato.

Exemplos:

* Transação criada
* Cartão atualizado
* Categoria removida

Utilizar toast discreto.

---

# Loading

Nunca bloquear a tela inteira.

Utilizar:

* skeletons
* loading inline
* optimistic UI quando possível

---

# Empty State

Toda lista deve possuir empty state claro.

Exemplo:

```text
Nenhuma transação encontrada.

[ Criar primeira transação ]
```

---

# Tabelas

Todas as tabelas devem:

* permitir busca
* permitir filtro
* permitir ordenação
* permitir paginação

E devem manter estado (persistência de filtros na sessão).

---

# Filtros

Filtros devem ser rápidos de aplicar.

Nunca abrir modais complexos para filtro simples.

---

# Pesquisa

Pesquisa deve ser:

* instantânea
* sem botão "buscar"
* com debounce leve
* com highlight de resultados

---

# Parcelamentos

Parcelamentos nunca devem aparecer como múltiplas transações independentes na UI principal.

Sempre representar como:

```text
Compra única + progresso (4/10)
```

---

# Dashboard

O Dashboard deve responder perguntas sem navegação.

Exemplos:

* quanto tenho?
* quanto gastei?
* quanto devo?
* quanto falta pagar?

Sem scroll excessivo.

---

# Consistência de Componentes

Um componente deve se comportar igual em todo o sistema.

Exemplo:

Tabela de transações = mesma tabela de cartões

---

# Modais

## Desktop

Dialog centralizado

## Mobile

Drawer

Nunca abrir página separada para formulários simples.

---

# Ações Rápidas

Toda tela importante deve possuir ações rápidas visíveis.

Exemplos:

* Nova transação
* Nova conta
* Novo cartão

---

# Hierarquia Visual

Sempre respeitar ordem:

1. Informação principal
2. Dados secundários
3. Ações

Nunca inverter essa ordem.

---

# Densidade de Informação

A interface deve ser compacta.

Evitar:

* grandes espaços vazios
* cards exagerados
* excesso de padding

---

# Performance Percebida

A aplicação deve parecer instantânea.

Mesmo quando dados estiverem carregando:

* skeleton
* placeholders
* optimistic updates

---

# Erros

Erros devem ser:

* claros
* humanos
* não técnicos

Nunca exibir stack trace.

---

# Confirmações

Somente ações destrutivas precisam de confirmação.

Exemplos:

* excluir transação
* cancelar compra
* remover cartão

---

# Estados da UI

Toda tela deve possuir:

* loading
* empty
* error
* success

Sem exceções.

---

# Responsividade

A aplicação deve funcionar em:

* mobile
* tablet
* desktop

Mobile deve priorizar:

* ações rápidas
* formulários simples
* navegação por bottom bar

---

# Teclado Primeiro

Toda ação possível deve ser executável sem mouse.

---

# Busca Global (Regra de Ouro)

A busca global deve ser o principal ponto de navegação secundária.

O usuário deve conseguir:

* encontrar qualquer coisa
* abrir qualquer entidade
* executar ações rápidas

Sem navegar menus.

---

# Filosofia Final

A interface não deve ser percebida.

O usuário deve apenas:

* registrar
* consultar
* analisar

Sem esforço cognitivo sobre a aplicação.
