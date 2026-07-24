# Auditoria EDR CRM — 2026-07-24

Auditoria estática conduzida por **Codex**, verificada de forma adversarial por **Claude**
(cada achado reaberto no código antes de aceitar). Complementada por auditoria de catálogo
do Supabase em modo leitura.

**Status:** Fase 0 corrigida e commitada em `dev`. **Sem push, sem deploy.**

---

## Fase 0 — Triagem bloqueava atendimento por renda (CORRIGIDO)

### Caso que originou

Cliente **EDMARCIO PEIXOTO DE SOUZA**, renda familiar **R$ 9.738,65**.
A ficha exibia, na mesma tela:

- `BLOQUEADO` (vermelho) · `Faixa MCMV: Fora do MCMV`
- `Auditoria de documentos: 100% (4/4)` · `Pasta Pronta para Envio ao Correspondente`

Contradição visível: sistema dizia travado e pronto ao mesmo tempo.

### Impacto real

Não era cosmético. `podeAvancarEtapa()` **impedia mover Triagem → Documentação**,
e a mensagem sugeria *"mova pra Perdido"*. Cliente documentalmente pronto ficava
inatendível, e a Elyda era orientada a descartá-lo.

### Causa-raiz

Dois defeitos somados:

**1. Tabela de faixas desatualizada** — `js/utils.js` limitava a Faixa 3 a R$ 8.000
(tabela 2024-2025) e não conhecia a Faixa 4. Pela Portaria MCID 333/2026, a Faixa 3
vai até R$ 9.600 e a Faixa 4 até R$ 13.000. **EDMARCIO é Faixa 4 — nem sequer é SBPE.**

**2. Confusão semântica** — `grupos.bloqueadores` misturava duas coisas:
- "não é elegível ao MCMV"
- "não pode prosseguir no trabalho"

Coincidem para CADMUT (impedimento legal). **Não coincidem** para renda alta, que é
desvio de rota. Quando um campo carrega dois significados, alguma regra sempre erra —
aqui, a que decidia se a Elyda podia trabalhar.

### Correção (commits `0f0f68d` + este)

- `MCMV_LIMITES` atualizado + `MCMV_VIGENCIA`; `calcFaixaMcmv()` retorna até 4
- `rotaFinanciamento()` nova — separa elegibilidade de rota (`mcmv` | `sbpe` | `indefinida`)
- `triagemMCMV()`: grupo **`desvios`** + status `fora_mcmv` (azul), distinto de `bloqueado`
- `isTriagemBloqueadaSimples()` não bloqueia mais por renda acima do teto
- UI: select de faixa, `.pill-faixa-4`, badge azul, bloco "Rota alternativa (não bloqueia)"
- Mensagens não sugerem mais "Perdido" por faixa de renda

**Inconsistência adicional encontrada na revisão:** `renda_insuficiente` bloqueava no
Kanban (`isTriagemBloqueadaSimples`) mas era classificada como *risco* no triador completo.
Card travado + ficha dizendo "apto com ressalva". **Regra decidida: é risco de crédito**
(reversível, quem decide é o banco — mesma natureza de `score_baixo`/`nome_sujo`).
Kanban alinhado ao triador, com teste de paridade cobrindo 9 cenários.

**Segunda divergência, encontrada pelo teste de composição:** cliente com documento
recusado podia ir de Triagem → Documentação pelo Kanban, mas era barrado pela ficha.
Causa: a ficha alimentava `triagemBloqueada` com `status === 'bloqueado'`, que inclui
documento recusado — informação **operacional**, já tratada pelo canal próprio
(`temDocRecusado`). Doc recusado era contado duas vezes na ficha e uma no Kanban.

Correção: bloqueadores de origem documental marcados com `origem: 'documento'`; novo campo
`elegibilidadeBloqueada` (só CADMUT/sem renda) alimenta `triagemBloqueada`. `status`
permanece intacto para o badge. Ver [CONTRATO-TRIAGEM.md](CONTRATO-TRIAGEM.md).

**Lição de método:** o primeiro teste de paridade comparava as funções isoladas com
`docs=[]`, o que neutralizava justamente a diferença. Só o teste da **composição completa**
— simulando como cada tela monta a decisão — expôs o problema. Contrato que promete mais
do que o teste prova gera confiança falsa.

### Regressão coberta

`tests/triagem-renda.test.js` — **54/54 verde**:

- Fronteiras exatas de cada faixa (3200/3200.01, 5000/5000.01, 9600/9600.01, 13000/13000.01)
- Caso EDMARCIO: Faixa 4, não bloqueia, avança para Documentação
- Renda > 13.000: `FORA DO MCMV`, avança mesmo assim, ações não citam "Perdido"
- Não-regressão: CADMUT, renda zero e doc recusado continuam bloqueando
- **Paridade de critérios compartilhados** (renda + impedimentos): 9 cenários
- **Paridade de composição completa** (inclui documento recusado): 9 cenários
- Prova de que o ternário de `triagemBloqueada` em `salvarStatus()` (`ficha.html`)
  **não** é bug — devolve booleano, não o objeto `_auditoria`

Validado também em navegador real via Playwright (o Browser pane bloqueia localhost).

### Não verificado

- Nada testado contra produção; telas reais não abertas com dados do Supabase
- Faixa 4 nunca gravada de fato no banco (coluna aceita — sem CHECK constraint)
- Clientes históricos mantêm `faixa_mcmv` antiga até reedição (ver `REGRAS-MCMV.md`)

---

## Auditoria de RLS/RPC (Supabase, leitura de catálogo)

Escopo: apenas catálogo. **Nenhum dado de cliente, CPF, documento ou agenda foi lido.**

### Resultado geral — melhor que o suposto

As 11 tabelas `crm_*` têm **RLS habilitada**. RPCs sensíveis validam no banco:
`crm_apagar_familia_lgpd` exige `role='admin'` (não confia na UI), `crm_revelar_cpf`
exige profile e grava auditoria. Todas `SECURITY DEFINER` com `search_path` fixado.

**Consequência para o XSS:** um XSS não vaza a base por RLS frouxa — mas vaza tudo que
a usuária logada enxerga, que neste modelo é a base inteira (ver item B).

### 🔴 A — `tracker_sync` exposto a anônimo (P0, EM ABERTO)

```
tracker_sync_elyda_anon | role: anon | cmd: ALL | using: key = 'elyda-agenda-v1'
tracker_sync_write      | role: public | cmd: INSERT | check: true
```

Somado a `GRANT SELECT,INSERT,UPDATE,DELETE ON tracker_sync TO anon`, e com a anon key
pública em `js/supabase.js:3` (repo público no GitHub Pages): **qualquer pessoa na
internet pode ler, alterar e apagar a agenda, sem login.**

Correção é no banco (revogar grant + trocar policy) — escrita em produção, exige
autorização explícita do Duam. **Não alterado nesta fase.**

### 🟡 B — Sem isolamento entre atendentes (P1)

`crm_user_has_profile()` retorna `true` para qualquer usuária com profile. Todas as
tabelas de negócio usam só isso: Elyda e Iannaline veem e editam tudo uma da outra,
inclusive `DELETE`.

Pode ser decisão de produto correta (3 pessoas, mesma operação) — mas precisa ser
**consciente**. Define o teto de dano de um XSS. **Pendente de decisão do Duam.**

### 🟡 C — Logs LGPD adulteráveis (P1)

`crm_cpf_audit_log` e `crm_lgpd_delete_log` têm `GRANT DELETE/UPDATE` para
`authenticated`. RLS não tem policy de DELETE/UPDATE (PostgREST barra), mas o grant
não deveria existir — trilha de auditoria precisa ser append-only.

### 🟡 D — `crm_config` legível sem checar profile (P1)

`auth_select_crm_config | SELECT | using: true`. Escrita é admin-only (correto).
Conteúdo não inspecionado (é dado, fora do escopo).

### 🟢 Confirmações positivas

- `ficha.html:321` (esconder botão por `role`) não é a única defesa — a RPC valida no banco
- `crm_profiles`: UPDATE restrito a `id = auth.uid()` + trigger anti-escalação
- `crm_historico`: INSERT exige `autor_id = auth.uid()`
- Grants amplos para `anon` em `crm_*` existem, mas **RLS bloqueia** (P2, defesa em profundidade)

### Não verificado

- `verify_jwt` das Edge Functions — MCP não expõe
- Conteúdo de `crm_config` — é dado
- Comportamento em runtime

---

## Fila de correção (acordada)

| # | Item | Grav. | Status |
|---|---|---|---|
| 0 | Triagem não bloqueia por renda | — | ✅ **corrigido**, aguarda deploy |
| 1 | `tracker_sync` aberto a `anon` | **P0** | 🔴 aberto — decisão de release |
| 2 | XSS persistente + logout | P0/P1 | ⏳ próxima fase |
| 3 | Datas UTC + undo do Kanban | P1 | ⏳ |
| 4 | Operações idempotentes/atômicas | P1 | ⏳ |
| 5 | OCR / IA / Drive sob LGPD | P1 | ⏳ |
| 6 | `deploy.sh` + migrations versionadas | P1 | ⏳ |

### Notas sobre a fila

**XSS:** `escapeHtml()` **já existe** (`js/utils.js:14`) e é usado corretamente em
`dashboard.js` e `agenda-widget.js`. O problema é adoção parcial, não ausência de
ferramenta — correção mais barata do que a lista sugere.

**Sessão em `localStorage`:** avaliado e **descartado como correção de curto prazo**.
Cookie `HttpOnly` exige backend/BFF na mesma origem; o CRM é estático no GitHub Pages.
E mesmo com `HttpOnly`, um XSS ativo age dentro da sessão sem precisar ler o token.
Fechar XSS é o que reduz risco. Item arquitetural de longo prazo.

**`deploy.sh`:** além do `git add .`, ele roda `sed -i` em todos os HTML + `js/utils.js`
**antes** do staging — staging cirúrgico é impossível sem repensar o cache busting junto.

**Achados que a auditoria estática não pegou:**
1. `sbDelete` sem `_retry401` (`js/supabase.js:54`) — dívida de helper, sem uso ativo hoje
2. `refreshSession()` (`js/auth.js:46`) — `catch` retorna `false` sem limpar sessão
3. **Sem `supabase/migrations/`** — schema, RLS e RPCs só existem no banco; sem rollback
   nem revisão. Causa-raiz de a auditoria de banco não ser possível pelo checkout.

**Correção de diagnóstico:** `js/auth.js:75-87` (logout) — o mecanismo é mais profundo que
"envia a chave pública": `sessionClear()` zera `_token` (global de `supabase.js:5`), então
`getToken()` retorna `null` e o fallback `|| SUPABASE_KEY` dispara. Supabase responde 401 e
o `catch {}` engole. **O logout server-side nunca funcionou, e é invisível.**
