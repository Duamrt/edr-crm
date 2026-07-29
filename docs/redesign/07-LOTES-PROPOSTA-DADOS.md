# Módulo 6 — Lotes · PROPOSTA DE DADOS (para aprovação)

**Data:** 2026-07-29
**Status:** proposta em papel. **NENHUM SQL EXECUTADO. NADA CRIADO NO BANCO.**
**Regra travada por Duam:** não mexer nem apagar nada de `crm_lotes`. Os 7 vínculos
atuais ficam preservados até **Duam** validar caso a caso.

## O problema que isto resolve
A tela Lotes mostra planta, quadras e "disponíveis" de um terreno que não existe mais.
A EDR **não tem estoque de lotes** — tem **famílias procurando**. O CRM precisa registrar
essa procura, em vez de fingir um estoque.

---

## 1. Princípio do desenho: separar procura de estoque

| | `crm_lotes` (existe hoje) | **Estrutura nova** |
|---|---|---|
| O que é | Lote concreto, com número | O que uma família **procura** |
| Quantos | 31 registros, 7 vinculados | 1 por família na fila |
| Origem | Loteamento antigo + avulsos | Cadastro novo |
| Neste módulo | **Intocada** | Criada do zero |

**As duas convivem.** `crm_lotes` continua servindo Clientes, Ficha, Kanban e cadastro —
apagá-la quebraria 5 telas (13 referências, verificado em `06-LOTES-LEITURA-BANCO.md`).

---

## 2. Tabela nova: `crm_procura_lote`
Uma linha por família que está procurando. **Não duplica** o que já existe em
`crm_clientes` (faixa, renda, status na esteira) — apenas referencia.

| Campo | Tipo | Obrigatório | Para quê |
|---|---|---|---|
| `id` | uuid | sim | chave |
| `cliente_id` | uuid → `crm_clientes` | sim | de quem é a procura |
| `regiao` | text | sim | onde a família quer morar |
| `valor_maximo` | numeric | não | teto que ela suporta |
| `metragem_desejada` | numeric | não | tamanho pretendido |
| `preferencias` | text | não | esquina, aclive, perto de escola… (texto livre) |
| `situacao` | text | sim | ver estados abaixo — default `procurando` |
| `proxima_acao` | text | não | o que fazer em seguida |
| `proxima_acao_prazo` | date | não | quando |
| `observacao` | text | não | contexto |
| `created_at` | timestamptz | sim | entrada na fila |
| `updated_at` | timestamptz | sim | última mexida |

### Estados de `situacao`
| Estado | Significado |
|---|---|
| `procurando` | na fila, aguardando oportunidade |
| `em_analise` | recebeu uma oportunidade, avaliando |
| `pausada` | família pediu para esperar |
| `atendida` | conseguiu lote — sai da fila ativa |
| `desistiu` | não procura mais |

> **Sem inventar prazo ou prioridade automática.** Ordem da fila = ordem de entrada
> (`created_at`), até Duam definir outro critério.

### O que NÃO entra nesta tabela
- Faixa MCMV, renda, status na esteira → **já estão em `crm_clientes`**.
- Nome, CPF, telefone → **já estão em `crm_clientes`**. A fila só referencia.

---

## 3. Tabela nova: `crm_oportunidade_lote`
Um lote **real** que apareceu no mercado. **Começa vazia** — só recebe registro quando
uma oportunidade concreta surgir.

| Campo | Tipo | Obrigatório | Para quê |
|---|---|---|---|
| `id` | uuid | sim | chave |
| `descricao` | text | sim | como identificar ("Lote na Rua X, ao lado do nº 40") |
| `regiao` | text | sim | para cruzar com a procura |
| `valor` | numeric | não | preço pedido |
| `metragem` | numeric | não | tamanho |
| `origem` | text | não | quem ofereceu / onde foi encontrado |
| `situacao` | text | sim | `disponivel` · `reservada` · `fechada` · `perdida` |
| `observacao` | text | não | contexto |
| `created_at` | timestamptz | sim | quando foi captada |

> ⚠️ **Regra:** nada é pré-cadastrado aqui. Zero registros até existir oportunidade real.
> **Nunca migrar os 24 lotes A/B para cá** — eles são sobra do loteamento antigo, não
> oportunidades captadas.

---

## 4. Ligação entre as duas: `crm_procura_oportunidade`
Quando uma oportunidade aparece, ela é **relacionada** às famílias compatíveis. Uma
oportunidade pode servir a várias famílias; uma família pode avaliar várias oportunidades.

| Campo | Tipo | Para quê |
|---|---|---|
| `id` | uuid | chave |
| `procura_id` | uuid → `crm_procura_lote` | qual família |
| `oportunidade_id` | uuid → `crm_oportunidade_lote` | qual lote |
| `situacao` | text | `sugerida` · `apresentada` · `recusada` · `aceita` |
| `observacao` | text | por que recusou, o que faltou |
| `created_at` | timestamptz | quando |

> **A compatibilidade é sugerida, nunca automática.** O sistema pode *destacar* famílias
> cuja região e valor batem, mas quem relaciona é a pessoa. Nada de "match" automático
> decidindo por conta própria.

---

## 5. O que muda na tela `lotes.html`

### SAI (a parte falsa)
- Planta / mapa de quadras
- Quadras A e B como estoque
- Contagem de "disponíveis"
- Qualquer número que sugira que a EDR tem lotes à venda

### FICA
- **Nada é apagado do banco.** Os 31 registros de `crm_lotes` permanecem.
- O vínculo família↔lote continua funcionando em Clientes, Ficha e cadastro.

### ENTRA — duas partes, conforme definido por Duam
**Parte 1 — Fila de famílias procurando lote**
Lista com: família · região · valor máximo · metragem · preferência · próxima ação · situação.
Ordenada por entrada na fila. Filtro por região e por situação.

**Parte 2 — Oportunidades captadas**
**Começa vazia**, com estado explícito: *"Nenhuma oportunidade captada ainda."*
Sem número inventado, sem placeholder. Quando surgir uma, entra aqui e pode ser
relacionada às famílias da fila.

---

## 6. Dashboard — só depois
O 4º card do Dashboard (removido no módulo 2) volta como **"Famílias procurando lote"**
com a contagem real de `crm_procura_lote` onde `situacao='procurando'`.

> **Enquanto a tabela não existir e não tiver dados reais, o card NÃO volta.**
> Nada de "0 oportunidades" ou placeholder — regra já registrada em `02-DASHBOARD.md`.

---

## 7. O que NÃO está decidido (perguntas para Duam)

1. **`regiao` é texto livre ou lista fixa?** Lista evita "Centro"/"centro"/"Centro-PE" como
   coisas diferentes, mas exige definir as regiões antes.
2. **Uma família pode ter mais de uma procura ativa?** (ex.: aceita dois bairros com tetos
   diferentes). O desenho atual permite; se não fizer sentido, vira restrição de 1 por família.
3. **Quem entra na fila?** Toda família cadastrada, ou só quem manifesta interesse?
4. **Os 7 vínculos atuais** viram procura, ficam como estão, ou é caso a caso?
   *(bloqueia a migração, não este desenho)*

---

## 8. Fronteiras respeitadas nesta etapa
- ❌ Nenhum SQL executado.
- ❌ Nenhuma tabela criada.
- ❌ Nada alterado em `crm_lotes` ou `crm_clientes`.
- ✅ Só leitura de contagens já feita e documentada em `06-LOTES-LEITURA-BANCO.md`.

**Próximo passo:** protótipo local da tela (sem tocar em banco). O SQL só é apresentado
**depois** que Duam aprovar este desenho.
