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

Existem **duas** implementações do "isto bloqueia?":

| Onde | Função | Por quê existe |
|---|---|---|
| Kanban / listagem | `isTriagemBloqueadaSimples()` (`js/utils.js:~368`) | Kanban carrega só clientes+impedimentos, não pode rodar o triador completo |
| Ficha | `triagemMCMV().status === 'bloqueado'` (`js/utils.js:~476`) | Análise completa (docs + histórico) |

**As duas DEVEM concordar sobre o que bloqueia.** Se divergirem, o card trava no Kanban
enquanto a ficha diz "apto" — a usuária vê contradição e não sabe qual obedecer.
Foi exatamente o que aconteceu com `renda_insuficiente` até 2026-07-24.

**Nunca editar uma sem a outra.** Coberto por teste de paridade (9 cenários).

## Verificação obrigatória após editar

```bash
node tests/triagem-renda.test.js
```

Deve dar **45/45 verde**. Qualquer falha em `paridade:` significa que Kanban e ficha
divergiram — corrigir antes de commitar.

Checagens rápidas:

```bash
rg -n "grupos\.bloqueadores\.push" js/utils.js
```

Cada resultado precisa passar no teste mental acima. Hoje são: renda zero, CADMUT, doc recusado.

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
  Ver [AUDITORIA-2026-07-24.md](AUDITORIA-2026-07-24.md).
