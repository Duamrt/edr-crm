# Módulo 6 — Lotes · PROPOSTA DE DADOS (para aprovação)

**Data:** 2026-07-29
**Status:** ✅ **ESTRUTURA APLICADA EM PRODUÇÃO** em 2026-07-29 — as 3 tabelas, RLS,
índices e triggers existem e foram provados. Ver **seção 16**.
**A interface NÃO foi publicada** e os botões Salvar continuam desabilitados: gravação
ainda não existe.
**Regra travada por Duam:** não mexer nem apagar nada de `crm_lotes`. Os 7 vínculos
atuais ficam preservados até **Duam** validar caso a caso — **confirmado intacto** depois
da aplicação (31 lotes, 7 vínculos).

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
| `cidade` | text | **sim** | **lista controlada:** Jupi · Garanhuns · Lajedo · Jucati — ver seção 14 |
| `regiao` | text | **não** | bairro/zona, **texto livre e opcional** — ver seção 14 |
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
| `cidade` | text | **sim** | **lista controlada** (mesma da procura) — é o que cruza com a fila |
| `regiao` | text | **não** | bairro/zona, **texto livre e opcional** — refina o cruzamento quando existe |
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

### 1. Cidade controlada · região livre e opcional

**Cidade é obrigatória** e vem de **lista controlada**: **Jupi · Garanhuns · Lajedo ·
Jucati**. A validação da lista fica na **aplicação**, não no banco — assim entra cidade
nova sem precisar de migration.

**Região/bairro é texto livre e opcional.** Não existe lista de bairros, e não existe
opção "Outra": se a região é conhecida, escreve-se direto no campo; se não é, deixa
vazio. Campo obrigatório forçaria o usuário a inventar valor só para salvar, e a busca
por região passaria a mentir.

> ⚠️ **Por que `cidade` e `regiao` são dois campos, e não um só:** **"Centro" sozinho
> pode significar cidades diferentes.** Separar evita dado confuso desde o primeiro
> cadastro. Exibido como **`Garanhuns — Centro`** quando há região, ou só
> **`Garanhuns`** quando não há — nunca `Garanhuns — ?`.

> 📌 Esta seção foi **reescrita em 2026-07-29**. A versão original previa lista de
> bairros e opção "Outra região" — ambas descartadas pela decisão da seção 14, que é a
> que vale. Detalhes e consequências de schema: **seção 14**.

> 🗑️ **`docs/redesign/prototipo-lotes.html` foi REMOVIDO** (2026-07-29, decisão de Duam).
> Era a maquete estática feita antes da tela real, com dados fictícios. Ficou obsoleta:
> mostrava `Petrolina`/`Juazeiro` e a opção "Outra região", já descartadas.
> **Motivo da remoção, não da correção:** a tela real
> [`lotes.html`](../../lotes.html) já representa a direção nova, e manter duas versões
> só abre espaço para alguém consultar a errada.
> Recuperável pelo histórico do Git (commits `f86a59c` e `e8d60de`) se for preciso.

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
- ~~Quais cidades e regiões entram na lista inicial?~~ ✅ **DECIDIDO — ver seção 14.**
  Jupi · Garanhuns · Lajedo · Jucati. Região opcional.
  (Petrolina e Juazeiro apareciam aqui como exemplo meu, não como decisão — as
  cidades reais são outras.)
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

## 11. PRIMEIRA VALIDAÇÃO — branch `teste-lotes` (histórico) — 2026-07-29

> ⚠️ **Esta seção é histórica.** Ela registra a 1ª tentativa, que rodou uma versão
> pré-correção dos arquivos e serviu para achar o defeito do trigger. A validação
> que vale é a **seção 12**, feita na branch `lotes-v2` com os arquivos finais.

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
   passou a cobrir as 3 (`EXTRA 1/3`, `2/3`, `3/3`) — e essa cobertura ampliada foi
   **executada e aprovada** na seção 12.

3. **Contradição no `08`:** abria com "nada foi executado" e fechava com "validado em
   branch". Reescrito distinguindo produção · branch · versão atual. Hoje o arquivo
   registra a execução completa em `lotes-v2` (seção 12).

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

**Tratamento:** o setup roda com o claim `role=service_role`, que é o bypass que o
**próprio trigger** oferece ("necessário pra triggers/cron internos"). Não é contorno da
proteção — é a porta que o autor deixou. A leitura que serve de prova continua sendo
feita como `authenticated`. **Confirmado em execução** na seção 12.

### Produção conferida após destruir a branch
- Tabelas novas em produção: **0**
- `crm_lotes`: **31 registros** (intacta)
- Vínculos família↔lote: **7** (intactos)
- Sujeira de teste: 1 registro — **de 16/05, auditoria antiga**, não desta sessão.

---

## 12. VALIDAÇÃO DEFINITIVA — branch `lotes-v2` — 2026-07-29 ✅

**Autorizado por Duam.** Branch `lotes-v2` (`lrhpnbvghrfxbjlgvbdt`) criada, usada e
**DESTRUÍDA**. Produção não foi tocada. Aqui rodaram os **arquivos finais** `08` e `09`.

### 🐛 Causa do `MIGRATIONS_FAILED` — agora CONFIRMADA por log

A branch nasceu falhada de novo, mas desta vez o log foi capturado:

```
ERROR: relation "adicional_pagamentos" does not exist
```

no statement `CREATE INDEX idx_adicional_pagamentos_adicional_id`, da migration
`performance_indexes_edr_system` (17/04 — a **primeira** a rodar). Ela indexa tabelas do
EDR que nunca foram criadas por migration. Como cada migration roda em transação,
`migrations_aplicadas = 0` — nada foi registrado.

**Duas afirmações minhas anteriores estavam ERRADAS e ficam corrigidas aqui:**

| Eu dizia | O fato |
|---|---|
| "O CRM não usa migrations versionadas" | Usa **15**, incluindo o schema base e os 2 lockdowns de segurança |
| "A branch nasce sem schema" | A branch **aplica as 46 migrations** e falha na 1ª, que é do **EDR** — não por ausência de migrations |

**Caminho que funcionou:** aplicar à mão, na ordem original, o conteúdo exato das 15
migrations de CRM. Elas são autossuficientes (só dependem de `auth.users`, `auth.uid()`,
`gen_random_uuid()`) e passaram **15/15**.

### Resultado dos testes — arquivos finais
| Teste | Resultado | Evidência |
|---|---|---|
| Migrations CRM | **15/15** | cada `apply_migration` → `success: true` |
| Portão pré-`08` | **4/4** | `crm_profiles`, `crm_clientes`, função e trigger presentes |
| Estrutura | **OK** | 3 tabelas · dono `postgres` · RLS ativa · 4 policies e 1 trigger por tabela |
| **GRANT** | **PROVADO** | `has_table_privilege` = true para `anon` **e** `authenticated` (SELECT/INSERT/UPDATE/DELETE), **sem GRANT escrito** — o default ACL aplicou |
| **T1 anônimo** | **PASSOU** | dono lê **1** · `anon` lê **0**, mesmo dado |
| **T2 logado** | **PASSOU só no SELECT de `crm_procura_lote`** | com perfil: função=**true**, leu **1** · sem perfil: função=**false**, leu **0**. ⚠️ **1 de 12 policies** — ver achados 7, 8 e 9 |
| **T3 2ª procura ativa** | **PASSOU** | bloqueada; encerrada convive |
| **T4 2ª aceitação** | **PASSOU** | bloqueada |
| **Triggers `updated_at`** | **PASSOU 3/3** | `EXTRA 1/3`, `2/3`, `3/3` — agora de verdade nas 3 tabelas |
| Resíduo na branch | **0** | tudo em `ROLLBACK` |

### 🐛 Sexto achado: evidência que não batia com o arquivo (Codex)

O T1 **executado** usava temp table; o T1 **versionado** ainda tinha dois `select`
separados. O resultado era real, mas não vinha do arquivo — mesma armadilha do T2
comentado, em escala menor.

**Por que a variante foi necessária:** o conector MCP devolve só o resultado do **último**
`select`. Com dois selects, `t1a` sumia e sobrava "anon lê 0" — que sozinho não prova
nada, porque zero também é o que se vê quando o insert falhou. E `raise notice` (usado em
T3/T4) não volta pelo conector: o teste rodaria mudo, e silêncio pareceria sucesso.

**Correção:** T1, T2, T3 e T4 no arquivo `09` agora são **exatamente** o SQL executado —
temp table + `SELECT` final — e cada um traz o resultado real logo abaixo.

### Produção conferida após destruir a branch
- Tabelas novas: **0** · `crm_lotes`: **31** · vínculos: **7** · migrations: **46**
- `list_branches` → só a `main`

### 🐛 Sétimo achado: o T2 provava só leitura (Codex, 2026-07-29)

O `08` cria **4 policies separadas por tabela** — uma para `SELECT`, outra para `INSERT`,
outra para `UPDATE`, outra para `DELETE`. São regras distintas: provar uma **não** prova
as outras. Com 3 tabelas, a execução em `lotes-v2` exercitou as de `SELECT` e deixou
**9 das 12 policies sem teste** — justamente as que a tela vai usar para cadastrar uma
procura, mudar a situação e desfazer um engano.

**Correção:** o T2 no arquivo `09` foi ampliado para rodar as **quatro** operações como
usuário **com** perfil, e as mesmas quatro como usuário **sem** perfil (contraprova), mais
uma checagem de que o dado do setup sobreviveu.

Um detalhe que o teste precisa tratar de formas diferentes: sem perfil, o `INSERT` falha
com **erro** (a policy usa `WITH CHECK`, que é barreira), enquanto `UPDATE` e `DELETE`
afetam **zero linhas** sem erro (a policy usa `USING`, que funciona como filtro — as
linhas simplesmente não existem para quem não passa). Por isso a verificação final de que
a linha continua lá: sem ela, "removeu 0" poderia significar "não havia nada".

**Esta ampliação AINDA NÃO FOI EXECUTADA.**

### 🐛 Oitavo achado: a ampliação ainda não cobria as 3 tabelas (Codex, 2026-07-29)

A primeira ampliação media **leitura** em `crm_procura_lote` e **escrita** em
`crm_oportunidade_lote`, e nunca tocava `crm_procura_oportunidade`. Testar coisas
diferentes em tabelas diferentes dá **aparência** de cobertura sem cobertura: eram 4
policies de 12, não as 12.

**Correção:** o T2 virou uma **matriz** — um loop percorria as 3 tabelas aplicando as
mesmas 4 operações, com as 2 identidades. São 29 vereditos.

### 🐛 Nono achado: a matriz em loop tinha dois falso-verdes (Codex, 2026-07-29)

**Defeito 1 — o insert de ligação nunca chegava à policy.** Ele reusava a procura e a
oportunidade do setup, que **já estavam ligadas**. O par violaria a restrição de
duplicidade e falharia ali, antes de o RLS ser consultado — a policy apareceria como
reprovada sem nunca ter sido avaliada.

**Defeito 2 — 🚨 o grave.** A contraprova inseria com `cliente_id` e FKs **inventados**, e
classificava o resultado com `when others then PASSOU`. O erro real seria de chave
estrangeira (23503), mas o teste anotava *"policy bloqueou"*. **Um RLS completamente
aberto passaria nesse teste** — que é o oposto do que a contraprova existe para detectar.

**Correções:**

1. **Loop abandonado.** As três tabelas têm dependências diferentes demais para o mesmo
   código genérico: a ligação exige duas FKs válidas e um par ainda não usado, a procura
   exige um cliente, a oportunidade não exige nada. Três blocos explícitos e curtos são
   mais seguros que uma matriz elegante porém ambígua — e o SQL genérico escondia os dois
   defeitos atrás de strings.
2. **Todos os inserts usam IDs válidos** preparados no setup, incluindo uma oportunidade
   **livre** (sem ligação) só para o insert de teste da ligação.
3. **A contraprova só aceita `SQLSTATE 42501`** (`insufficient_privilege`) como bloqueio.
   Qualquer outro erro é **REPROVA por teste mal-montado**, com o código na mensagem.

Outros cuidados mantidos:
- **`crm_procura_oportunidade` não existe sozinha** — são 2 FKs obrigatórias. O setup
  monta a cadeia inteira: cliente → procura → oportunidade → ligação.
- **O insert de teste da procura usa `situacao='atendida'`** de propósito. O índice único
  parcial do T3 só cobre situações *ativas*; com `'procurando'` o teste bateria na regra
  de negócio e eu leria "REPROVOU" achando que era a policy.

### Cobertura de policies após `lotes-v2` (antes da execução final)

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|---|:--:|:--:|:--:|:--:|
| `crm_procura_lote` | ✅ | ❌ | ❌ | ❌ |
| `crm_oportunidade_lote` | ❌ | ❌ | ❌ | ❌ |
| `crm_procura_oportunidade` | ❌ | ❌ | ❌ | ❌ |

Era **1 de 12**. O que `lotes-v2` confirmou é que as 12 policies **existem** e estão
ativas — não que cada uma se comporta como deve. **Resolvido na seção 13.**

### Como cada policy será provada

| Operação | Com perfil (deve funcionar) | Sem perfil (deve barrar) |
|---|---|---|
| `SELECT` | conta as linhas do setup e confere o número exato | mesma contagem tem de dar **0** |
| `INSERT` | insere linha nova com IDs válidos e confere que voltou `id` | tem de falhar com **42501**; outro erro = teste mal-montado |
| `UPDATE` | altera a linha recém-criada e confere `row_count = 1` | `row_count = 0` (a linha é invisível para ele) |
| `DELETE` | remove a mesma linha e confere `row_count = 1` | `row_count = 0` |

Duas assimetrias que o teste respeita, porque vêm de como o Postgres aplica RLS:
- **`INSERT` falha com erro**, porque a policy usa `WITH CHECK` — é uma barreira.
- **`UPDATE`/`DELETE` afetam zero linhas sem erro**, porque a policy usa `USING` — funciona
  como filtro: a linha simplesmente não existe para quem não passa.

Por isso o bloco final confere que o dado do setup **sobreviveu**: sem ele, "removeu 0"
poderia significar apenas "não havia nada para remover".

---

## 13. EXECUÇÃO FINAL — branch `lotes-v3` — 2026-07-29 ✅

**Autorizado por Duam.** Branch `lotes-v3` (`qedtxzwdynivysqoqsez`) criada, usada e
**DESTRUÍDA**. Produção não foi tocada.

Como esperado, a branch nasceu em `MIGRATIONS_FAILED` (a migration de índices do EDR,
já diagnosticada na seção 12), mas com o banco `ACTIVE_HEALTHY`. As migrations de CRM
necessárias foram aplicadas à mão, na ordem, e o portão de pré-requisitos passou 5/5.

### As 12 policies — provadas uma a uma

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|---|:--:|:--:|:--:|:--:|
| `crm_procura_lote` | ✅ | ✅ | ✅ | ✅ |
| `crm_oportunidade_lote` | ✅ | ✅ | ✅ | ✅ |
| `crm_procura_oportunidade` | ✅ | ✅ | ✅ | ✅ |

Cada ✅ significa **duas coisas provadas**: funciona para quem tem perfil, e é barrado
para quem não tem. **29 de 29 vereditos `PASSOU`.**

### O detalhe que valida a correção do falso-verde

As três contraprovas de `INSERT` retornaram **`42501`** (`insufficient_privilege`) — o
erro do RLS. **Não** `23503` (chave estrangeira). Como os inserts usaram IDs válidos
preparados no setup, o único motivo possível de bloqueio era a policy — e foi ela.

Era exatamente essa distinção que a versão anterior não conseguia fazer: ela aceitava
qualquer erro como "bloqueado" e teria aprovado um RLS aberto.

### Demais testes, reexecutados nesta branch
| Teste | Resultado |
|---|---|
| **T1 anônimo** | **PASSOU** — dono lê 1 · `anon` lê 0 |
| **T3 2ª procura ativa** | **PASSOU** — bloqueada; encerrada convive |
| **T4 2ª aceitação** | **PASSOU** — bloqueada |
| **Triggers `updated_at`** | **PASSOU 3/3** |
| Resíduo na branch | **0** em todas as tabelas, inclusive `auth.users` |

### Produção conferida após destruir a branch
- Tabelas novas: **0** · `crm_lotes`: **31** · vínculos: **7** · migrations: **46**
- `list_branches` → só a `main`

### O que continua NÃO testado
- A tela `lotes.html` contra estas tabelas com dado real
- ~~Os formulários de cadastro — não existem ainda~~ → **os modais existem** (seção 15);
  o que não existe é a **gravação** (`sbPost`) — ver seção 17
- Qualquer coisa em celular

### Pendência única para produção
~~Definir a lista de cidades/regiões~~ — **decidida na seção 14.**

O banco está provado: estrutura, bloqueio de anônimo, regras de negócio (índices únicos
parciais), triggers e **as 12 policies de RLS com contraprova**.

---

## 14. CIDADES E REGIÕES — decisão de Duam, 2026-07-29 ✅

### Lista inicial controlada de cidades

| Cidade |
|---|
| Jupi |
| Garanhuns |
| Lajedo |
| Jucati |

**Cidade é obrigatória** e vem dessa lista. A validação fica na **aplicação**, não no
banco — assim entra cidade nova sem precisar de migration.

### Região/bairro: opcional nesta primeira versão

**Decisão de Duam:** *"não inventar bairros agora... assim não nasce dado falso como
'Centro' só para preencher campo"*.

Não existe lista real de bairros para essas quatro cidades. Um campo obrigatório
forçaria o usuário a escrever qualquer coisa para conseguir salvar — e aí a busca por
região passaria a mentir, o que é pior que não ter o dado.

**A sugestão de compatibilidade considera cidade e valor. Região é só contexto — não
filtra** (implementado assim na seção 21; região é texto livre e comparar texto digitado
à mão produziria falso negativo silencioso).

Quando houver lista real de bairros, o campo pode virar obrigatório por migration.

### Mudanças de schema que isso exigiu

**1. `regiao` passou a aceitar nulo.** Era `text not null` nas **duas** tabelas
(`crm_procura_lote` e `crm_oportunidade_lote`). Sem essa mudança, o campo obrigatório
produziria exatamente o dado inventado que a decisão evita.

**2. `regiao_outra` foi REMOVIDO** (achado do Codex, 2026-07-29). Ele existia para o caso
de a região ser `'Outra'` — uma regra que fazia sentido quando a região vinha de lista
controlada. Com região virando **texto livre opcional**, o campo passaria a ser uma
**segunda fonte para o mesmo dado**: quem lê teria de saber qual dos dois olhar, e os
dois poderiam divergir. Não existe mais regra `'Outra'` — se a região é conhecida,
escreve-se direto em `regiao`.

⚠️ **Estado quando esta seção foi escrita:** nenhuma das duas mudanças tinha sido
executada em banco, e inserir com `regiao` nula nunca havia sido testado — nas três
branches a coluna era obrigatória.

✅ **SUPERADO.** O arquivo `08` foi aplicado em produção (seção 17) com `regiao text`
nulável, e o nulo foi exercitado **duas vezes**: nas provas em `ROLLBACK` (seção 17) e
no teste real de gravação (seção 20), que gravou `"regiao":null` nas duas tabelas.

**O que isso faz com a validação da seção 13:** quase nada. As 12 policies chamam
`crm_user_has_profile()`, que não olha coluna nenhuma; os índices únicos parciais
filtram por `situacao`; os triggers escrevem em `updated_at`. Nenhum deles toca
`regiao`.

**O que deixou de estar coberto (na época):** inserir com `regiao` **nula** — caminho que
nenhum teste da branch percorreu, porque lá a coluna era obrigatória.
✅ **Coberto depois**, em produção: seções 17 e 20.

### Ajustes no protótipo `lotes.html`

- `cidadeRegiao()` mostrava **"Garanhuns — ?"** quando faltava região. Agora mostra só
  **"Garanhuns"** — ponto de interrogação transformaria dado ausente em ruído visual e
  pareceria erro de cadastro.
- O texto do estado vazio deixou de prometer casamento por região como se fosse sempre
  garantido; agora diz que combina por cidade e valor, e considera a região quando ela
  existe.
- A listagem de oportunidades já tratava região ausente corretamente — não precisou mudar.

---

## 15. FORMULÁRIOS DE CADASTRO — interface local — 2026-07-29

Dois modais em `lotes.html`. **Só interface: não gravam nada.**

**Decisão de ordem (Duam):** construir e validar a experiência de cadastro **antes** de
aplicar o SQL em produção. O contrário — criar estrutura real só para "ter onde testar" —
levaria a ajustar schema por causa de detalhe visual.

### Modal 1 — Registrar procura

| Campo | Tipo | Obrigatório | Observação |
|---|---|:--:|---|
| Família | `select` | **sim** | famílias ativas de `crm_clientes` |
| Cidade | `select` | **sim** | **lista fixa** — Jupi · Garanhuns · Lajedo · Jucati |
| Região / bairro | texto | não | livre, `maxlength=60`. Dica: *"Deixe vazio se não souber."* |
| Valor máximo | número | não | passo de 100 |
| Metragem desejada | número | não | m² |
| Preferências | texto | não | esquina, perto de escola… |
| Próxima ação | texto | não | |
| Prazo da ação | data | não | |
| Observação | textarea | não | `maxlength=500` |

### Modal 2 — Captar oportunidade

| Campo | Tipo | Obrigatório | Observação |
|---|---|:--:|---|
| Descrição | texto | **sim** | "Lote na Rua X, ao lado do nº 40" |
| Cidade | `select` | **sim** | **mesma lista fixa** |
| Região / bairro | texto | não | livre |
| Valor pedido | número | não | |
| Metragem | número | não | |
| Origem | texto | não | quem ofereceu / onde foi encontrado |
| Observação | textarea | não | |

### Regra das cidades no código

```js
const CIDADES = ['Jupi', 'Garanhuns', 'Lajedo', 'Jucati']
```

Controlada na **aplicação**: cidade nova entra editando essa linha, sem migration.
É o que torna a cidade *controlada* — o usuário **escolhe**, não digita. Região continua
texto livre, sem lista.

### Por que os botões Salvar estão travados

Ficam `disabled` com o aviso **"Disponível após ativação da estrutura"**, e **não têm
handler de gravação nenhum**. Isso é proposital: sem as tabelas, não há o que gravar, e um
handler que apenas mostrasse "em breve" seria um botão fingindo funcionar. O código de
escrita entra junto com a autorização do SQL em produção.

Os modais **abrem e podem ser preenchidos** — dá para conferir o desenho, a ordem dos
campos e o comportamento dos selects. O que está travado é só a gravação.

> ⚠️ **Corrigido na seção 17:** este parágrafo dizia que topo e Salvar seguiam o mesmo
> estado e "tudo destrava junto quando as tabelas existirem". Isso virou um **bug** assim
> que a estrutura foi aplicada. Hoje são duas travas independentes.

### CSS

Escrito em `css/lotes.css` (`.lt-modal-*`, `.lt-campo`, `.lt-grid2`), **não importado de
`css/style.css`** — esta tela é isolada por decisão do redesenho, e importar o CSS global
traria a identidade antiga junto.

### O que foi verificado

| Verificação | Resultado |
|---|---|
| Sintaxe JS (parser) | 2 scripts inline, **OK** |
| IDs duplicados | **nenhum** (41 ids) |
| `getElementById` sem elemento | **nenhum** — 17/17 têm alvo |
| Lista de cidades | confere com a decisão |
| Handler de gravação nos Salvar | **não existe** (correto) |
| `disabled` no HTML | presente nos dois |

### Correção de UX — a trava era ampla demais (Duam, 2026-07-29)

A primeira versão desabilitava **também** os botões do topo. Resultado: ninguém conseguia
abrir os modais para conferir os campos sem recorrer ao Console — uma gambiarra para uma
inspeção que devia ser trivial.

**Agora:** os botões do topo abrem os modais **sempre**, mesmo sem as tabelas. Abrir e
preencher não escreve nada. Só **Salvar procura** e **Salvar oportunidade** ficam
desabilitados, com o aviso *"Disponível após ativação da estrutura"*.

O aviso do topo passou a dizer *"Cadastro em ativação — dá para conferir os campos, ainda
não salvar"*, que descreve o estado real.

### ✅ Validação visual — FEITA (2026-07-29)

Servidor estático local + Playwright, com capturas conferidas uma a uma:

| Verificação | Resultado |
|---|---|
| Tela carrega no estado sem tabelas | ✅ aviso de ativação; listas vazias com texto próprio |
| Botões do topo clicáveis | ✅ ambos ativos |
| Modal **Registrar procura** abre | ✅ 9 campos, grade de 2 colunas |
| Modal **Captar oportunidade** abre | ✅ 7 campos |
| Select de cidade | ✅ exatamente Jupi · Garanhuns · Lajedo · Jucati, sem "Outra" |
| Botões Salvar | ✅ `[disabled]` lido no DOM; cinza, com aviso laranja ao lado |
| Cancelar fecha o modal | ✅ |

> Nota de método: uma tentativa anterior de captura foi interrompida e registrada como
> falha da ferramenta. A causa era externa ao código — a validação acima foi refeita e
> concluída.

### ⚠️ O que continua NÃO verificado

- **Tela pequena (mobile).** As capturas foram em viewport de desktop. O CSS tem
  `@media(max-width:560px)` que empilha a grade, mas isso não foi visto.
- **Gravação.** Não existe — é a pendência que depende do SQL em produção.
- **A tela real contra o banco.** O preview usou um *stub* que devolve 404 (o estado de
  hoje) e duas famílias de exemplo no select. Nenhuma chamada real ao Supabase.

---

## 16. ESTRUTURA APLICADA EM PRODUÇÃO — 2026-07-29 ✅

**Autorizado por Duam**, escopo nomeado: *"aplicar em produção somente a estrutura de Lotes
descrita em `08-LOTES-SQL-PROPOSTO.sql`... não faça deploy da interface ainda"*.

Migration: `crm_lotes_familias_procurando_oportunidade`.

### Preflight (antes de aplicar)

| Item | Antes |
|---|---|
| Tabelas novas | 0 |
| `crm_lotes` | 31 |
| Vínculos família↔lote | 7 |
| `crm_clientes` | 19 |
| `crm_user_has_profile()` | existe |

Auditoria do SQL antes de rodar: os únicos `alter table` são **nas tabelas novas**, para
ativar RLS. `crm_lotes` aparece **só em comentário**. A única referência a tabela
existente é a FK para `crm_clientes(id)` — leitura, não alteração.

### Rollback

```sql
drop table if exists public.crm_procura_oportunidade;
drop table if exists public.crm_oportunidade_lote;
drop table if exists public.crm_procura_lote;
drop function if exists public.set_lotes_updated_at();
```

Limpo: as 3 tabelas são isoladas e nada fora delas foi tocado.

### Estrutura criada

| Tabela | Dono | RLS | Policies | Índices | Triggers |
|---|---|:--:|:--:|:--:|:--:|
| `crm_procura_lote` | postgres | ✅ | 4 | 5 | 1 |
| `crm_oportunidade_lote` | postgres | ✅ | 4 | 3 | 1 |
| `crm_procura_oportunidade` | postgres | ✅ | 4 | 5 | 1 |

`authenticated` com SELECT e INSERT nas três (privilégio padrão do schema, sem GRANT
escrito).

### Provas em produção (tudo em `ROLLBACK` — nenhum dado deixado)

| Prova | Resultado |
|---|---|
| Procura com `regiao` **NULA** | ✅ aceitou nulo |
| Oportunidade com `regiao` **NULA** | ✅ aceitou nulo |
| Insert sem `cidade` | ✅ **bloqueado** — cidade continua obrigatória |
| Trigger `updated_at` (procura) | ✅ sobrescreveu data sabotada |
| Trigger `updated_at` (oportunidade) | ✅ sobrescreveu |
| `anon` lendo a fila | ✅ leu **0** — RLS ativa |

A pendência **"inserir com região nula nunca foi testado"**, aberta desde a mudança de
schema, está **fechada** — e agora contra o banco real.

### Preservação confirmada (depois de aplicar)

- `crm_lotes`: **31** · vínculos: **7** · `crm_clientes`: **19** — idênticos ao preflight
- As 3 tabelas novas: **0 registros**
- Único `TESTE%` em `crm_clientes` é de **16/05** (auditoria antiga já documentada), não
  desta sessão

### ⚠️ O que NÃO foi feito

- **Nenhum deploy de interface.** `lotes.html` em produção segue a versão antiga.
- **Os botões Salvar continuam desabilitados** — o código de gravação não existe.
- **Nenhum dado real cadastrado.**

### Próximo passo (exige autorização própria)

Conectar os dois Salvar (`sbPost`) e publicar a tela. São duas decisões separadas: ligar a
gravação e fazer o deploy.

---

## 17. TRAVA DE GRAVAÇÃO — 2026-07-29 🐛

### O bug que a aplicação do SQL criou

Achado do Codex, confirmado no código. Enquanto as tabelas não existiam, o desenho
funcionava por acaso: `desabilitarCadastro(true)` mantinha os Salvar travados, e ninguém
notava que **não havia handler de gravação**.

Quando a estrutura entrou em produção (seção 16), `sbGet` parou de dar 404 e
`desabilitarCadastro(false)` passou a rodar de verdade — **liberando os dois Salvar**. Não
existe `sbPost`, `sbPatch` nem `sbDelete` nesta tela. O usuário preencheria o formulário
inteiro, clicaria em Salvar e **nada aconteceria**: sem gravação, sem erro, sem aviso.

Botão ativo que não faz nada é pior que botão travado com aviso — o travado ao menos
explica o estado.

### A correção: duas travas independentes

```js
const GRAVACAO_IMPLEMENTADA = false
...
const bloqueado = semEstrutura || !GRAVACAO_IMPLEMENTADA
```

Os Salvar ficam desabilitados se **qualquer uma** das condições valer. Hoje a segunda
basta. O aviso muda conforme o motivo:

| Situação | Aviso |
|---|---|
| Tabelas não respondem | *"Disponível após ativação da estrutura"* |
| Tabelas ok, gravação não escrita | *"Cadastro ainda não foi liberado — em implementação"* |

O aviso do topo passou a acompanhar o **Salvar**, não a estrutura — antes ele sumiria com
as tabelas no ar enquanto o botão continuava travado, deixando a trava sem explicação.

**Ligar a gravação = escrever os dois `sbPost`, testar com sessão real e só então virar a
constante para `true`.** Uma coisa não vale sem a outra: a constante existe para que
liberar seja um ato consciente, num lugar só.

### Evidência — Salvar travado COM a estrutura ativa

Cenário simulado com `sbGet` respondendo OK (o estado real de produção hoje):

| Verificação | Resultado |
|---|---|
| Aviso no topo | ✅ *"Cadastro em implementação — dá para conferir os campos, ainda não salvar"* |
| Botões do topo | ✅ ambos clicáveis |
| Modal procura abre | ✅ |
| **`#mp-salvar`** | ✅ **`[disabled]`** lido no DOM |
| **`#mo-salvar`** | ✅ **`[disabled]`** lido no DOM |
| Aviso no rodapé dos modais | ✅ *"Cadastro ainda não foi liberado — em implementação"* |

Sintaxe JS: 2 scripts inline, OK.

### Estado real do módulo

| Item | Estado |
|---|---|
| Estrutura no banco | ✅ em produção (seção 16) |
| Modais / formulários | ✅ existem e abrem |
| Lista de cidades | ✅ fixa no código |
| **Gravação (`sbPost`)** | ❌ **não existe** |
| **Interface publicada** | ❌ **não** — produção segue a tela antiga |

**A interface NÃO está pronta para deploy.** Publicar agora entregaria formulário completo
com Salvar que não salva.

### Próximo passo (autorização própria)

1. Escrever as duas gravações (`sbPost` em `crm_procura_lote` e `crm_oportunidade_lote`)
2. Validar localmente com sessão real — cadastro de verdade, conferido no banco
3. Virar `GRAVACAO_IMPLEMENTADA` para `true`
4. Só então pedir deploy

São passos separados: implementar não é publicar.

---

## 18. GRAVAÇÃO IMPLEMENTADA (desligada) — 2026-07-29

Escopo autorizado: implementar as duas gravações **localmente**, com teste por stub.
Sem `sbPost` real, sem registro no banco, sem deploy. `GRAVACAO_IMPLEMENTADA` continua
`false` — os botões Salvar seguem desabilitados e **sem listener**.

### O que foi implementado

**Validação legível** (`validarProcura` / `validarOportunidade`)
Procura exige família e cidade; oportunidade exige descrição e cidade. Devolve lista de
campos faltando, que vira frase natural: *"Preencha a família e a cidade."* Sem isso o
banco recusaria e a pessoa veria erro técnico.

Espaço em branco **não** conta como preenchido — `.trim()` antes de checar.

**Payload** (`payloadProcura` / `payloadOportunidade`)
- Campo vazio vira `null`, nunca `''`. String vazia em coluna numérica quebra, e em texto
  opcional gera "preenchido com nada", que atrapalha busca depois.
- `situacao` **não** é enviada: deixa o `DEFAULT` do banco valer.
- `id` e `created_at` não são enviados.

**Tradução de erro** (`erroLegivel`)

| Código | Mensagem |
|---|---|
| `23505` em procura | *"Esta família já está na fila."* |
| `23505` em oportunidade | *"Este registro já existe."* |
| `23514` (check) | *"Algum valor não é aceito (verifique valor e metragem)."* |
| `23502` (not null) | *"Faltou preencher um campo obrigatório."* |
| `23503` (FK) | *"A família selecionada não foi encontrada. Recarregue a página."* |
| `401`/`403` | *"Sua sessão expirou ou você não tem permissão. Entre novamente."* |
| qualquer outro | *"Não foi possível salvar. Tente de novo; se continuar, avise o suporte."* |

O erro técnico completo vai para o `console.error` — a pessoa vê a frase, quem for
depurar vê o código.

⚠️ **Casa por CÓDIGO, não por texto.** A mensagem do Postgres muda com a versão e com o
idioma do servidor; o código não.

**Fluxo de sucesso:** confirma com toast, limpa os campos, fecha o modal e chama
`carregar()`. Recarregar tudo é mais simples e sempre coerente do que inserir a linha na
tabela local.

**Botão volta a ficar clicável** no `finally` — se travasse no erro, a pessoa perderia o
que digitou sem poder tentar de novo.

### CSS do toast

`toast()` vive em `js/utils.js` (já carregado), mas o CSS estava só em `css/style.css`,
que esta tela **não importa**. O aviso apareceria sem estilo nenhum. Escrito em
`css/lotes.css` na paleta do módulo.

### Testes locais — `docs/redesign/testes-lotes-gravacao.js`

```
node docs/redesign/testes-lotes-gravacao.js
→ 42 passaram, 0 falharam
```

O teste **lê o código do próprio `lotes.html`** e o executa em contexto isolado (`vm`), em
vez de copiar as funções. Assim ele acompanha a implementação: mudou a tela e quebrou
algo, o teste quebra junto.

Cobertura: validação (9), payload (8), tradução de erro (8), fluxo com stub (14) —
sucesso, campo faltando, duplicidade, erro genérico e botão reabilitado — e trava (3).

### 🐛 Um defeito encontrado no próprio teste

A asserção da trava lia `GRAVACAO_IMPLEMENTADA` do sandbox. Mas `const` declarado via
`vm.runInContext` **não vira propriedade do contexto** — o valor vinha `undefined`.

Como a asserção era `=== false`, ela falhou e me alertou. **Se eu tivesse escrito
`!GRAVACAO_IMPLEMENTADA`, `undefined` seria falsy e o teste passaria mesmo com a trava
LIGADA** — daria verde justamente quando não devia.

Corrigido para verificar no **arquivo-fonte**, com duas asserções: a constante está
`false`, e não existe `= true` em lugar nenhum.

### O que continua NÃO testado

**O `sbPost` real contra o Supabase.** Todo o teste roda com stub. Só um cadastro de
verdade prova que a gravação funciona ponta a ponta — RLS, sessão, tipos, constraints.

Também não testado: a tela renderizada após um salvamento real, e celular.

### Passo pendente

**Um teste com sessão real, gravando de verdade.** Isso é escrita em produção e, pelo
`docs/AUTORIZACAO-DEPLOY.md`, exige escopo próprio — inclusive para um registro "só de
teste". Decisão de Duam: usar um cadastro descartável e apagar depois, ou uma família
real.

Depois disso: virar `GRAVACAO_IMPLEMENTADA` para `true`, ligar os listeners nos Salvar e
só então pedir deploy. São passos separados.

---

## 19. A TRAVA QUE SE DESFAZIA — 2026-07-29 🐛

### Causa

Achado do Codex. O `finally` das duas gravações fazia:

```js
btn.disabled = false
```

Isso **desfazia a trava global**. Se `salvarProcura()` fosse chamada — por um listener
futuro, por engano ou pelo Console — o botão terminava **habilitado**, mesmo com
`GRAVACAO_IMPLEMENTADA = false`.

A intenção original era boa: se o botão travasse após um erro, a pessoa perderia o que
digitou sem poder tentar de novo. Mas a implementação reabilitava **na mão**, ignorando a
única fonte de verdade. Uma proteção que o próprio código anula não é proteção.

### Correção

```js
function restaurarEstadoBotoes() {
  desabilitarCadastro(!_estruturaPronta)
}
```

O `finally` agora **reaplica o estado central** em vez de mexer no botão diretamente. O
resultado sai do cálculo `semEstrutura || !GRAVACAO_IMPLEMENTADA` — a mesma regra de
sempre. Quando a gravação for ligada, o botão volta a reabilitar sozinho, sem código novo.

### Evidência — teste por sabotagem

Não basta o teste passar: ele podia estar passando sem exercitar o caminho. Então
reintroduzi o bug de propósito:

```
(com o bug de volta)   FALHOU  apos erro, botao segue BLOQUEADO  -> veio disabled=false
                       RESULTADO: 41 passaram, 1 falharam

(código restaurado)    RESULTADO: 42 passaram, 0 falharam
```

O teste **detecta** a regressão. Isso importa porque o teste anterior afirmava o
comportamento **errado** — exigia `disabled === false` após o erro, ou seja, validava o
próprio bug. Foi corrigido para exigir que o botão **continue bloqueado**.

### Comentário corrigido

Dizia *"não existe sbPost nesta tela"* — falso desde a seção 18. Agora registra o estado
real: as funções existem e chamam `sbPost`; o que não existe é **listener** ligando botão
a função. São duas barreiras independentes — mesmo que alguém ligue um listener por
engano, o botão continua desabilitado.

### Pendência

Inalterada: **teste com sessão real, gravando de verdade**. Escrita em produção, exige
escopo próprio de Duam.

Para ligar a gravação, os três passos **juntos**: testar com sessão real → adicionar os
listeners → virar `GRAVACAO_IMPLEMENTADA` para `true`. Nenhum vale sozinho.

---

## 20. TESTE REAL DE GRAVAÇÃO — 2026-07-29 ✅

Escopo autorizado por Duam: criar **uma** procura (família Raylane) e **uma**
oportunidade (Jupi) pela tela local autenticada, validar, e apagar exatamente
esses dois pelos IDs retornados. Sem deploy, sem commit, sem tocar em
`crm_lotes`, vínculos, clientes ou SQL/RLS.

### Perfil testado

`admin@edreng.com.br` — role **admin**. A conta da Elyda (`operador`) não foi
usada. ⚠️ Fica não provado se um perfil não-admin consegue gravar; a policy de
INSERT foi exercitada só por admin.

### Antes / depois

| | antes | depois |
|---|---|---|
| `crm_procura_lote` | 0 | 0 |
| `crm_oportunidade_lote` | 0 | 0 |
| `crm_lotes` | 31 | 31 |
| `crm_clientes` | 19 | 19 |
| vínculos (`lote_id` preenchido) | 7 | 7 |

Raylane intacta, com o `lote_id` original inalterado.

### Escrita — provada

**Procura** `2be3a146-9bbb-4c84-9d82-4324eed28433`
```json
{"cliente_id":"b5bfba07-...","cidade":"Jupi","valor_maximo":45000.00,
 "situacao":"procurando","regiao":null,"metragem_desejada":null}
```

**Oportunidade** `b617dc10-babb-4698-b42d-23d55dd43d6d`
```json
{"descricao":"LOTE TESTE - APAGAR - Rua Projetada, Jupi","cidade":"Jupi",
 "valor":40000.00,"situacao":"disponivel"}
```

Confirmações importantes:
- `situacao` veio do **DEFAULT do banco** nas duas — o payload não envia o campo,
  como projetado.
- Campos vazios gravaram `null`, não string vazia.
- Ambas gravadas com token de sessão real (`authenticated`), não anon nem
  `service_role`. É a policy que a equipe usa de verdade.

### Renderização — primeira vez com dado real

`renderFila()`: 1 linha — nome, `Jupi`, `R$ 45.000` formatado, vazios como `—`,
situação como label (`Procurando`, não `procurando`), empty state escondido,
contador `1 família`, modal fechou sozinho.

`renderOportunidades()`: 1 card — descrição, `Disponível`, `Jupi · R$ 40.000`.

Após a exclusão e novo `carregar()`: 0 linhas, 0 cards, os dois empty states
visíveis, contador `0 famílias`.

### 🔴 Achado — compatibilidade por cidade NÃO existe

O empty state promete: *"o sistema mostra quais famílias da fila combinam pela
cidade e pelo valor"*. **Não há código que faça esse cruzamento.**
`renderOportunidades()` apenas desenha o card.

Não é regressão — nunca foi construído. Mas é promessa visível na tela sem
função por trás. A oportunidade em Jupi (R$ 40.000) e a procura em Jupi
(teto R$ 45.000) casariam, e nada apareceu.

**Pendência:** implementar o cruzamento, ou remover a frase até existir.

### Exclusão — provada

`DELETE` por ID: **204** nas duas. Contagens de volta a 0/0, e as tabelas
vizinhas inalteradas (31/19/7).

### Estado final

`GRAVACAO_IMPLEMENTADA` de volta a `false`, listeners removidos, suíte local
46/0, e a tela viva reconfirmada: os dois Salvar desabilitados com o aviso
*"Cadastro ainda não foi liberado — em implementação"*, botões do topo
clicáveis. A autorização era para **provar a escrita**, não para liberar
cadastro.

### 🐛 Incidente de ambiente — `npx serve -s`

O login local não passava. **Dois fatos separados**, não confundir:

**Fato 1 — fallback de rota causou a tela errada. Confirmado.**
`serve -s` (modo SPA) devolve `index.html` para qualquer rota. Então
`/dashboard` entregava a tela de **Login**, que sem sessão fazia
`replace('index.html')`, devolvendo Login de novo. Provado por contraste: sem
`-s`, cada rota passa a devolver a própria página e rota inexistente dá `404`.

**Fato 2 — causa do `EMFILE`: NÃO CONFIRMADA.**
O servidor morreu com:

```
Error: EMFILE: too many open files, open 'index.html'
```

É plausível que as recargas repetidas tenham esgotado os descritores, mas
**isso não foi provado** — só se observou que os dois ocorreram na mesma
sessão. O `EMFILE` pode ter vindo do watcher de arquivos do `serve`, de outro
processo, ou de limite de handles do Windows independente do loop. Correlação
não é causa; fica como hipótese.

O que **está** provado: nenhuma requisição chegou ao Supabase — no log de rede
não há `/auth/v1/token`, só `js/auth.js` baixado 10× e depois `ERR_FAILED`.

**O `-s` é errado para este site**, que é multipágina, não SPA. Em produção não
acontece: o GitHub Pages serve `dashboard.html` como arquivo real.

✅ **Correto:** `npx serve . -l <porta>` — sem `-s`. Prova de que o loop acabou:
cada rota devolve a própria página (`Login`/`Lotes`/`Dashboard`/`Clientes`) e
rota inexistente dá `404`, em vez de tudo cair no Login.

### O que continua NÃO testado

- **Perfil não-admin** (Elyda) gravando — a policy de INSERT só foi exercitada
  por admin.
- **Celular.** A tela rodou em viewport estreito durante o teste, mas não houve
  conferência visual de layout mobile.
- **Erro real de rede/RLS na tela** — o caminho de erro só foi exercitado por
  stub, nunca com uma recusa de verdade do banco.
- **UPDATE e DELETE pela interface** — não existem botões para isso ainda.

---

## 21. COMPATIBILIDADE IMPLEMENTADA — 2026-07-29

Fecha o achado da seção 20: a tela prometia sugerir famílias compatíveis
(`lotes.html:93`) e não havia código para isso.

### A regra

Em `familiasCompativeis(oport)` — separada do desenho, para ser testável:

- **mesma cidade** (comparação exata; as 4 vêm de lista fixa, não digitação)
- **valor da oportunidade ≤ teto da família**
- **só famílias ativas**: `procurando` e `em_analise`

Sugestão **visual**. Não cria vínculo, não grava nada, não toca em `crm_lotes`.
Quem decide é a pessoa; a tela só aponta quem vale a pena olhar.

### Decisões que valem registrar

| Situação | Escolha | Por quê |
|---|---|---|
| Família **sem teto** informado | **entra** | Valor é opcional no formulário. Excluir sumiria com a família sem explicação nenhuma — falso negativo custa mais que falso positivo numa sugestão. Marcada com `title`. |
| Oportunidade **sem valor** | todas da cidade entram | Não há o que comparar. |
| `pausada` / `atendida` / `desistiu` | **fora** | Sugerir quem já desistiu é ruído que faz perder confiança na tela. |
| Região | só contexto, **não filtra** | Combinado com Duam. O texto do empty state já dizia isso. |

Nomes vão por `textContent`, nunca `innerHTML` — nome de família com `<` ou `&`
viraria HTML injetado.

### Testes — `docs/redesign/testes-lotes-compat.js`

```
node docs/redesign/testes-lotes-compat.js
→ 16 passaram, 0 falharam
```

Cobre cidade (4), valor (6, incluindo limite inclusivo e comparação numérica),
situação (4), ausência de efeito colateral (1) e o cenário real de 29/07 (1).

**Provado por sabotagem** — verde só vale se o teste pegar a regressão:

```
trocar Number(a) <= Number(b) por a <= b      → 15/1  (só o caso de string)
incluir desistiu/atendida/pausada em ATIVAS   → 12/4
código restaurado                             → 16/0
```

A primeira sabotagem é a mais traiçoeira: com string, `'9000' > '10000'` na
ordem alfabética, e a família some sem erro nenhum.

### Evidência visual — dados controlados em memória, nada gravado

| Oportunidade | Sugestão |
|---|---|
| Jupi · R$ 40.000 | **2 famílias:** Raylane (teto 45k) · Maria José (sem teto) |
| Jupi · R$ 75.000 | **1 família:** Maria José — Raylane sai, 75k > teto de 45k |
| Lajedo · R$ 35.000 | *Nenhuma família da fila combina com esta cidade.* |

Jonas (teto 30k) não aparece em nenhum: 40k já passa do teto dele. "Quem
desistiu" (Jupi, teto 90k) e "Outra cidade" (Garanhuns) também não — filtrados
por situação e por cidade.

### Estado

`GRAVACAO_IMPLEMENTADA` segue `false`, Salvar sem listener. Suítes: compat 16/0,
gravação 46/0.

### O que continua NÃO testado

- **Gravação com perfil não-admin** (Elyda) — único aceite funcional pendente
  antes de liberar cadastro.
- **Celular** — o CSS tem regra de toque em `≤640px`, mas não foi visto.
- A sugestão com **fila grande** (dezenas de famílias numa cidade): o card
  listaria todos os nomes em sequência, sem corte. Pode ficar longo.

---

## 22. CONSISTÊNCIA — 2026-07-29

Quatro achados do Codex, todos de coerência entre o que está escrito e o que o
código faz.

**1. Doc dizia que região entra na comparação.** Não entra — a regra da seção 21
usa cidade e valor. Alinhado ao código: região é contexto, não filtro. (Manter
assim porque região é texto livre; comparar "Centro" com "centro " sumiria com a
família sem erro nenhum.)

**2. Doc dizia que `regiao` nula "nunca foi testado".** Obsoleto, e o próprio
documento se contradizia. Confirmado por leitura antes de reescrever: `08:68` e
`08:125` declaram `regiao text` sem `not null`, e o nulo foi exercitado duas
vezes — provas em `ROLLBACK` (seção 17) e teste real (seção 20, que gravou
`"regiao":null` nas duas tabelas). Marcado como superado nos 3 pontos.

**3. `ATIVAS` renomeado para `SUGERIVEIS`.** O nome mentia: `pausada` é uma
procura ativa no banco e aparece na fila normalmente, mas não é sugerida — quem
pausou pediu para não ser procurado agora. Nome e comentário agora dizem isso.

**4. Lista visual cortada em 5 nomes.** Com fila grande o card viraria um
parágrafo. Mostra 5 + `"+ N outras famílias compatíveis"`. **A contagem total
continua no título** — vendo 5 nomes, a pessoa lê "12 famílias compatíveis".

### 🔴 Achado extra (não estava na lista)

A frase antiga de região estava **viva na tela**, não só no documento:
`lotes.html:93` prometia *"Se a família tiver informado uma região, ela também é
considerada"*. Corrigir só o documento deixaria a interface mentindo para quem
usa. Reescrito para *"A região fica registrada como contexto, mas não entra
nessa comparação."*

### Evidência

```
node docs/redesign/testes-lotes-compat.js    → 21 passaram, 0 falharam
node docs/redesign/testes-lotes-gravacao.js  → 46 passaram, 0 falharam
```

Cinco testes novos: nome da constante (guarda contra renomear de volta), a regra
devolvendo todas as 12 (o corte é só visual), o `MAX_NOMES = 5`, o sufixo
`+ N`, e a contagem total permanecendo no título.

Na tela, com 12 famílias em Jupi e uma oportunidade de R$ 40.000:

| | |
|---|---|
| Título | `12 famílias compatíveis:` |
| Nomes visíveis | 5 |
| Sufixo | `+ 7 outras famílias compatíveis` |

### Estado

`GRAVACAO_IMPLEMENTADA` segue `false`, Salvar sem listener, banco intocado.

### Continua NÃO testado

- **Gravação com perfil não-admin** — único aceite funcional pendente.
- **Celular.**

---

## 23. SUGESTÃO SÓ EM OPORTUNIDADE ATIVA — 2026-07-29

Dois achados do Codex, os dois sobre a tela induzir a conclusão errada.

### 1. A mensagem de vazio mentia

Dizia *"Nenhuma família da fila combina com esta cidade."* — mas o vazio tem
**duas causas**: pode não haver ninguém na cidade, ou pode haver e o teto não
comportar o valor. Quem lesse a frase concluiria que aquela cidade está sem fila,
e deixaria de procurar.

Agora: **"Nenhuma família compatível no momento."** Neutro, não afirma o que não
sabe.

### 2. Lote encerrado continuava sugerindo famílias

A sugestão rodava para qualquer situação. Um lote já vendido apontaria famílias,
e alguém ligaria para uma pessoa sobre um lote que não existe mais.

```js
const OPORT_SUGERE = ['disponivel']
```

| Situação | Sugere? | Por quê |
|---|---|---|
| `disponivel` | ✅ | é o caso de uso |
| `fechada` | ❌ | acabou |
| `perdida` | ❌ | acabou |
| `reservada` | ❌ **por ora** | ⚠️ **decisão pendente de Duam** |
| ausente/inválida | ❌ | não assumir `disponivel` por omissão |

⚠️ **`reservada` é decisão pendente, não regra fechada.** Reservado não é
encerrado — a reserva pode cair e o lote voltar ao mercado. Deixado sem sugestão
porque implementar por suposição seria pior. Há teste travando o comportamento
atual, para que mudá-lo seja deliberado.

Encerrada tem texto próprio — *"Oportunidade fechada — sugestões não se
aplicam."* — em vez de "nenhuma compatível", que soaria como se o sistema tivesse
procurado e não achado.

**O filtro fica dentro de `familiasCompativeis()`, não no desenho.** Assim a
função tem uma resposta só e qualquer chamador futuro herda a proteção; no
desenho, uma segunda tela que reusasse a função traria o bug de volta.

### Evidência

```
node docs/redesign/testes-lotes-compat.js    → 29 passaram, 0 falharam
node docs/redesign/testes-lotes-gravacao.js  → 46 passaram, 0 falharam
```

Oito testes novos. **Provado por sabotagem:** incluir as quatro situações em
`OPORT_SUGERE` → **25/4**; restaurado → **29/0**.

Na tela, com Raylane (teto 45k) e uma família de teto 20k em Jupi:

| Oportunidade | Mensagem |
|---|---|
| Disponível · R$ 40.000 | `1 família compatível: RAYLANE…` |
| Disponível · R$ 90.000 | `Nenhuma família compatível no momento.` |
| Reservada · R$ 40.000 | `Oportunidade reservada — sugestões não se aplicam.` |
| Fechada · R$ 40.000 | `Oportunidade fechada — sugestões não se aplicam.` |
| Perdida · R$ 40.000 | `Oportunidade perdida — sugestões não se aplicam.` |

A segunda linha é o achado: **há** famílias em Jupi, o teto é que não comporta.
A frase antiga teria dito que a cidade não tem ninguém.

### Estado

`GRAVACAO_IMPLEMENTADA` segue `false`, Salvar sem listener, banco intocado.

### Continua NÃO testado

- **Gravação com perfil não-admin** — único aceite funcional pendente.
- **Celular.**
- Screenshot desta rodada: o painel do navegador parou de compor frames; a
  evidência acima é a leitura do DOM renderizado, não imagem.

---

## 24. CELULAR — 2026-07-29 🐛

Pendência aberta desde a seção 20. **Tinha bug real.**

### O que estava quebrado (medido em 375×812)

```
innerWidth 375 · scrollWidth 486 · ROLA_HORIZONTAL: true
```

A página inteira rolava para os lados. Causa: a barra do topo — três botões de
142px lado a lado somavam **486px**. Também: botões com **34px** de altura,
abaixo do mínimo de 44px para toque.

⚠️ **A tabela NÃO era o problema.** `.table-wrap{overflow-x:auto}` já existia e
funcionava; ela rola por dentro, como deve. Uma medição anterior pelo painel do
navegador acusou a tabela, mas aquele viewport não estava sendo aplicado de
verdade (`body` media 1280px com viewport de 375) — número errado leva a
diagnóstico errado. Refeito com Playwright, viewport real.

### Correções (todas dentro de `@media(max-width:560px)`)

| Problema | Correção |
|---|---|
| Barra do topo vazando 111px | `flex-wrap` + botões dividindo a linha |
| Aviso em linha única de 892px | `white-space:normal` + `min-width:0` — a regra base tem `nowrap`, precisava ser sobrescrita |
| Botões de 34px | `min-height:44px` |
| Campos de modal 38–40px | `min-height:44px` em input/select/textarea |
| Fechar (✕) pequeno | `44×44` |

Mais uma trava: `.topbar,.page-content,.lt-sec,.card{max-width:100%;min-width:0}`
— nada nesta tela pode exceder a largura do celular, com a tabela como exceção
legítima.

### Depois

```
375px  →  scrollWidth 360 · ROLA_HORIZONTAL: false · 0 controles < 44px
560px  →  scrollWidth 560 · sem rolagem
1280px →  topbar em 1 linha (63px) · botões 142×34 · sem rolagem
```

Modal em 375px: largura 343, **nada vazando**, todos os controles em 44px.

**Desktop não regrediu** — as mudanças ficaram contidas na media query; conferido
em 1280px e no limite de 560px, onde media query costuma falhar.

### Nota de método

O Playwright abre navegador limpo e o `authGuard` mandava para o Login. Injetar
sessão falsa não resolveu: o `carregar()` chama o Supabase, toma 401, e o
`refreshSession()` sem `refresh_token` redireciona (`auth.js:34`). Solução:
fixture temporária `_layout-test.html` sem auth e sem chamada ao banco, **medida
e apagada** — não ficou no repositório.

### Evidência das suítes

```
compat    → 29 passaram, 0 falharam
gravação  → 46 passaram, 0 falharam
```

### Continua NÃO testado

- **Gravação com perfil não-admin** — o único aceite funcional que resta.
- **Celular físico** — medido em emulação 375×812, não em aparelho real.
- Screenshot: o painel do navegador parou de compor frames nesta rodada; a
  evidência é medição de DOM, que para layout é mais precisa que olhar.

---

## 25. CADASTRO LIBERADO — 2026-07-29 ✅

Duam autorizou ligar a gravação. As duas barreiras caíram juntas:
`GRAVACAO_IMPLEMENTADA = true` + listeners nos dois Salvar.

### O aceite que faltava mudou de natureza

Eu vinha pedindo "teste com perfil não-admin". **Esse perfil não existe.**
Consulta em `auth.users` + `crm_profiles`:

| Usuário | Role |
|---|---|
| Duam | admin |
| Elyda | admin |
| Iannaline | admin |
| Anderson | sem perfil no CRM |

Os três usuários reais são `admin`, e admin foi provado com escrita e exclusão
reais (seção 20). O risco que eu apontava — "e se o RLS recusar operador?" — não
existe hoje.

⚠️ **Fica registrado:** se um dia existir conta não-admin, testar o RLS dela
ANTES de liberar acesso. Este teste não cobre esse caso.

### Teste pré-deploy (produção, pela tela local autenticada)

Desta vez o registro foi criado por **clique real no botão**, não por chamada
direta — é o que prova o listener.

| | ID | resultado |
|---|---|---|
| Procura | `68efcf24…` | Jupi · R$ 45.000 · `procurando` (DEFAULT) |
| Oportunidade | `48348e4e…` | Jupi · R$ 40.000 · `disponivel` (DEFAULT) |

E a sugestão apareceu na tela: **"1 família compatível: RAYLANE NATHIELE DE
SOUZA ARAUJO"** — exatamente o que faltava no teste da manhã, quando o
cruzamento ainda não existia.

Limpeza: `DELETE` 204 nos dois. Depois: procuras 0, oportunidades 0,
`crm_lotes` 31, clientes 19, vínculos 7 — nada mais tocado.

### Suítes invertidas, não apagadas

Cinco testes travavam o cadastro DESLIGADO. Com a liberação, viraram o oposto:

- "após erro, botão segue bloqueado" → **"volta a ficar clicável"**. Com cadastro
  liberado, travar após erro faria a pessoa perder o que digitou.
- A seção "TRAVA DE SEGURANÇA" virou **"CADASTRO LIGADO"**, garantindo coerência
  entre as duas barreiras. O erro perigoso agora é o **meio-termo**: constante
  ligada sem listener (botão que não faz nada) ou listener sem constante (botão
  morto que parece ativo).
- Guarda que sobrevive à inversão: **ninguém mexe no `disabled` na mão** — sempre
  por `restaurarEstadoBotoes()`. Se a trava voltar a `false`, ela bloqueia
  sozinha.

```
gravação → 48 passaram, 0 falharam
compat   → 29 passaram, 0 falharam
```

**Provado por sabotagem:** voltar a `disabled = false` no `finally` → **46/2**;
restaurado → **48/0**.

### 🐛 Um teste que quase deu falso-negativo

A asserção "não mexe no disabled na mão" procurava a string `.disabled = false`
no corpo da função — e casava com um **comentário** que explica o bug antigo.
Corrigido para ignorar linhas de comentário. Teste que lê texto precisa saber
distinguir código de prosa.

### Comentário corrigido

`salvarProcura()` dizia *"sbPost devolve OBJETO, não array"*. Falso: devolve o
que o PostgREST mandar, e `js/data/clientes.js:19` normaliza os dois casos. Aqui
o retorno não é usado, mas o comentário induziria alguém a desestruturar direto.

### Continua NÃO testado

- **Perfil não-admin** — não existe conta assim hoje.
- **Celular físico** — medido em emulação 375×812 (seção 24), não em aparelho.

---

## 26. CORREÇÕES PÓS-DEPLOY — 2026-07-29

Dois achados do Codex depois do release. Nenhum toca a lógica.

### 1. Comentários que mentiam sobre o estado

Três lugares ainda diziam que o cadastro não grava, e um deles é a primeira coisa
que alguém lê ao abrir o arquivo:

| Onde | Dizia | Agora |
|---|---|---|
| Cabeçalho do modal | *"NÃO grava: o Salvar fica desabilitado até as tabelas existirem"* | *"Cadastro no ar desde 2026-07-29"* |
| Bloco da trava | *"continuam DESLIGADAS: sem listener… sem autorização"* | descreve a chave como jeito de **desligar** em manutenção |
| `MSG_SEM_GRAVACAO` | *"ainda não foi liberado — em implementação"* | *"Cadastro temporariamente indisponível"* |
| Aviso do topo | *"Cadastro em implementação"* | *"Cadastro indisponível no momento"* |

As duas últimas não são comentários: são **mensagens vivas**, que aparecem se
`GRAVACAO_IMPLEMENTADA` voltar a `false`. Foram reescritas, não removidas — o
mecanismo de desligar continua útil (manutenção, incidente no banco), só que
"em implementação" virou mentira depois do release.

O bloco da trava também ganhou o aviso que faltava: **não mexer no `disabled`
fora de `desabilitarCadastro()`** — foi exatamente assim que a trava foi
contornada uma vez (seção 19).

### 2. Relatório de deploy impreciso

Eu disse *"só dois arquivos mudam em produção"*. **Errado como escrito.** Filtrei
o diff por `*.html`/`*.css` excluindo `docs/`, vi 2 arquivos e reportei isso como
o total. O merge levou **17**.

Correto: **apenas Lotes teve mudança funcional** (`lotes.html` + `css/lotes.css`).
Os outros 15 receberam cache-buster nos `?cb=`, a versão do Service Worker
(`sw.js`) e `CRM_VERSION` em `js/utils.js` — tudo escrito pelo próprio
`deploy.sh`, comportamento esperado.

A diferença importa: "dois arquivos mudaram" sugere que o resto ficou intocado no
Git, o que não é verdade.

### Evidência

```
gravação → 48 passaram, 0 falharam
compat   → 29 passaram, 0 falharam
```

Diff só de comentário e string; nenhuma linha de lógica alterada.

### Continua NÃO testado

- **Perfil não-admin** — não existe conta assim.
- **Celular físico** — emulação apenas.
- O conteúdo servido em produção **após este commit** (é documental, mas só está
  no ar depois do próximo deploy).

---

## 27. MARCA OFICIAL NA SIDEBAR — 2026-07-29

Ajuste de identidade nas **sete telas** do CRM: Dashboard, Clientes, Ficha,
Kanban, Agenda, Lotes e **familia.html**. Não é específico de Lotes, mas fica
registrado aqui porque é onde mora o histórico do redesenho.

### O problema

A sidebar usava a letra **"E"** desenhada em CSS. Genérico — poderia ser qualquer
empresa com E no nome, enquanto o Login já exibia a marca real.

### A solução: asset derivado, não redesenhado

`img/edr-logo.svg` tem **15 paths**: 2 são o monograma (y 73–525) e 13 são as
letras de "EDR ENGENHARIA" (y 598–637), uma por path. A separação é limpa, então
deu para extrair o símbolo **sem redesenhar nada**:

- `img/edr-simbolo.svg` mantém os **paths 0 e 1 byte a byte**, com o mesmo
  `transform` do original
- `viewBox` recortado na caixa do monograma (`2247 940 7911 8412`), com 4% de
  respiro
- 5 KB, contra 17 KB do arquivo completo

⚠️ **Não redesenhar este arquivo.** Se a marca mudar, regerar a partir do
`edr-logo.svg` oficial. Está escrito no cabeçalho do próprio SVG.

### Decisões visuais

| Decisão | Por quê |
|---|---|
| Placa **off-white** (`--paper`), não `--lime-soft` | O símbolo tem traço preto + verde escuro da marca. Sobre verde-limão, o verde da marca brigava. |
| Símbolo a **68%** da placa | Em 76% ficava apertado e virava borrão nos tamanhos menores. Testado em 34/38/44px antes de escolher. |
| `<img>` dentro de `.brand-logo` | A regra da sidebar compacta esconde `div:not(.brand-logo)` — como o símbolo é `<img>` dentro do span, sobrevive sem regra nova. |

### Evidência

Desktop (1280px): placa 34×34, símbolo 23×23, fundo `rgb(247,246,239)`, SVG
carregado (`naturalWidth > 0`), texto "EDR CRM / GESTÃO MCMV" ao lado.

Sidebar compacta (760px): sidebar 96px, **símbolo visível e texto escondido** —
sem corte —, placa contida na sidebar, sem rolagem horizontal.

As seis telas: HTTP 200, `edr-simbolo.svg` presente, **zero** ocorrências do "E"
genérico. CSS balanceado nos seis arquivos.

### Não testado

- Celular físico.
- Como o símbolo se comporta em tela de altíssima densidade (é SVG, deve escalar,
  mas não foi visto).
