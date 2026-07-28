# Módulo 2 — Dashboard (dashboard.html)

**Criado:** 2026-07-28
**Atualizado:** 2026-07-28 — **MUDANÇA DE ESCOPO** (ver seção abaixo)
**Status:** documentação revisada. Implementação da estrutura nova em andamento. NÃO deployado.
**Arquivo real alvo:** `dashboard.html` + `css/dashboard.css`
**Protótipo aprovado:** tela Dashboard em `C:\Users\Duam Rodrigues\Downloads\prototipo-crm-navegavel.html`
**Referência de identidade:** `docs/redesign/00-VISAO-GERAL.md`

---

## ⚠️ MUDANÇA DE ESCOPO (2026-07-28)

### O que foi feito na 1ª tentativa (commit `ff07302`)
Só troca de **paleta e tipografia**, mantendo o `<body>` do `dashboard.html` intacto.
Resultado: **o Dashboard antigo repintado** — não o Dashboard do protótipo.

### Por que estava errado
O protótipo aprovado tem **estrutura diferente**, não só cores. Faltaram:
- painel verde escuro grande no topo (hero);
- número grande de documentos vencendo;
- bloco "Quem precisa de você agora";
- KPIs com a hierarquia do protótipo (borda superior colorida, rótulo em DM Mono, número grande).

Trocar CSS sobre HTML antigo **não produz** layout novo. Duam identificou a divergência comparando os prints e **não autorizou publicar** a versão anterior.

### Escopo novo (autorizado por Duam em 2026-07-28)
> "Concordo com a opção B: refazer a estrutura local para ficar fiel ao protótipo, preservando todos os dados e botões que já funcionam."

De **"pintar o Dashboard antigo"** → para **"montar o Dashboard aprovado"**.

### 🔒 REGRA INEGOCIÁVEL DO DUAM — número real, nunca decorativo
> "o painel verde não pode mostrar '03' fixo só para ficar bonito. Ele precisa usar a quantidade real de documentos vencendo."

**Nenhum número exibido pode ser fixo no HTML.** Todo valor visível vem do banco.
Isso vale para o hero e para qualquer bloco novo. Número chumbado = defeito, não estilo.

---

## ⚠️ Diferença crítica em relação ao Login
No Login o JS só lia 2 campos. **Aqui o JS GERA HTML dinamicamente** (escreve dentro dos contêineres) em `js/data/dashboard.js` (478 linhas) e `js/data/agenda-widget.js` (311 linhas). Logo, o contrato é maior:

**Não basta manter os IDs — é obrigatório manter os NOMES DAS CLASSES CSS que o JS gera.**
Se o CSS novo renomear uma classe, o JS continua gerando o nome antigo e o elemento fica sem estilo (quebra visual silenciosa).

---

## O QUE NÃO PODE QUEBRAR

### 1. IDs manipulados por `js/data/dashboard.js`
`cobrar-badge`, `cobrar-foot`, `cobrar-foot-info`, `cobrar-lista`, `cobrar-sub`, `cobrar-toggle`, `funil`, `hero-greeting`, `hero-sub`, `kpis`, `last-refresh`, `quebrado-lista`, `sidebar-usuario`, `vencendo-badge`, `vencendo-card`, `vencendo-lista`

### 2. IDs manipulados por `js/data/agenda-widget.js`
`ag-add-btn`, `ag-add-input`, `ag-banner`, `ag-list`, `kpi-agenda-sub`, `kpi-agenda-val`
(+ presentes no HTML: `ag-link-full`, `ag-sub`, `crm-versao-footer`)

### 3. Classes CSS geradas pelo JS (manter os NOMES; pode mudar o que elas fazem)
`kpi`, `kpi-label`, `kpi-value`(+`frac`), `kpi-sub`, `fam-card`, `fam-head`, `fam-avatar`, `fam-name-link`, `fam-meta`, `fam-tag`, `fam-days`, `fam-pendencias`, `fam-tudo-ok`, `fam-actions`, `fam-act` (+ variantes `primary`/`success`/`whats`), `broken-row`, `broken-label`, `broken-count`, `broken-icon`, `fn`, `fn-label`, `fn-value`, `badge-fire`, `badge-attn`, `empty-state`, `icon`, `skel`

### 3b. ACHADOS CRÍTICOS (leitura do JS — 2026-07-28)
- **`var(--vermelho)` é usado direto no atributo `style` pelo JS** (em `renderVencendo`). O `css/dashboard.css` **precisa definir `--vermelho`**.
- **`fam-tag ${f.status_kanban}`** — classe de status gerada dinamicamente. Estilizar TODOS: `triagem`, `documentacao`, `correspondente`, `aprovado`, `prefeitura`, `assinatura`, `concluido`, `perdido`.
- **Classes do bloco de pendências:** `pend-row`, `pend-label` (+ variantes de cor), `pend-items`.
- **Classes do agenda-widget:** `ag-banner-ico`, `ag-banner-txt`, `ag-body`, `ag-check`, `ag-empty`, `ag-event`, `ag-meta`, `ag-obs`, `ag-time`, `ag-tag`, `ag-title`, `ag-prio`.
- **`broken-icon`** tem variantes `bi-r` / `bi-y` / `bi-g`.
- **`.skel`** (skeleton) aparece no HTML inicial — manter.

### 3c. 🚨 ACHADOS NOVOS — limites descobertos ao planejar a estrutura (2026-07-28)

Estes dois achados **restringem o que é possível fazer sem tocar no JS**. Registrados antes de codar:

#### (a) `renderKpis()` REESCREVE o bloco `#kpis` inteiro
`js/data/dashboard.js` substitui todo o conteúdo do `#kpis`, gerando **4 KPIs fixos**:
`Cobrar hoje` · `Em movimento` · `Lotes` · `Concluídos no mês`

**Consequência:** qualquer KPI escrito à mão no HTML é **apagado** assim que os dados chegam.
- ✅ **Posso** mudar a APARÊNCIA dos KPIs (borda superior colorida, rótulo mono, número grande) — via CSS nas classes `.kpi`, `.kpi-label`, `.kpi-value`, `.kpi-sub`.
- ❌ **Não posso** trocar a COMPOSIÇÃO (ex.: colocar "Documentos" no lugar de "Concluídos no mês") — isso exige editar `js/data/dashboard.js`, **fora do escopo autorizado**.

> **Divergência aceita vs. protótipo:** o protótipo mostra o KPI "Documentos". O real mostra "Concluídos no mês". Mantido o do real. O dado de documentos aparece no **hero**, que é onde ele ganha mais destaque mesmo.
> **Nota:** o KPI "Agenda hoje" que existe no HTML estático é substituído por "Concluídos no mês" quando os dados chegam — comportamento pré-existente, não introduzido por este módulo.

#### (b) O card de documentos vencendo pode estar OCULTO
`renderVencendo()` adiciona a classe `hidden` ao card quando **não há** documentos vencendo, e o `#vencendo-card` já nasce com `hidden` no HTML.

**Consequência:** o hero **não pode** ser simplesmente "o card de vencendo aumentado" — sumiria nos dias sem pendência, deixando um buraco no topo da tela.

**Solução adotada:** o hero é um bloco **próprio e sempre visível**, que funciona nos DOIS estados:
- **com documentos vencendo** → mostra o número real e o tom de urgência;
- **sem documentos vencendo** → mostra estado "tudo em dia", sem número alarmista.

O número real vem de `#vencendo-badge`, que o JS já preenche com a contagem real (`itens.length`) da RPC `get_crm_docs_vencendo`, janela de 15 dias. **Nenhum JS novo é necessário para isso.**

### 4. Funções e scripts
- `onclick="dashboardCarregar()"` e `onclick="logout()"` — manter os nomes.
- Scripts na ordem: `js/supabase.js`, `js/auth.js`, `js/utils.js`, `js/data/dashboard.js`, `js/data/agenda-widget.js`, `js/sw-register.js`.
- `authGuard()` no topo + `document.documentElement.style.visibility` (anti-FOUC).
- CSP do `<meta>` mantida.

### 5. NÃO ALTERAR
`js/data/agenda-widget.js`, `js/auth.js`, `js/supabase.js`, `js/utils.js`, banco, RLS, e qualquer outra tela.

> **Exceção pontual (2026-07-28):** Duam autorizou expressamente editar `js/data/dashboard.js`
> **apenas** para remover o card de Lotes (ver seção abaixo). Fora disso, o arquivo continua fechado.

---

## 🗑️ Card "Lotes" REMOVIDO — 2026-07-28 (decisão de Duam)

### O problema
O card exibia `4/28 · 24 livres`, calculado com `k.josue_reservados` / `k.josue_total`
(`js/data/dashboard.js`, ex-linha 138). **Esses números eram do loteamento antigo do Josué
e deixaram de refletir a realidade** — o Dashboard estava mostrando informação falsa.

Identificado por Duam ao revisar a tela:
> "com a correçao de lotes. nao temos mais essa informacao de 4/28 / 24 livres."

### A decisão
- **Card removido por completo.**
- **NÃO substituído** por "Tarefas hoje" nem "Tarefas vencidas" — decisão de Duam: essas
  métricas **já aparecem** no bloco "O que tá quebrado", e duplicá-las na mesma tela
  seria informação repetida.
- Os **3 cards restantes** (Cobrar hoje · Em movimento · Concluídos no mês) passam a
  ocupar a largura inteira (grade de 4 → 3 colunas).

### 🔮 Quando o 4º card volta (PROVISÓRIO — não esquecer)
Quando o **módulo Lotes** for implementado, o card volta como
**"Famílias procurando lote"**, com a **quantidade real** de famílias aguardando oportunidade.

**Proibido até lá:** "0 oportunidades", placeholder, ou qualquer número inventado.
Card sem dado real não entra — a regra do número honesto vale aqui igual ao painel de foco.

### O que mudar quando esse dia chegar
1. `js/data/dashboard.js` → `renderKpis()`: adicionar o 4º card (há um comentário no lugar exato).
2. `css/dashboard.css` → `.kpi-grid` volta para `repeat(4,1fr)`; revisar os `@media` (hoje ajustados para 3).
3. `dashboard.html` → devolver o skeleton do 4º card.
4. Só fazer isso quando existir a fonte de dados real.

---

## Estratégia de implementação (escopo novo)

1. **CSS isolado:** `css/dashboard.css`, sem `css/style.css` nem `css/tokens.css`. (já feito)
2. **Reestruturar o `<body>`:** adicionar o hero verde e reorganizar os blocos conforme o protótipo — **mantendo todos os IDs e classes do contrato** nos lugares onde o JS escreve.
3. **Hero:** HTML estático + o número real vindo do `#vencendo-badge`. Sem JS novo.
4. **KPIs:** só aparência (borda superior colorida, rótulo DM Mono, número grande Plus Jakarta).
5. **JS — regra e a única exceção autorizada:**
   - Regra geral: nenhum arquivo `.js` é alterado por motivo visual.
   - **Exceção autorizada e JÁ EXECUTADA (2026-07-28):** `js/data/dashboard.js` foi alterado
     **exclusivamente** para remover o card de Lotes, que exibia números falsos do loteamento
     antigo. Autorização expressa de Duam. Validado com `node -c` (OK), `renderKpis()` passando
     a gerar 3 cards e **0** usos de `josue` em código ativo. Ver a seção "Card Lotes REMOVIDO".
   - Todos os demais JS (`agenda-widget.js`, `auth.js`, `supabase.js`, `utils.js`) permanecem intocados.

## Critérios de aceite
- [ ] Hero verde escuro presente e fiel ao protótipo.
- [ ] **Número do hero é REAL** (vem do banco), nunca fixo — e correto nos dois estados (com e sem documentos vencendo).
- [ ] KPIs com a hierarquia visual do protótipo.
- [ ] KPIs, "Cobrar hoje", "Documentos vencendo", widget de Agenda, "O que tá quebrado" e Funil **carregam dados reais**.
- [ ] Botão "Atualizar" (`dashboardCarregar()`) funciona.
- [ ] Botão "Sair" (`logout()`) funciona.
- [ ] Adicionar compromisso pelo widget da agenda funciona.
- [ ] Links do funil e "Ver ficha" continuam navegando certo.
- [ ] Sem erro no console.
- [ ] Responsivo (desktop + celular).
- [ ] Nenhuma outra tela afetada.
- [ ] **Em `js/`, somente `js/data/dashboard.js` pode aparecer modificado** — e apenas pela
      remoção autorizada do card de Lotes. Qualquer outro `.js` modificado é regressão.
- [ ] `node -c js/data/dashboard.js` sem erro.

## Como validar
1. Local (`npx serve -s .`), logar de verdade e conferir que **todos os blocos carregam dados**.
2. **Conferir o hero nos dois estados** — inclusive o caso "nenhum documento vencendo".
3. Console sem erros; clicar em Atualizar, Sair, adicionar compromisso.
4. Registrar evidência em `RESULTADO-02-DASHBOARD.md`.

## Rollback
Por Git (NÃO existe `rollback.sh`): `git revert <hash>` antes do deploy; `git revert -m 1 <hash-do-merge>` em `main` depois de publicado.

## Fundação CSS (pendência herdada do módulo 1)
O commit `1b46fe6` foi **anulado** pelo revert `be1c89e` para isolar o release do Login.
**O Dashboard novo NÃO depende de `css/style.css`** → a fundação segue guardada. Reaplicar com `git revert be1c89e` quando algum módulo futuro precisar.
