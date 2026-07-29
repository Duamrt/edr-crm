# Módulo 5 — Kanban (kanban.html)

**Criado:** 2026-07-28
**Status:** documentação. NÃO implementado. NÃO deployado.
**Arquivo alvo:** `kanban.html` (376 linhas)
**Referência de identidade:** `docs/redesign/00-VISAO-GERAL.md`

## Escopo (decisão de Duam)
> "Kanban — visual aprovado, sem perder arrastar, seleção e etapas."
> "6 etapas ativas + Histórico abaixo; preservar arrastar e mover em lote."

- ✅ **Permitido:** paleta, tipografia, espaçamento, acabamento das colunas e cards.
- ❌ **Proibido:** quebrar o arrastar, a seleção em lote, ou mudar as etapas.

## Composição
| | |
|---|---|
| `<style>` embutido | 22 linhas (cobre poucas classes; o resto vem de `style.css`) |
| `<script>` inline | **265 linhas** |
| Scripts externos | `supabase`, `auth`, `utils`, `data/clientes`, `sw-register` |

Editar `<head>` e `<body>` **sem encostar nos blocos `<script>`**.

---

## O QUE NÃO PODE QUEBRAR

### 1. IDs (7)
`btn-modo-selecao`, `bulk-bar`, `bulk-count`, `bulk-status`, `kanban-wrap`,
`sidebar-usuario`, `toggle-finalizados`

> Sem atalhos tipo `g()` nesta tela — acesso direto por `getElementById`. Verificado.

### 2. 🚨 CLASSES DE ESTADO — adicionadas por `classList`, invisíveis numa varredura de `class=`
Estas **não aparecem** escritas no HTML. Se ficarem sem estilo, a interação some sem erro no console:

| Classe | Quando entra | O que quebra sem estilo |
|---|---|---|
| `dragging` | card sendo arrastado | **Nenhum retorno visual ao arrastar** |
| `drag-over` | coluna sob o cursor | **Não se vê onde o card vai cair** |
| `bulk-mode` | modo de seleção ativo | Não se percebe que o modo mudou |
| `bulk-selected` | card marcado | **Não se vê o que está selecionado** |
| `show` | barra de ações em lote | A barra pode não aparecer |

> Comando: `grep -o "classList\.\(add\|remove\|toggle\)('[^']*')" kanban.html | sort -u`

### 3. ⚠️ Classes DINÂMICAS — estilizar todos os valores
- **`badge badge-${b.tipo}`** → 4 tipos confirmados em `js/utils.js`:
  `badge-red`, `badge-yellow`, **`badge-ctps`**, **`badge-fgts`**
  > `ctps` e `fgts` são específicos do Kanban — fáceis de esquecer.
- **`slaClass`** no card → `sla-red` (≥ dias parado) e `sla-yellow` (≥ 3 dias); pode vir vazio.
- **`pill-faixa-${faixa}`** → 1 a 4, com variante `pill-faixa-sm` (o Kanban usa `size:'sm'` e `compact:true`).

### 4. As 8 colunas (6 ativas + 2 finalizadas)
```
triagem · documentacao · correspondente · aprovado · prefeitura · assinatura   ← 6 ATIVAS
concluido · perdido                                                            ← finalizadas
```
**Comportamento a preservar:** o checkbox `#toggle-finalizados` alterna entre mostrar 6 ou 8 colunas,
e a escolha **persiste em `localStorage`** (`kanban_mostrar_finalizados`).
As finalizadas ficam **ocultas por padrão** — é o "Histórico abaixo" que Duam pediu.

### 5. Mecânica do arrastar (não tocar)
- `card.draggable = !_modoSelecao` — arrastar é **desligado** no modo seleção.
- Eventos no card: `dragstart` / `dragend`; na coluna: `dragover` / `dragleave` / `drop`.
- No `drop` há **validação** (`podeAvancarEtapa`): doc recusado, impedimento ativo ou triagem
  bloqueada impedem o avanço. **Regra de negócio — não mexer.**

### 6. `undo-toast` — esta tela USA
`toastUndo()` é chamado em `kanban.html:351`. O CSS novo **precisa** das classes
`undo-toast-*`, senão o botão "Desfazer" (após mover em lote) fica sem estilo.

### 7. Total de classes: **70**
Inclui layout comum, `kanban-*` (colunas, cards, barra de lote), `legenda-*`,
badges, pílulas de faixa e o toast.

### 8. NÃO ALTERAR
Os blocos `<script>` inline, `js/data/clientes.js`, `js/utils.js`, `js/auth.js`,
`js/supabase.js`, banco, RLS, e as telas já entregues (Login, Dashboard, Agenda,
Clientes, Ficha).

---

## Estratégia
1. `css/kanban.css` isolado, no padrão dos módulos 2–4.
2. Reimplementar as 70 classes com a paleta nova, **mantendo todos os nomes**.
3. **Dar destaque visual claro** às 5 classes de estado — são o retorno da interação.
4. Colunas continuam colunas; cards continuam compactos.
5. Zero alteração em `.js` e nos `<script>` inline (provar por hash).

## Critérios de aceite
- [ ] Paleta e tipografia novas.
- [ ] **Arrastar funciona** e dá retorno visual (card levantado + coluna destacada).
- [ ] **Seleção em lote funciona**: entrar no modo, marcar, ver a barra, mover, desfazer.
- [ ] 6 colunas ativas por padrão; "Mostrar finalizados" revela Concluído e Perdido.
- [ ] A escolha do toggle persiste ao recarregar.
- [ ] Validação de avanço continua bloqueando (doc recusado / impedimento).
- [ ] Nenhum badge sem cor (incluindo `ctps` e `fgts`).
- [ ] Clicar num card abre a ficha certa.
- [ ] Sem erro novo no console.
- [ ] `git status js/` **vazio**.
- [ ] Telas já entregues inalteradas.

## Como validar
1. Local, logado, com dados reais.
2. **Arrastar um card** entre colunas e conferir o retorno visual.
3. Entrar no modo seleção, marcar 2 cards, mover em lote, **usar o Desfazer**.
4. Marcar/desmarcar "Mostrar finalizados" e recarregar a página.
5. Registrar evidência em `RESULTADO-05-KANBAN.md`.

## Rollback
`git revert <hash>` antes do deploy; `git revert -m 1 <hash-do-merge>` em `main` depois.
