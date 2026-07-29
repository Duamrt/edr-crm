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
| `cidade` | text | sim | **lista controlada** — ver decisão 1 |
| `regiao` | text | sim | bairro/zona dentro da cidade — lista controlada |
| `regiao_outra` | text | não | preenchido quando cidade/região = "Outra" |
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

## 7. DECISÕES DE DUAM (2026-07-29) — conceito aprovado

### 1. Cidade e região: lista controlada
**Lista de cidades/bairros aceitos**, com opção **"Outra região"** + observação livre.
Evita bagunça sem limitar a operação.

> ⚠️ **Ajuste exigido por Duam antes do banco:** o campo passa a ser **"Cidade / região"**,
> exibido como **`Petrolina — Centro`**, **`Juazeiro — Zona Norte`**.
> **"Centro" sozinho pode significar cidades diferentes** — separar evita dado confuso
> desde o primeiro cadastro. Por isso a tabela tem `cidade` E `regiao`, não um campo só.

### 2. Uma procura ativa por família
Se a família aceita dois bairros ou duas faixas de valor, isso vira **preferência dentro
da mesma procura** — não duas procuras. Mudou de ideia: atualiza a procura e **mantém o
histórico**.
> Implicação técnica: restrição de unicidade em `cliente_id` para situações ativas
> (`procurando`, `em_analise`, `pausada`).

### 3. Só entra quem manifestou interesse real
**Não colocar todo cliente automaticamente na fila.** A entrada é um ato deliberado —
a família disse que está procurando lote.

### 4. Os 7 vínculos atuais ficam como estão
**Não viram procura automaticamente.** Cada caso será validado por Duam depois.
Nada de migração automática.

## 7b. Ainda em aberto (não bloqueiam o SQL)
- Quais cidades e regiões entram na lista inicial? (Petrolina e Juazeiro já citadas)
- Critério de ordenação da fila além da entrada.

---

## 8. Fronteiras respeitadas nesta etapa
- ❌ Nenhum SQL executado.
- ❌ Nenhuma tabela criada.
- ❌ Nada alterado em `crm_lotes` ou `crm_clientes`.
- ✅ Só leitura de contagens já feita e documentada em `06-LOTES-LEITURA-BANCO.md`.

**Próximo passo:** protótipo local da tela (sem tocar em banco). O SQL só é apresentado
**depois** que Duam aprovar este desenho.

---

## 9. IMPLEMENTAÇÃO DA TELA — 2026-07-29

**Decisão:** implementar a tela ANTES de o banco existir, com estado honesto.
**Motivo:** a tela antiga mostrava estoque fictício em produção. Trocar já remove a
informação errada, mesmo que a fila só ganhe dados depois das tabelas.

### Mudança
- `lotes.html` reescrito · `css/lotes.css` novo (isolado).
- **SAIU:** planta (`img/mapa-lotes.jpg`), quadras, "disponíveis", lotes avulsos,
  mapa arrastável (`initDrag`/`savePos`). Verificado: 0 ocorrências de cada.
- **ENTROU:** fila de famílias procurando + oportunidades captadas.
- Datas exibidas como "em 4 dias" / "02 ago" — nunca "02/08" solto (exigência de Duam).

### Evidência
- `node -c` no JS extraído: **OK** (245 linhas).
- Parte falsa removida: `mapa-lotes`, `quadra`, `avulso`, `initDrag`, `disponiveis` = **0**.
- `crm_lotes` **não é mais consultada por esta tela** (0 ocorrências), mas **continua**
  em `clientes.html` (2), `ficha.html` (4), `kanban.html` (2), `familia.html` (1) —
  o vínculo família↔lote está preservado.
- `js/` e as outras telas: **0 alterações**.
- Estado sem tabelas testado em prévia: avisa o que falta, mostra "Ninguém na fila ainda"
  e "Nenhuma oportunidade captada ainda". Sem erro cru, sem número inventado.

### Pendência
Os botões "+ Registrar procura" e "+ Captar oportunidade" avisam que a estrutura não
existe. Os formulários entram junto com as tabelas — **sem botão que finge funcionar**.

### Validado no teste 1 (sem precisar de branch)
`crm_user_has_profile()` retorna **FALSE** sem sessão:
`auth.uid()` = null · função = false · perfis = 0. Evidência do "anônimo bloqueado".

---

## 10. REVISÃO DE DUAM — 6 correções aplicadas (2026-07-29)

### Script de teste (`09-LOTES-TESTES.sql`)
| # | Achado | Correção | Evidência |
|---|---|---|---|
| 1 | **T1 era falso-verde**: tabela nasce vazia, `count=0` passaria com RLS ABERTA | Insere registro ANTES; prova que dono vê 1 e `anon` vê 0 | no script |
| 2 | **T4 reusava o cliente do T3**, que já ficava com procura ativa → falharia antes da dupla aceitação | T3 e T4 em transações próprias com `rollback`; T4 usa clientes `offset 2/3` + guarda de ≥4 clientes | no script |
| 3 | `set local role` sem transação explícita não é determinístico | Todos os testes de papel em `begin`/`rollback` | no script |

### Tela (`lotes.html`)
| # | Achado | Correção | Evidência |
|---|---|---|---|
| 4 | **Qualquer erro virava "estrutura não criada"** — depois do banco pronto, esconderia problema real | `tabelaNaoExiste()` testa só `404`. Demais erros → aviso vermelho + `console.error` | **5/5** casos testados: 404→transição · 401/403/500/rede→erro |
| 5 | Botões pareciam disponíveis | Nascem `disabled`, com `title` e rótulo **"Disponível após ativação da estrutura"**. Liberados só quando as tabelas respondem | captura |
| 6 | Aviso técnico sobre banco | Trocado por **"A fila de procura está sendo ativada. Nenhuma família foi registrada ainda."** | captura |

**Confirmado:** `node -c` OK · distinção de erro 5/5 · dois estados visualmente distintos
(âmbar "em ativação" × vermelho "erro ao carregar") verificados em prévia.
**Não testado:** tela logada com dados reais; testes 2/3/4 do SQL (dependem da branch).

---

## 11. VALIDAÇÃO EM BRANCH DESCARTÁVEL — 2026-07-29 ✅

**Autorizado por Duam.** Branch `teste-lotes` (`pxldvwlzvducninsfavo`) criada, usada e
**DESTRUÍDA**. Custo confirmado: US$ 0,01344/h. Produção não foi tocada.

### Resultado dos testes
| Teste | Resultado | Evidência |
|---|---|---|
| Estrutura | **OK** | 3 tabelas, 12 policies, 3 triggers criados sem erro |
| **T1 anônimo bloqueado** | **PASSOU** | dono lê **1** linha · `anon` lê **0** (mesmo dado) |
| **T2 logado liberado** | **PASSOU, com ressalva** | perfil real `c9718eb3…`: função=**true**, leu **1** — mas via SQL digitado à mão, não pelo arquivo `09` (que estava comentado), e sem contraprova |
| **T3 2ª procura ativa** | **PASSOU** | bloqueada; procura encerrada convive (histórico) |
| **T4 2ª aceitação** | **PASSOU** | bloqueada — o bug apontado por Duam está resolvido |
| Triggers `updated_at` | **PASSOU em 1 de 3** | só `crm_procura_oportunidade` foi exercitada — ver correção abaixo |

### 🐛 DEFEITO GRAVE que só apareceu por executar de verdade
O SQL reusava `set_crm_updated_at()` — a função padrão do CRM, que **existe** e parecia
a escolha certa. Mas o corpo dela é:

```sql
BEGIN NEW.ultima_atualizacao = now(); RETURN NEW; END;
```

Ela escreve em **`ultima_atualizacao`** (coluna de `crm_clientes`). As tabelas de Lotes
usam **`updated_at`**. **Aplicado em produção, todo UPDATE nas 3 tabelas estouraria erro
de coluna inexistente.**

**Correção:** função própria `set_lotes_updated_at()`. `set_crm_updated_at()` **não é
alterada** — continua servindo `crm_clientes`.

### 🐛 Segundo defeito: o teste EXTRA media errado
Comparava `updated_at` antes/depois dentro de uma transação. Mas `now()` é **constante**
dentro da transação (horário de início) — daria falso-negativo sempre, e `pg_sleep` não
ajuda. **Método correto:** sabotar o campo com `'2000-01-01'` e verificar se o trigger
sobrescreve. Com isso, `crm_procura_oportunidade` passou.

### 🐛 Terceiro e quarto defeitos: achados do Codex nos artefatos (2026-07-29)
Revisão posterior encontrou **2 problemas no arquivo de teste** e **1 na documentação**:

1. **`v_lid` usada sem existir.** O teste EXTRA sabotava `where id = v_lid`, mas a
   variável nunca foi declarada nem recebeu valor — o bloco **não compilaria**. (Havia
   ainda um `declare` no meio do corpo executável, inválido em PL/pgSQL.) Corrigido:
   `v_lid` e `v_v` no `DECLARE` do bloco, e `v_lid` recebe o id via `RETURNING`.

2. **"3/3 tabelas" era afirmação vazia.** O EXTRA exercitava **uma** tabela só. O teste
   agora cobre as 3 (`EXTRA 1/3`, `2/3`, `3/3`) — mas essa cobertura ampliada **ainda
   não foi executada**.

3. **Contradição no `08`:** abria com "nada foi executado" e fechava com "validado em
   branch". Reescrito distinguindo **produção** (nunca tocada) · **branch** (rodou a
   versão anterior, destruída) · **versão atual** (nunca rodou do início ao fim).

### 🐛 Quinto defeito: o T2 não era autossuficiente (achado do Codex, 2026-07-29)
Dois problemas no mesmo teste:

1. **Estava inteiramente comentado.** Nunca rodou a partir do arquivo `09`. O "PASSOU,
   leu 1 linha" veio de SQL que digitei à mão na branch — não do script versionado.
2. **Pedia um UUID de perfil já existente.** Mas a branch nasce sem dados. O teste
   travaria por falta de perfil, e isso seria confundido com falha de RLS.

**Correção:** o T2 agora é executável e cria a própria identidade dentro da transação
(`auth.users` → `crm_profiles`, nessa ordem, porque existe FK entre eles). E prova por
**contraste**, no mesmo dado: quem tem perfil lê **1**, quem não tem lê **0**. Um número
sozinho não provaria nada — só o par prova. Nenhuma leitura de superusuário é usada como
evidência, porque `postgres` tem `BYPASSRLS` e leria tudo mesmo com o RLS quebrado.

### 🐛 Armadilha encontrada ANTES de gastar branch
Ao preparar o T2, a leitura do catálogo revelou que `crm_profiles` tem o trigger
`trg_crm_profiles_block_self_escalation`, que em INSERT exige `NEW.id = auth.uid()`.
Sem sessão, `auth.uid()` é null, e o insert do perfil **abortaria** — o T2 falharia por
causa do trigger, não por RLS. É o mesmo padrão do defeito do `set_crm_updated_at()`:
dependência de ambiente invisível na leitura, fatal na execução.

**Tratamento:** o setup roda com o claim `role=service_role`, que é o bypass que o
**próprio trigger** oferece ("necessário pra triggers/cron internos"). Não é contorno da
proteção — é a porta que o autor deixou. A leitura que serve de prova continua sendo
feita como `authenticated`.

**Estado honesto:** os artefatos estão corrigidos, mas **os arquivos finais nunca
rodaram inteiros**. Provar isso exige uma nova branch descartável.

### Produção conferida após destruir a branch
- Tabelas novas em produção: **0**
- `crm_lotes`: **31 registros** (intacta)
- Vínculos família↔lote: **7** (intactos)
- Sujeira de teste: 1 registro — **de 16/05, auditoria antiga**, não desta sessão.
