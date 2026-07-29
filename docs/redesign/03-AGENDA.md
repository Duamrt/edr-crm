# Módulo 3 — Agenda (agenda.html)

**Criado:** 2026-07-28
**Status:** documentação. NÃO implementado. NÃO deployado.
**Arquivos alvo:** `agenda.html` (+ CSS próprio a criar)
**Referência de identidade:** `docs/redesign/00-VISAO-GERAL.md`

## ⚠️ ESCOPO RESTRITO — decisão expressa de Duam

> "AGENDA MANTENHA COMO ERA. NAO VAMOS MUDAR... VOCE APENAS VAI AJUSTAR A PALETA."
> "Agenda — só paleta, fonte e acabamento; funcionamento intocado."

**Este módulo NÃO redesenha a Agenda.** Diferente do Dashboard, aqui:
- ✅ **Permitido:** cores, tipografia (Fraunces/Plus Jakarta/DM Mono), espaçamento, cantos, sombras, acabamento.
- ❌ **Proibido:** mudar layout, mover blocos, renomear seções, alterar o calendário, mexer em JS.

A Agenda **é um calendário e continua sendo um calendário.** Nada de reinterpretar a estrutura.

## Situação atual
- `agenda.html` (201 linhas) carrega `css/tokens.css` + `css/style.css` **e tem CSS embutido** num `<style>` interno com todas as classes `ap-*`.
- JS: `js/data/agenda-page.js` (402 linhas) — **NÃO ALTERAR.**
- Layout: grade de 2 colunas (calendário + painel lateral 380px), vira 1 coluna abaixo de 1100px.

## O QUE NÃO PODE QUEBRAR

### 1. IDs manipulados por `js/data/agenda-page.js` — **28** (lista definitiva)

> ⚠️ **ARMADILHA:** o JS define um atalho `function g(id){ return document.getElementById(id) }`
> (linha 321) e usa `g('...')` na maior parte do arquivo. **Varrer só por `getElementById`
> encontra 18 IDs e ESCONDE 10** — justamente os botões de navegação de mês e todo o formulário.
> Confiar na varredura ingênua quebraria a Agenda silenciosamente.
>
> **Comando correto para reconferir:**
> ```
> { grep -o "getElementById('[^']*')" js/data/agenda-page.js | sed "s/getElementById('//;s/')//";
>   grep -o "\bg('[^']*')" js/data/agenda-page.js | sed "s/g('//;s/')//"; } | sort -u
> ```

**Estrutura e contadores (14):**
`ap-atrasados-card`, `ap-atrasados-lista`, `ap-cnt-atrasado`, `ap-cnt-atrasado-card`,
`ap-cnt-hoje`, `ap-cnt-mes`, `ap-cnt-sem`, `ap-dia-lista`, `ap-dia-titulo`, `ap-grid`,
`ap-pill-atrasado`, `ap-proximos`, `ap-saving`, `ap-titulo-mes`

**Navegação do calendário (3)** — quebram os botões de mês se sumirem:
`ap-mes-prev`, `ap-mes-next`, `ap-btn-hoje`

**Formulário de novo compromisso (8)** — quebram o cadastro se sumirem:
`ap-form`, `ap-f-titulo`, `ap-f-hora`, `ap-f-cat`, `ap-f-prio`, `ap-f-data`, `ap-f-obs`, `ap-btn-add`

**Layout comum (3):**
`ap-titulo-user`, `crm-versao-footer`, `sidebar-usuario`

### 2. Classes geradas pelo JS (manter os NOMES)
`ap-actions`, `ap-body`, `ap-btn-ico`, `ap-dia`, `ap-empty`, `ap-event`, `ap-event-late`,
`ap-meta`, `ap-obs`, `ap-prio`, `ap-tag`, `ap-time`, `ap-title`, `check`, `del`, `dot`, `dots`, `num`

### 3. ⚠️ Classes DINÂMICAS — estilizar TODOS os valores
O JS monta a classe concatenando o dado do banco. Se faltar um valor no CSS, o elemento fica sem estilo:

- **`ap-prio-${ev.prioridade || 'baixa'}`** → `ap-prio-alta`, `ap-prio-media`, `ap-prio-baixa`
- **`ap-tag-${ev.categoria || 'trabalho'}`** → `ap-tag-trabalho`, `ap-tag-pessoal`, `ap-tag-compra`, `ap-tag-lembrete`
- **`dot ${e.categoria || 'trabalho'}`** → os pontinhos do calendário usam a categoria **crua** como classe
  (`.trabalho`, `.pessoal`, `.compra`, `.lembrete`) — sem prefixo. Fácil de esquecer.

> Fonte: `js/data/agenda-page.js` linhas 140, 173, 178, 212, 217, 278.
> **Reconferir antes de implementar** — se surgir categoria nova no banco, o CSS precisa de um padrão de fallback.

### 4. Classes só do HTML (estrutura da página)
`ap-grid`, `ap-card`, `ap-card-head`, `ap-card-sub`, `ap-card-atrasados`, `ap-cal-nav`,
`ap-cont-pills`, `ap-dias-sem`, `ap-grid-dias`, `ap-form`, `ap-form-row`, `ap-btn-add`,
`ap-painel`, `ap-pill`, `ap-saving`

### 4b. ⚠️ Variáveis CSS obrigatórias (15) — se faltar uma, quebra em cascata
O CSS atual (e o JS, em `style=` inline) dependem destas variáveis, hoje vindas de `css/tokens.css`.
**O `css/agenda.css` novo precisa definir TODAS**, senão elementos ficam sem cor/borda silenciosamente:

`--amarelo`, `--amarelo-pale`, `--bg`, `--border`, `--sombra`, `--surface`,
`--text-primary`, `--text-secondary`, `--text-tertiary`,
`--verde`, `--verde-hover`, `--verde-pale`, `--verde-surface`,
`--vermelho`, `--vermelho-pale`

> Comando para reconferir:
> ```
> { grep -o "var(--[a-z-]*" agenda.html; grep -o "var(--[a-z-]*" js/data/agenda-page.js; } \
>   | sed 's/var(//' | sort -u
> ```
> **Mapeamento:** os nomes ficam, os VALORES passam a ser os da paleta nova
> (`--verde` → tom da identidade EDR, etc.). Isso mantém o JS funcionando sem alteração.

### 5. NÃO ALTERAR
`js/data/agenda-page.js`, `js/auth.js`, `js/supabase.js`, `js/utils.js`, banco, RLS,
e **qualquer outra tela** (Dashboard e Login já estão publicados — não regredir).

## Estratégia proposta
Mesmo padrão do Dashboard (que deu certo):
1. Criar `css/agenda.css` exclusivo, com a paleta nova.
2. `agenda.html` deixa de carregar `tokens.css` + `style.css` e o `<style>` embutido migra para o arquivo novo.
3. **Manter 100% da estrutura do `<body>`** — só o visual muda.
4. Zero alteração em `.js`.

> **Por que isolar:** `css/style.css` serve Clientes, Kanban, Lotes e Ficha, que ainda estão no visual antigo.
> Mexer nele agora afetaria telas fora do escopo deste módulo.

## Critérios de aceite
- [ ] Paleta e tipografia novas aplicadas.
- [ ] **Layout idêntico ao atual** — calendário no mesmo lugar, painel lateral no mesmo lugar.
- [ ] Navegação de mês funciona.
- [ ] Clicar num dia abre os eventos do dia.
- [ ] Criar/concluir/excluir compromisso funciona.
- [ ] Contadores (hoje/semana/mês/atrasados) corretos.
- [ ] Pontinhos do calendário com as cores das categorias.
- [ ] Prioridades e categorias todas estilizadas (nenhuma sem cor).
- [ ] Sem erro no console.
- [ ] `git status js/` **vazio**.
- [ ] Dashboard, Login e demais telas **inalterados**.

## Como validar
1. Local, logado, com dados reais.
2. Navegar meses, clicar em dias, criar e concluir um compromisso.
3. Conferir que nenhum evento aparece sem cor de prioridade/categoria.
4. Registrar evidência em `RESULTADO-03-AGENDA.md`.

## Rollback
`git revert <hash>` antes do deploy; `git revert -m 1 <hash-do-merge>` em `main` depois de publicado.
