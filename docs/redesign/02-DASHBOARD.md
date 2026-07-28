# Módulo 2 — Dashboard (dashboard.html)

**Criado:** 2026-07-28
**Status:** documentação. NÃO implementado. NÃO deployado.
**Arquivo real alvo:** `dashboard.html` + CSS próprio (a criar)
**Protótipo aprovado:** tela Dashboard em `C:\Users\Duam Rodrigues\Downloads\prototipo-crm-navegavel.html`
**Referência de identidade:** `docs/redesign/00-VISAO-GERAL.md`

## Objetivo
Aplicar a nova identidade visual ao Dashboard mantendo 100% do comportamento. O Dashboard é a primeira tela após o login — hoje funciona e a Elyda depende dele diariamente.

## ⚠️ Diferença crítica em relação ao Login
No Login o JS só lia 2 campos. **Aqui o JS GERA HTML dinamicamente** (`innerHTML`) em `js/data/dashboard.js` (478 linhas) e `js/data/agenda-widget.js` (311 linhas). Logo, o contrato é maior:

**Não basta manter os IDs — é obrigatório manter os NOMES DAS CLASSES CSS que o JS injeta.**
Se o CSS novo renomear uma classe, o JS continua injetando o nome antigo e o elemento fica sem estilo (quebra visual silenciosa).

## O QUE NÃO PODE QUEBRAR

### 1. IDs manipulados por `js/data/dashboard.js`
`cobrar-badge`, `cobrar-foot`, `cobrar-foot-info`, `cobrar-lista`, `cobrar-sub`, `cobrar-toggle`, `funil`, `hero-greeting`, `hero-sub`, `kpis`, `last-refresh`, `quebrado-lista`, `sidebar-usuario`, `vencendo-badge`, `vencendo-card`, `vencendo-lista`

### 2. IDs manipulados por `js/data/agenda-widget.js`
`ag-add-btn`, `ag-add-input`, `ag-banner`, `ag-list`, `kpi-agenda-sub`, `kpi-agenda-val`
(+ presentes no HTML: `ag-link-full`, `ag-sub`, `crm-versao-footer`)

### 3. Classes CSS injetadas pelo JS (manter os NOMES; pode mudar o que elas fazem)
`kpi`, `kpi-label`, `kpi-value`(+`frac`), `kpi-sub`, `fam-card`, `fam-head`, `fam-avatar`, `fam-name-link`, `fam-meta`, `fam-tag`, `fam-days`, `fam-pendencias`, `fam-tudo-ok`, `fam-actions`, `fam-act` (+ variantes `primary`/`success`/`whats`), `broken-row`, `broken-label`, `broken-count`, `broken-icon`, `fn`, `fn-label`, `fn-value`, `badge-fire`, `badge-attn`, `empty-state`, `icon`, `skel`
> Fonte: `grep 'class="' js/data/dashboard.js`. Reconferir antes de implementar (a lista pode crescer).

### 3b. ACHADOS CRÍTICOS (levantados na leitura do JS — 2026-07-28)
- **`var(--vermelho)` é usado INLINE pelo JS** (`js/data/dashboard.js`, bloco de docs vencendo: `style="color:var(--vermelho)"`). O `css/dashboard.css` **precisa definir `--vermelho`**, senão o texto fica sem cor. Conferir outras vars antes de codar.
- **`fam-tag ${f.status_kanban}`** — a classe de status é gerada dinamicamente. Precisa estilizar TODOS os status: `triagem`, `documentacao`, `correspondente`, `aprovado`, `prefeitura`, `assinatura`, `concluido`, `perdido`.
- **Classes do bloco de pendências:** `pend-row`, `pend-label` (+ variantes de cor), `pend-items`.
- **Classes do agenda-widget:** `ag-banner-ico`, `ag-banner-txt`, `ag-body`, `ag-check`, `ag-empty`, `ag-event`, `ag-meta`, `ag-obs`, `ag-time`, `ag-tag`, `ag-title`, `ag-prio`.
- **`broken-icon`** tem variantes `bi-r` / `bi-y` / `bi-g` (cores de gravidade).
- **`.skel`** (skeleton de carregamento) aparece no HTML inicial — manter, senão o "carregando" fica sem estilo.

### 4. Funções e scripts
- `onclick="dashboardCarregar()"` e `onclick="logout()"` — manter os nomes.
- Scripts na ordem: `js/supabase.js`, `js/auth.js`, `js/utils.js`, `js/data/dashboard.js`, `js/data/agenda-widget.js`, `js/sw-register.js`.
- `authGuard()` no topo + `document.documentElement.style.visibility` (anti-FOUC).
- CSP do `<meta>` mantida.

### 5. NÃO ALTERAR
`js/data/dashboard.js`, `js/data/agenda-widget.js`, `js/auth.js`, `js/supabase.js`, `js/utils.js`, banco, RLS, e qualquer outra tela.

## Estratégia de implementação (proposta)
- CSS novo em arquivo próprio (`css/dashboard.css`), no espírito do `css/login.css` — sem tocar `css/style.css` (que serve as outras telas antigas).
- Reescrever a **aparência** das classes existentes, mantendo os nomes.
- Manter a estrutura de IDs intacta no HTML.
- **Decisão pendente:** o Dashboard hoje usa `css/style.css` (sidebar, botões, cards). Se eu criar `css/dashboard.css` sem carregar `style.css`, preciso reimplementar a sidebar/topbar. Avaliar na implementação: (a) carregar os dois e sobrescrever, ou (b) autonomia total como no login. Registrar a escolha aqui antes de codar.

## Critérios de aceite
- [ ] Visual novo aplicado conforme protótipo aprovado.
- [ ] KPIs, "Cobrar hoje", "Documentos vencendo", widget de Agenda, "O que tá quebrado" e Funil **carregam dados reais** (não quebram).
- [ ] Botão "Atualizar" (`dashboardCarregar()`) funciona.
- [ ] Botão "Sair" (`logout()`) funciona.
- [ ] Adicionar compromisso pelo widget da agenda funciona.
- [ ] Links do funil e "Ver ficha" continuam navegando certo.
- [ ] Sem erro no console.
- [ ] Responsivo (desktop + celular).
- [ ] Nenhuma outra tela afetada.

## Como validar
1. Local (`npx serve -s .`), logar de verdade e conferir que **todos os blocos carregam dados**.
2. Console sem erros; clicar em Atualizar, Sair, adicionar compromisso.
3. Registrar evidência em `RESULTADO-02-DASHBOARD.md`.

## Rollback
Por Git (NÃO existe `rollback.sh`): `git revert -m 1 <hash-do-merge>` em `main` + push.

## Fundação CSS (pendência herdada do módulo 1)
O commit `1b46fe6` (import Plus Jakarta + `@media` órfão + `prefers-reduced-motion` em `css/style.css`) foi **anulado** pelo revert `be1c89e` para isolar o release do Login.
**Esta é a etapa certa para reavaliá-lo:** se o Dashboard novo não depender de `css/style.css`, a fundação pode continuar guardada; se depender, reaplicar com `git revert be1c89e` e testar.
