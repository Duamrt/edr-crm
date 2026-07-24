# Contrato — Triagem MCMV

> **Leia antes de editar `triagemMCMV()`, `isTriagemBloqueadaSimples()` ou `podeAvancarEtapa()` em `js/utils.js`.**
> Este documento existe porque a regra já foi quebrada uma vez (ver `AUDITORIA-2026-07-24.md`).

## Os três eixos — nunca misturar

A triagem responde **três perguntas distintas**. Confundi-las foi a causa do bug do EDMARCIO.

| Eixo | Pergunta | Quem decide | Onde vive |
|---|---|---|---|
| **Elegibilidade MCMV** | O cliente se enquadra no programa? | Regra federal (portaria) | `calcFaixaMcmv()` |
| **Rota de financiamento** | Por qual produto ele compra? | Renda + perfil | `rotaFinanciamento()` |
| **Bloqueio operacional** | A Elyda pode seguir trabalhando? | Impedimento real | `isTriagemBloqueadaSimples()` / `grupos.bloqueadores` |

**Regra de ouro:** não ser elegível ao MCMV **não** é bloqueio operacional.
Cliente fora do MCMV continua cliente — muda o produto, não o atendimento.

## O que bloqueia atendimento (e só isso)

Bloqueio operacional exige que a condição seja **impeditiva e não-reversível pela operação**:

| Condição | Bloqueia? | Por quê |
|---|---|---|
| **CADMUT** | ✅ Sim | Impedimento legal definitivo — já foi proprietário. Fato jurídico, não muda. |
| **Renda zero / não informada** | ✅ Sim | Sem dado não há o que avaliar. Resolve cadastrando a renda. |
| **Documento recusado** | ✅ Sim (etapas avançadas) | Trava o funil bancário de fato. |
| **Renda acima do teto MCMV** | ❌ Não | Desvio de rota → Faixa 4 ou SBPE. Cliente é *melhor*, não pior. |
| **Renda insuficiente para a faixa** | ❌ Não | Risco de crédito. Reversível: muda a composição familiar, a renda sobe. Quem decide é o banco. |
| **Score baixo / nome sujo** | ❌ Não | Risco de crédito. Mesma natureza. |
| **FGTS bloqueado** | ❌ Não | Risco, resolvível pela usuária. |

**Teste mental antes de adicionar algo a `bloqueadores`:**
> "Se eu bloquear isso, a Elyda perde tempo — ou evita perder tempo?"
> Se a condição pode mudar por ação de alguém, é **risco**, não bloqueio.

## Grupos de `triagemMCMV()`

```js
grupos = { bloqueadores: [], riscos: [], operacionais: [], desvios: [] }
```

- **`bloqueadores`** — impede prosseguir. Status `BLOQUEADO` (vermelho).
- **`desvios`** — muda a rota, **não** impede. Status `FORA DO MCMV` (azul).
- **`riscos`** — afeta aprovação bancária. Status `APTO COM RESSALVA` (amarelo).
- **`operacionais`** — fricção resolvível. 2+ itens → `APTO COM RESSALVA`.

Ordem do status final: `bloqueadores` → `desvios` → `riscos` → `operacionais` → `APTO`.

## ⚠️ Contrato de paridade — Kanban × Ficha

A decisão "pode avançar?" é montada em **duas partes**, e cada tela obtém cada parte
de um jeito diferente. O que precisa bater é o **veredito final**, não as funções isoladas.

| Critério | Kanban | Ficha |
|---|---|---|
| Renda + impedimentos | `isTriagemBloqueadaSimples()` → `_triagemBloqSet` | `triagemMCMV().elegibilidadeBloqueada` |
| Documento recusado | `_recusadoSet` (query própria em `carregar()`) | `_docs.some(d => d.status === 'recusado')` |
| Impedimento ativo | `_impSet` | `_imps.some(i => i.ativo)` |
| **Combinação** | `podeAvancarEtapa()` no handler de `drop` | `podeAvancarEtapa()` em `salvarStatus()` |

> Localizar com `rg -n "podeAvancarEtapa" kanban.html ficha.html` — números de linha
> envelhecem, nomes de função não.

### O que a paridade cobre — e o que não cobre

`isTriagemBloqueadaSimples()` cobre **apenas renda e impedimentos ativos**.
Ela **não** vê documentos — o Kanban não os carrega no atalho; usa `_recusadoSet` separado.

Por isso o contrato é: **paridade dos critérios compartilhados (renda + impedimentos)**,
mais **paridade do veredito final** de `podeAvancarEtapa()` com a composição completa.

### `elegibilidadeBloqueada` vs `status === 'bloqueado'`

`triagemMCMV()` expõe os dois. **Não são intercambiáveis:**

| Campo | Contém | Usar para |
|---|---|---|
| `status === 'bloqueado'` | elegibilidade **+ documento recusado** | exibir o badge na ficha |
| `elegibilidadeBloqueada` | **só** elegibilidade (CADMUT, sem renda) | alimentar `triagemBloqueada` |

Passar `status === 'bloqueado'` para `triagemBloqueada` conta documento recusado **duas
vezes** (ele já tem canal próprio em `temDocRecusado`) e trava Triagem → Documentação na
ficha enquanto o Kanban permite. Foi encontrado assim em 2026-07-24, pelo teste de composição.

Bloqueadores de origem documental são marcados com `origem: 'documento'` em
`grupos.bloqueadores` — é o que `elegibilidadeBloqueada` filtra.

**Nunca editar uma tela sem a outra.** Coberto por 9 testes de paridade de critérios
+ 9 de composição completa.

## Verificação obrigatória após editar

```bash
node tests/triagem-renda.test.js
```

Deve dar **54/54 verde**. Falha em `paridade:` = critérios compartilhados divergiram.
Falha em `composição:` = o veredito final das telas divergiu (inclui documentos).
Corrigir antes de commitar — nunca ajustar o teste para passar sem entender a causa.

Checagens rápidas:

```bash
rg -n "grupos\.bloqueadores\.push" js/utils.js
```

Cada resultado precisa passar no teste mental acima. Hoje são: renda zero, CADMUT, doc recusado
(este último marcado com `origem: 'documento'`).

```bash
rg -n "triagemBloqueada:.*status === 'bloqueado'" ficha.html kanban.html tests/
```

Deve retornar **vazio** — `triagemBloqueada` só aceita `elegibilidadeBloqueada`.
Usar `status === 'bloqueado'` aqui reintroduz a contagem dupla de documento recusado.

```bash
rg -n "(kanban|ficha|familia|clientes|lotes|dashboard|agenda|index)\.html:[0-9]+|(utils|auth|supabase|clientes|documentos)\.js:[0-9]+" js/ tests/ docs/
```

Deve retornar **vazio** — documentação e comentários citam **nome de função ou constante**,
nunca número de linha. Ponteiro de linha envelhece na primeira edição do arquivo e passa a
descrever um estado que não existe mais; foi a causa de três rodadas seguidas de correção
em 2026-07-24.

```bash
rg -n "renda > MCMV_LIMITES" js/utils.js
```

Deve retornar **vazio** — renda alta não bloqueia.

## Mensagens ao usuário

Nunca sugerir **"mover para Perdido"** por faixa de renda. "Perdido" é decisão comercial
da Elyda, não conclusão automática de cálculo de renda.

## Histórico

- **2026-07-24 (Fase 0)** — renda acima do teto saiu de `bloqueadores` → `desvios`;
  `renda_insuficiente` saiu do bloqueio do Kanban (alinhado ao triador); Faixa 4 adicionada.
- **2026-07-24 (Fase 0, revisão)** — `elegibilidadeBloqueada` criado; ficha deixou de usar
  `status === 'bloqueado'` para `triagemBloqueada`. Corrige divergência em que doc recusado
  travava Triagem → Documentação na ficha, mas não no Kanban.
  Ver [AUDITORIA-2026-07-24.md](AUDITORIA-2026-07-24.md).
