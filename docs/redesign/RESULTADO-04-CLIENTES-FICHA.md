# Resultado — Módulo 4 (Clientes + Ficha)

**Data:** 2026-07-28
**Escopo:** visual novo mantendo a operação densa e o funcionamento. **NÃO deployado.**

Entregue em **2 commits separados**, para isolar a origem de qualquer defeito:
- `5da6892` — Clientes (**aprovado por Duam** com dados reais)
- este — Ficha

---

## Clientes — APROVADO por Duam (local, dados reais)
> "A densidade ficou boa. A tabela continua sendo ferramenta de trabalho: uma família por
> linha, filtros claros e ações sempre à mão. (…) Para este escopo, eu aprovo Clientes."

- `css/clientes.css` NOVO, isolado. `clientes.html`: head trocado, emojis removidos.
- **JS inline (194 linhas): hash SHA-256 IDÊNTICO** antes e depois.
- 8/8 IDs · 44/44 classes · 8 status + 4 faixas + badges de SLA estilizados.
- Console limpo, 13 famílias reais carregando.

### Defeitos corrigidos antes da entrega (achados na própria prévia)
1. Nome/CPF/telefone quebravam em 2 linhas → densidade destruída. `white-space:nowrap` + largura mínima.
2. `display:flex` num `<td>` descolava a coluna de ações da tabela. Trocado por alinhamento por margem.
3. Com rolagem horizontal os botões saíam de vista → coluna de ações **fixada à direita**.

### Pendência registrada (não corrigida — Duam encerrou o escopo de Clientes)
A coluna "Próxima ação" trunca textos longos ("Aguardar respo…", "COBRAR ANÁLI…"), efeito de
manter tudo em uma linha. Duam: *"Não criaria mais mudanças nessa tela agora."* Avaliar depois.

---

## Ficha — implementada, aguardando validação de Duam

### Arquivos
- `css/ficha.css` — **NOVO**, isolado, 114 classes com a paleta nova.
- `ficha.html` — head trocado + emojis do menu removidos. **Corpo e scripts intocados.**
  Backup: `ficha-ANTES.html` no scratchpad.
- `css/dashboard.css`, `css/agenda.css`, `css/clientes.css` — **1 linha cada** (ajuste técnico
  pequeno, feito neste mesmo commit): acrescentado `html{background:var(--ink)}` como proteção
  para a faixa da sidebar. **Nenhuma dessas telas apresentava o defeito** — é prevenção, aplicada
  por consistência já que nenhuma tinha a regra. Não altera nada do que Duam já aprovou.
- **NÃO alterados:** todo o `js/`, `css/style.css`, `css/tokens.css`, banco, RLS, e o **HTML**
  de qualquer outra tela (`index.html`, `dashboard.html`, `agenda.html`, `clientes.html`,
  `kanban.html`, `lotes.html`, `familia.html`).

### 🔒 Prova central: a tela mais arriscada do projeto não foi tocada na lógica
`ficha.html` tem **762 linhas de JavaScript embutido** no próprio arquivo editado.
Comparação por **hash SHA-256** dos blocos `<script>`: **IDÊNTICOS** antes e depois.

### Verificado por comando
- **IDs: 52/52** presentes e únicos. ✓
- **Classes: 112/112** com estilo. ✓
- **`git status js/` vazio.** ✓
- Isolamento: `tokens.css` = 0, `style.css` = 0, `ficha.css` = 1. ✓
- **HTML** das telas já publicadas (`index.html`, `dashboard.html`) + `css/style.css` +
  `css/tokens.css`: **0 modificações**. ✓
  > Ressalva honesta: `css/dashboard.css` **teve 1 linha adicionada** neste commit
  > (`html{background:var(--ink)}`), assim como `agenda.css` e `clientes.css`.
  > É a proteção de fundo descrita em "Arquivos" — ajuste técnico, sem efeito visual
  > nas telas que Duam já aprovou. O Dashboard em produção **não** foi republicado.

### As 5 armadilhas mapeadas — todas cobertas
| # | Risco | Status |
|---|---|---|
| 1 | `.hidden` **precisa** de `!important` — o `#modal-ai` tem `display:flex` inline; sem isso o modal **abre e nunca fecha** | ✓ |
| 2 | `.imp-item` / `.resolvido` são alvo de `querySelectorAll('.imp-item:not(.resolvido)')` — renomear quebraria a **contagem de impedimentos ativos** | ✓ |
| 3 | `.auditoria-progresso > div` — a barra é o **filho direto**, não uma classe | ✓ |
| 4 | `undo-toast-*` vem de `js/utils.js` (`toastUndo`, chamado na linha 519) — sem estilo, o botão **"Desfazer"** fica quebrado | ✓ 11 regras |
| 5 | 6 status de documento | ✓ 6/6 |

### 🐛 Defeito PRÉ-EXISTENTE corrigido
`pendente`, `bloqueado` e `nao_aplicavel` **nunca tiveram estilo** no `css/style.css`.
Esses documentos apareciam sem a cor que os outros tinham. Como o CSS foi reescrito,
os 6 status agora têm cor e borda próprias. Não era regressão — era lacuna antiga.

### Defeitos de layout corrigidos antes da entrega
1. **Barra de progresso da auditoria não aparecia.** Meu CSS assumiu que `.auditoria-titulo`
   era texto solto, mas é um **container** (ícone + texto), e `.auditoria-completude` fica
   **dentro** do header. Corrigido: a barra recebe espaço real (`flex:1;min-width:240px`).
2. **Sidebar parecia terminar no meio da página.** Investigado: a barra é `fixed` com
   `height:100vh` (1000px) numa página de 1654px — **comportamento correto**; o corte era
   artefato da captura de página inteira. Confirmado por captura com a página rolada:
   a lateral preenche a tela normalmente. Ainda assim foi adicionado `html{background:var(--ink)}`
   como proteção, e a mesma regra foi aplicada a `dashboard.css`, `agenda.css` e `clientes.css`
   por consistência (nenhuma delas tinha o defeito, mas nenhuma tinha a proteção).

### 🐛 Correção após validação de Duam com dados reais (2026-07-28)
Duam abriu a Ficha real e **não aprovou o bloco de Triagem**: "Faixa calculada", "Faixa 1",
o alerta de cadastro, "Subsídio" e a resposta apareciam **colados**, sem separação.

**Causa (investigada, não suposta):** o JS gera cada linha como
`<div class="triagem-bloco"><span class="triagem-label">Rótulo</span><strong>Valor</strong>…</div>`
— rótulo e valor são **irmãos dentro do bloco**. Meu CSS tratou `.triagem-bloco` como
*separador de seção* (só `padding-top` + borda) e `.triagem-label` como `flex:1`.
Sem `display:flex` no bloco, tudo virou texto corrido.

**Corrigido** conforme a sugestão de Duam — duas colunas, rótulo à esquerda e valor/alerta
à direita —, **sem tocar no JavaScript**: a correção ficou inteira em `css/ficha.css`
(`git status ficha.html` = 0 linhas).

**Segundo defeito encontrado na mesma investigação:** o JS usa `var(--text-secondary)` em
`style=` **inline**, e essa variável **não existia** no `css/ficha.css` — o texto "Confirmar
com correspondente" ficava sem cor definida. Adicionada, junto com as demais variáveis do
CSS antigo, por segurança.

**Verificação estendida às 4 telas isoladas:** conferido que toda variável usada inline
(por HTML ou JS) está definida no CSS correspondente. A Ficha era a única com lacuna.
Comando: `grep -o "var(--[a-z-]*" <html> <js> | sort -u` × definições no CSS.

## ⚠️ Console: 31 Issues (pendência aberta, NÃO investigada)
No print de Duam o DevTools mostra **31 Issues** na Ficha. **Não é "console limpo".**
Não foram investigados — podem ser avisos de terceiros, do navegador ou pré-existentes.
**Não registrar esta tela como console limpo.** Avaliar em trilha própria.

## O que NÃO foi testado
- **Ficha com dados reais:** a prévia usou dados falsos; falta o aceite de Duam logado.
- **Ações:** salvar status, adicionar documento/impedimento/tarefa, abrir os modais,
  botões de WhatsApp/Drive, "Desfazer" — **nenhum exercitado**.
- **Celular real.**
- **Produção:** nada publicado.

## Rollback
`git revert <hash>` antes do deploy; `git revert -m 1 <hash-do-merge>` em `main` depois.

---

## 🚀 PRODUÇÃO — deploy 2026-07-29 (Agenda, Clientes, Ficha, Kanban)

**Autorizado por Duam**, com Lotes expressamente fora do escopo.
`./deploy.sh` — merge `main`: `71ebe1a..3610eb8`. Cache buster: `1785309493`.

### Verificado por `curl` em https://crm.edreng.com.br
- HTTP **200** em `/`, `/agenda.html`, `/clientes.html`, `/ficha.html`, `/kanban.html`,
  `/dashboard.html`, `/lotes.html`. ✓
- **CSS novo publicado nas 6 telas** (login, dashboard, agenda, clientes, ficha, kanban) = 1 cada. ✓
- Kanban: grade 3 colunas = 1 · `overflow-x:auto` = **0** (rolagem lateral eliminada) ·
  rótulo "HISTÓRICO" presente. ✓
- **Domínio `crm.edreng.com.br` respondendo** — CNAME preservado (previsto pelo merge de teste). ✓
- `lotes.html` e `familia.html` continuam em `css/style.css` — **fora do escopo, como decidido**. ✓

### Alarme falso registrado (para não repetir)
O `deploy.sh` renumera o cache buster do projeto inteiro, então `lotes.html`, `familia.html`,
`index.html`, `dashboard.html`, `js/utils.js` e `sw.js` apareceram no diff.
Minha primeira checagem filtrou por `cb=17852` — mas o buster novo é `cb=1785309493`,
que **também começa com `1785`**, e o filtro não pegou. Refeito com `cb=[0-9]*`:
**0 linhas de conteúdo** em todos eles. Só numeração.

### Prova extra antes de publicar
A linha `html{background:var(--ink)}` adicionada ao `dashboard.css` (tela já no ar) foi
medida em iframe isolado: fundo do `html` = `rgb(23,53,42)` (idêntico à sidebar) e `body`
= `rgb(247,246,239)` (papel, inalterado). Confirma que a regra só pinta a área atrás da
barra lateral — o Dashboard não muda de aparência.

## ⚠️ O QUE CONTINUA SEM TESTE (após o deploy)
- **Arrastar card no Kanban** — nunca exercitado, em nenhuma versão.
- **Seleção em lote** — nunca exercitada.
- **Ações funcionais** em todas as telas: salvar status, documentos, impedimentos, tarefas,
  WhatsApp, Drive, Desfazer, filtros, ordenação.
- **Celular real.**
- **31 Issues no console da Ficha** — não investigados.
