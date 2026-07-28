# Resultado — Módulo 3 (Agenda)

**Data:** 2026-07-28
**Escopo:** só paleta, fonte e acabamento. Layout e funcionamento intocados (decisão de Duam).
**Status:** implementado, testado localmente e **aprovado por Duam**. **NÃO deployado.**

## Arquivos alterados/criados
- `css/agenda.css` — **NOVO**, exclusivo da Agenda. Recebeu o CSS que estava embutido no HTML,
  agora com a paleta nova. Mantém os **nomes** das 15 variáveis do contrato, trocando só os valores.
- `agenda.html` — `<head>`: removidos `tokens.css`, `style.css` e o `<style>` embutido (85 linhas);
  passa a carregar só `css/agenda.css` + fontes novas. Emojis decorativos removidos dos títulos e do menu.
  **Estrutura do `<body>` intocada.** Backup: `agenda-ANTES.html` no scratchpad.
- **NÃO alterados:** todo o `js/`, banco, RLS, e nenhuma outra tela.

## Evidência de teste

### Verificado por comando
- **IDs do contrato: 28/28** presentes e únicos. ✓
- **Classes: 57/57** usadas por HTML/JS têm estilo no CSS novo. ✓
- **Variáveis obrigatórias: 15/15** definidas. ✓
- **Classes dinâmicas:** `ap-prio-{alta,media,baixa}` e `ap-tag-{trabalho,pessoal,compra,lembrete}`
  todas presentes — nenhum evento fica sem cor. ✓
- **Pontinhos do calendário:** `.dot.{trabalho,pessoal,compra,lembrete}` — 4/4. ✓
- **`git status js/` vazio** — JS intocado. ✓
- Isolamento: `tokens.css` = 0, `style.css` = 0, `agenda.css` = 1; `<style>` embutido = 0. ✓
- Scripts: 5, na ordem original. ✓

### 🔒 Prova de que a ESTRUTURA não mudou (requisito central deste módulo)
Comparação tag a tag do `<body>` antes × depois:
- **98 tags antes · 98 tags depois · 0 fora de ordem.** ✓

Isto é a garantia objetiva de que a Agenda **não foi redesenhada** — só repintada.

### Verificado visualmente por Duam (local, porta 3215, dados reais)
Aprovado: *"Agenda aprovada. Mantém exatamente o que já funciona, só com a nova identidade visual."*
- Calendário, painel lateral e formulário nas mesmas posições. ✓
- Console: **"No Issues"**. ✓
- Navegação de mês funcionando (Duam navegou até outubro/2026). ✓

## Achado investigado — título do mês (levantado por Duam)
Duam notou o calendário em **outubro/2026** com o painel em **28 de julho**, e pediu para anotar.

**Investigado e descartado como bug:**
- `node -e` com a data real do sistema → o código gera **"julho de 2026"**. Não há erro de cálculo.
- Logo, o mês em outubro veio da **navegação pelas setas** — comportamento correto.
- O painel lateral seguir o **dia selecionado** (28/07) e não o mês folheado também é o correto.

**Mas o print revelou um defeito real de acabamento:** o título aparecia como **"Outubro De 2026"**,
com "De" maiúsculo. Causa: `text-transform:capitalize` herdado do CSS antigo capitaliza **cada palavra**,
e em português preposição no meio não leva maiúscula.

**Corrigido** (dentro do escopo "acabamento"):
- `.ap-card-head h2` → `capitalize` removido, `::first-letter{text-transform:uppercase}` no lugar.
- `#ap-dia-titulo` → mesma correção; `::first-letter` não se aplica a container flex, por isso
  a regra foi para o span interno, com `display:inline-block`.
- **Testado:** 3/3 assertos passaram, com prova visual — "Outubro de 2026" e "Terça-feira, 28 de julho".

## O que NÃO foi testado
- **Cliques reais:** criar/concluir/excluir compromisso e trocar de mês **não foram exercitados por Claude**
  (a prévia usada para conferir a aparência era estática). Duam validou a tela carregada, não as ações.
- **Celular real:** `@media` escritos para 860px e 560px, não validados em aparelho.
- **Produção:** nada publicado.

## Rollback
`git revert <hash>` antes do deploy; `git revert -m 1 <hash-do-merge>` em `main` depois de publicado.
