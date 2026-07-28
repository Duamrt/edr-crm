# Módulo 4 — Clientes + Ficha

**Criado:** 2026-07-28
**Status:** documentação. NÃO implementado. NÃO deployado.
**Arquivos alvo:** `clientes.html` (302 linhas) e `ficha.html` (1034 linhas)
**Referência de identidade:** `docs/redesign/00-VISAO-GERAL.md`

## Escopo (decisão de Duam)
> "Clientes + Ficha — visual novo mantendo a operação densa."
> "mantendo densidade e clareza — sem inventar telas novas nem mexer no funcionamento."

- ✅ **Permitido:** paleta, tipografia, espaçamento, acabamento.
- ❌ **Proibido:** inventar telas, mudar fluxo, reduzir densidade da lista, mexer em lógica.

**A lista de Clientes é operacional e densa de propósito.** Não transformar em cards arejados.

---

## 🚨 DIFERENÇA CRÍTICA vs. Dashboard e Agenda

Nas telas anteriores o JS estava em arquivos separados. **Aqui NÃO:**

| Tela | `<style>` embutido | `<script>` inline |
|---|---|---|
| `clientes.html` | 0 linhas | **194 linhas** |
| `ficha.html` | 0 linhas | **762 linhas** |

**Consequências:**
1. **Não existe CSS embutido para migrar** — as duas telas dependem 100% de `css/tokens.css` + `css/style.css`.
   Criar CSS isolado significa **reimplementar tudo** que elas usam de lá (113 classes).
2. **O JS mora no arquivo que preciso editar.** Qualquer descuido no `<head>` ou no `<body>`
   pode encostar em lógica. Editar `<head>` e `<body>` **sem tocar nos blocos `<script>`**.
3. **`ficha.html` é a tela mais arriscada do projeto até aqui** — 1034 linhas, 762 de lógica.

> **Recomendação:** tratar as duas em commits separados (Clientes primeiro, Ficha depois),
> mesmo entregando juntas para validação. Se algo quebrar, o culpado fica isolado.

---

## O QUE NÃO PODE QUEBRAR

### 1. IDs em `clientes.html` (8)
`busca`, `contador`, `filtro-impedimento`, `filtro-prioridade`, `filtro-status`,
`sidebar-usuario`, `tbody`, `vazio`

### 2. IDs em `ficha.html` (52)
`ai-mensagem`, `auditoria-acoes-wrap`, `auditoria-barra`, `auditoria-card`, `auditoria-checks`,
`auditoria-frac`, `auditoria-na-confirm`, `auditoria-na-contagem`, `auditoria-na-lista`,
`auditoria-na-wrap`, `auditoria-percent`, `banner-terminal`, `btn-aplicar-na`, `btn-drive`,
`btn-editar`, `btn-enviar-ai-wpp`, `btn-gerar-wpp`, `btn-lgpd-delete`, `btn-wpp-cobrar`,
`doc-avulso-descricao`, `doc-avulso-status`, `doc-avulso-vencimento`, `form-doc-avulso`,
`form-impedimento`, `form-tarefa`, `imp-desc`, `imp-tipo`, `impedimento-alerta`, `lista-docs`,
`lista-historico`, `lista-impedimentos`, `lista-tarefas`, `modal-ai`, `modal-lote`,
`modal-lote-desvincular`, `modal-lote-select`, `modal-lote-titulo`, `na-cancelar`, `na-confirmar`,
`page-title`, `resumo-grid`, `sidebar-usuario`, `status-badge`, `status-select`, `tarefa-desc`,
`tarefa-prazo`, `triagem-acoes`, `triagem-acoes-wrap`, `triagem-card`, `triagem-checks`,
`triagem-resumo`, `triagem-status`

### 3. ⚠️ CLASSES USADAS COMO SELETOR PELO JS — renomear quebra função
Não são só estilo: o JS **procura elementos por elas**.

| Classe | Onde | O que quebra se sumir |
|---|---|---|
| `.th-sort` | `clientes.html` → `querySelectorAll('.th-sort')` | **Ordenação da tabela** |
| `.sort-ind` | `clientes.html` → `querySelector('.sort-ind')` | Indicador da coluna ordenada |
| `.imp-item` | `ficha.html` → `querySelectorAll('.imp-item:not(.resolvido)')` | **Contagem de impedimentos ativos** |
| `.resolvido` | `ficha.html` → mesmo seletor | Idem — resolvidos contariam como ativos |

### 4. ⚠️ CLASSES DINÂMICAS — estilizar TODOS os valores
O JS concatena dado do banco no nome da classe:

- **`badge status-${status_kanban}`** (clientes e ficha) →
  `status-triagem`, `status-documentacao`, `status-correspondente`, `status-aprovado`,
  `status-prefeitura`, `status-assinatura`, `status-concluido`, `status-perdido`
- **`doc-item status-${d.status}`** (ficha) → status de documento
  (conferir valores reais no banco antes de implementar: `entregue`, `recusado`, `vencido`, pendente…)
- **`imp-item ${ativo ? '' : 'resolvido'}`** (ficha)
- **`${vencida ? 'text-danger' : ''}`** (clientes e ficha) → **`.text-danger` é obrigatória**

> `css/style.css` hoje define: `.status-{triagem,documentacao,correspondente,aprovado,prefeitura,
> assinatura,concluido,perdido,entregue,recusado,vencido}` + `.status-{verde,amarelo,vermelho,azul}`.
> **Reconferir a lista completa antes de implementar** — faltar um valor = elemento sem cor.

### 5. Total de classes usadas pelas duas telas: **113**
Inclui layout comum (`app-shell`, `sidebar`, `topbar`, `btn*`, `modal*`, `card*`, `table-wrap`),
blocos de auditoria (`auditoria-*`), triagem (`triagem-*`), documentos (`doc-*`),
impedimentos (`imp-*`), histórico (`hist-*`) e banner (`banner-terminal-*`).

### 6. NÃO ALTERAR
Os blocos `<script>` inline das duas telas, `js/data/clientes.js`, `js/data/documentos.js`,
`js/auth.js`, `js/supabase.js`, `js/utils.js`, banco, RLS, e as telas já publicadas
(Login, Dashboard) nem a Agenda já aprovada.

---

## Estratégia proposta
1. **Commits separados:** Clientes primeiro, Ficha depois — isola a origem de qualquer defeito.
2. CSS isolado por tela (`css/clientes.css`, `css/ficha.css`), no padrão que funcionou nos módulos 2 e 3.
3. Reimplementar as 113 classes com a paleta nova, **mantendo todos os nomes**.
4. **Preservar a densidade:** a tabela de Clientes continua tabela, com as mesmas colunas e linhas compactas.
5. Editar apenas `<head>` e a marcação do `<body>` — **sem encostar nos `<script>`**.

## Critérios de aceite
- [ ] Paleta e tipografia novas nas duas telas.
- [ ] **Lista de Clientes continua densa** (tabela, mesmas colunas, sem virar cards).
- [ ] Ordenação por coluna funciona (`.th-sort` / `.sort-ind`).
- [ ] Busca e os 3 filtros funcionam.
- [ ] Contador de resultados correto; estado vazio aparece quando não há resultado.
- [ ] Clicar num cliente abre a Ficha certa.
- [ ] Ficha: auditoria, triagem, documentos, impedimentos, tarefas e histórico carregam.
- [ ] Contagem de impedimentos ativos correta (`.imp-item:not(.resolvido)`).
- [ ] Modais (AI, lote) abrem e fecham.
- [ ] Botões de WhatsApp e Drive continuam funcionando.
- [ ] Nenhum badge de status sem cor.
- [ ] Sem erro no console.
- [ ] `git status js/` **vazio**.
- [ ] Login, Dashboard e Agenda inalterados.

## Como validar
1. Local, logado, com dados reais.
2. Ordenar colunas, buscar, aplicar filtros, abrir uma ficha.
3. Na ficha: conferir os blocos e abrir/fechar um modal.
4. Registrar evidência em `RESULTADO-04-CLIENTES-FICHA.md`.

## Rollback
`git revert <hash>` antes do deploy; `git revert -m 1 <hash-do-merge>` em `main` depois de publicado.
