# 11 — Atalhos do card "O que tá quebrado" (dashboard → listas filtradas)

**Decisão (Duam, 2026-08-04): Opção A — banco como fonte única** de contador E detalhe.
Arquitetura por construção: uma view define os critérios; a summary conta dela; a RPC de
detalhe lista dela. JS não reimplementa critério nenhum.

## Etapas de autorização (modelo definido pelo Duam)

| Etapa | Escopo | Status |
|---|---|---|
| 1 | Implementação local + testes, sem banco/commit/deploy | **FEITA 2026-08-04** |
| 2 | Aplicar no banco SÓ a view `crm_vw_pendencias` + RPC `get_crm_pendencias` (rollback pronto; summary intocada) | **FEITA 2026-08-04** (autorização nomeada do Duam) |
| 3 | Alterar `get_crm_dashboard_summary` para contar da view | **FEITA 2026-08-04** |
| 4 | Publicar a UI (deploy) | **FEITA 2026-08-04** (janela nomeada do Duam) |

### Evidências da Etapa 3 (2026-08-04)

- Definição pré-mudança recapturada (md5 `b2e235fabe5f0bda2dfe3941b731dc35`, 7708 chars) e a
  aplicação rodou com **guarda por hash**: abortaria se a summary tivesse mudado desde a captura.
- Mudança mínima: só os CTEs `quebrado` e `tarefas_resumo` passaram a contar de
  `public.crm_vw_pendencias`; todo o resto da função ficou idêntico (rollback = reaplicar a
  definição capturada).
- **Paridade 6/6 pós-mudança**, chamando a summary NOVA (claims de admin) × view na mesma consulta:
  docs_recusados 0=0 · docs_vencidos 2=2 · impedimentos 0=0 · tarefas_vencidas 7=7 ·
  tarefas_hoje 0=0 · tarefas_amanha 1=1. A partir daqui a paridade é estrutural: contador e
  detalhe leem a MESMA view.

### Evidências da Etapa 2 (2026-08-04)

- Transação aplicada sem erro (BEGIN → preflight → view + REVOKEs → CREATE FUNCTION → GRANTs → COMMIT).
- **Paridade OK nos 6 recortes** (contador da summary × `COUNT(*)` da view): docs_recusados 0=0,
  docs_vencidos 2=2, impedimentos 0=0, tarefas_vencidas 7=7, tarefas_hoje 0=0, tarefas_amanha 1=1 —
  batendo com os números reais do dashboard do Duam.
- **Segurança 4/4 (fechada no smoke de 2026-08-04):** anon não lê a view (permission denied) ·
  anon não executa a RPC (SQL e REST — HTTP 401 `42501` na API pública) · authenticated sem profile
  bloqueado ('Usuario sem profile no CRM', uid real sem linha em crm_profiles) · **JWT real via UI
  local logada: `get_crm_pendencias` HTTP 200**, título "Documentos vencidos — 2 documentos ·
  2 clientes", exatamente 2 itens em 2 clientes com vencimentos 11/04/2026 e 23/06/2026 (ambos
  passados em 04/08/2026). Smoke aprovado pelo Duam.
- **Gotcha de teste local (não afeta produção, provado por curl):** o `serve` local responde
  `clientes.html?pendencia=...` com `301 Location: /clientes` **descartando a query** — o clique no
  card falha só no localhost. Usar a forma limpa `/clientes?pendencia=...` no teste local. Em
  produção o GitHub Pages serve o `.html` direto (HTTP 200, sem redirect) e o link do card funciona.
- **Preflight provado:** reexecução do bloco aborta com `PREFLIGHT: ... ja existe`.
- Não executado nesta etapa: summary intocada; sem commit; sem deploy; teste REST com JWT real de
  login fica para o smoke visual do Duam (local, com a RPC agora viva).

SQL das Etapas 2/3 + rollback: [11-QUEBRADO-SQL-PROPOSTO.sql](11-QUEBRADO-SQL-PROPOSTO.sql) — **rascunho, não aplicado**.

## Unidade de contagem (fonte: definição real da summary, lida via `pg_get_functiondef` em 2026-08-04)

Todos os contadores do card contam **pendências, não clientes**: docs = linhas de `crm_documentos`,
impedimentos = linhas de `crm_impedimentos`, tarefas = linhas de `crm_tarefas`. O destino usa a
MESMA unidade no título e acrescenta clientes distintos **do mesmo conjunto retornado**:
`"Documentos vencidos — 2 documentos · 1 cliente"`.

Critérios por recorte (replicados na view; conferir contra a summary na validação da Etapa 2):
- `docs_recusados`: doc `status='recusado'` + cliente ativo (não deletado, etapa ≠ concluído/perdido)
- `docs_vencidos`: doc `status IN (entregue,pendente)` + `data_vencimento < hoje` + cliente ativo
- `impedimentos`: `ativo=true` + cliente ativo (chave da summary: `impedimentos_ativos`)
- `tarefas_vencidas/hoje/amanha`: `concluida=false` + prazo `<hoje / =hoje / =amanhã` + cliente
  **apenas não-deletado** — a summary NÃO filtra etapa nas tarefas; a view replica exatamente
- **"Hoje" = `CURRENT_DATE` no timezone configurado no banco** — o JS nunca calcula data;
  comportamento idêntico ao atual. Mudar o fuso (ex.: America/Sao_Paulo) é outro escopo.

## Achado que mudou o plano: tarefas ≠ Agenda

O card conta `crm_tarefas` (tarefas por cliente, geridas na ficha). A Agenda usa `crm_agenda`
(outra tabela). Mandar "Tarefas vencidas" pra Agenda criaria NOVA divergência — por isso o destino
de tarefas é a mesma tela de pendências (`clientes.html?pendencia=tarefas_*`), agrupada por cliente
com link pra ficha.

## Implementação (Etapa 1)

- [js/data/pendencias.js](../../js/data/pendencias.js) — módulo novo: recortes formalizados,
  `pendenciaHref/Titulo/AgruparPorCliente/LabelItem`, `pendenciasCarregar` (só `sbRpc`),
  `iniciarModoPendencias` (DOM via createElement/textContent, sem innerHTML)
- [js/data/dashboard.js](../../js/data/dashboard.js) — `renderQuebrado`: linha com count>0 vira
  `<a>` com seta `→` e hover; zero fica estático (nada a abrir)
- [clientes.html](../../clientes.html) — container `#pend-view`, modo pendências via `?pendencia=`,
  parâmetros de URL formalizados no comentário do script, e **correção do bug do funil**:
  `?status=` era ignorado (só `prioridade` era lido) — agora aplica no filtro
- [css/dashboard.css](../../css/dashboard.css) — `.broken-arrow` + hover
- [dashboard.html](../../dashboard.html) / [sw.js](../../sw.js) — include e precache do módulo novo

## Estado transitório (até a Etapa 2)

Clicar num atalho antes da RPC existir mostra aviso de erro amigável ("Não consegui carregar…")
— honesto e sem quebrar nada. A UI só fica funcional de ponta a ponta após a Etapa 2.

## Teste de contrato (paridade)

- **Etapa 1 (JS):** `node tests/pendencias.test.js` — 24 asserções (recortes, título na unidade
  certa incluindo "2 documentos · 1 cliente", agrupamento, labels, params de URL, SQL proposto
  cobre os 6 recortes e revoga acesso direto à view).
- **Etapa 2 (banco, leitura):** `SELECT recorte, COUNT(*), COUNT(DISTINCT cliente_id) FROM
  public.crm_vw_pendencias GROUP BY recorte` × subqueries atuais da summary — devem bater.
- **Etapa 2 (segurança, 4 testes reais — exigem banco autorizado, NÃO executados no preparo):**
  1) `anon` não lê a view (SELECT direto → permission denied);
  2) `anon` não executa a RPC (REST `/rpc/get_crm_pendencias` com apikey anon → erro de permissão);
  3) `authenticated` SEM profile em `crm_profiles` → bloqueado ('Usuario sem profile no CRM');
  4) `authenticated` COM profile → executa e recebe o recorte esperado.
- **Aplicação da Etapa 2 é transação atômica:** `BEGIN → preflight (aborta se view/RPC já
  existirem) → DDL → COMMIT`; `CREATE FUNCTION` sem `OR REPLACE` (cria, nunca substitui);
  `SECURITY DEFINER` com `search_path` só `pg_catalog` e relações qualificadas com `public.`.
- **Etapa 3 em diante:** paridade estrutural (summary conta da própria view); conferência visual
  contador × título do destino.

## Segurança

View **sem grants** para `anon`/`authenticated`/`PUBLIC` — só as RPCs `SECURITY DEFINER` leem, e
ambas exigem `auth.uid()` + profile em `crm_profiles` (mesmo padrão da summary existente).

## Como reverter (Etapa 1)

Remover `js/data/pendencias.js` e `tests/pendencias.test.js`; reverter os blocos marcados em
`clientes.html` (style pend-*, `#pend-view`, include, bloco de params), `dashboard.html` (include),
`js/data/dashboard.js` (renderQuebrado volta a divs estáticas), `css/dashboard.css` (.broken-arrow)
e `sw.js` (linha do precache). Nenhum dado é gravado pela feature.

## Evidências (Etapa 1, 2026-08-04)

- `node tests/pendencias.test.js` → **24 passaram, 0 falharam**; regressões: pré-ficha 86/0, triagem 54/0.
- Navegador (Playwright, RPCs stubadas, zero erros de página): linhas >0 viram `<a>` com `→` e as
  zeradas ficam `<div>`; clique em "Docs vencidos 2" abre destino com título
  "Documentos vencidos — 2 documentos · 1 cliente" e tabela normal escondida;
  `?status=concluido` aplica o filtro (bug do funil corrigido).
