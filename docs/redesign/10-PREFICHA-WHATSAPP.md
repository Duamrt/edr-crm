# 10 — Pré-ficha WhatsApp (conversa → cadastro para conferência)

**Status:** implementado localmente em `dev` (2026-08-04) · **SEM deploy** · aguardando aceite visual do Duam
**Origem:** demo aprovada `DEMO-CRM-conversa-vira-ficha.html` (Downloads) — conceito "Pré-ficha para conferência"
**Arquivos:** `js/preficha.js` (novo) · `familia.html` (card + wiring + estilo) · `sw.js` (precache) · `tests/preficha.test.js` (novo)

## O que é

Etapa **opcional** no cadastro de família nova ([familia.html](../../familia.html)): a Elyda cola a conversa
do WhatsApp, clica **Organizar** e recebe uma **pré-ficha para conferência** — sugestões com a evidência
(termo/linha) que as gerou. Só depois de conferir ela clica **Transferir para o formulário**, que preenche
campos do formulário existente. **Nada é salvo automaticamente** — o fluxo de salvar continua sendo o botão
"Salvar família" de sempre.

Restrições respeitadas: **sem IA, sem API externa, sem banco novo, sem migration, sem Edge Function, sem custo**.
Leitura por regra simples de texto (mesma da demo). Render da conversa colada só via
`createElement`/`textContent` — nunca `innerHTML`.

## Mapeamento campos da demo → cadastro real

| Campo da pré-ficha | Campo real | Transferência |
|---|---|---|
| Cliente | `#nome` (familia.html) | Direta — **só se o campo estiver vazio** (precedente do OCR). Dispara espelho do titular na composição. |
| Telefone / WhatsApp | `#telefone` | Direta via `fmtTel()` — só se vazio. |
| Etapa sugerida | `#status_kanban` | Direta — chaves idênticas ao kanban real (`triagem`/`documentacao`/`correspondente`). **Precedência da decisão humana** (ver seção abaixo). |
| Cidade | **não existe campo** | Vai no resumo em `#observacoes` (divergência registrada abaixo). |
| Documentos + situação | **não é campo do formulário** | Vai no resumo em `#observacoes`. O checklist real (`crm_documentos`) é criado no salvar, todo `pendente`, por `criarFamiliaComChecklist` ([js/data/clientes.js:17](../../js/data/clientes.js)) — a pré-ficha **não altera** o checklist. |
| Impedimentos | **não é campo do formulário** | Vai no resumo em `#observacoes`. `crm_impedimentos` é gerido na ficha — a pré-ficha **não cria** impedimento. |
| Próxima ação / Responsável / Prazo / Evidência | **não existem campos** | Vão no resumo em `#observacoes`. |

**Rótulos:** fonte única em `js/utils.js` — `DOC_LABEL`, `IMPEDIMENTO_LABEL`, `KANBAN_LABEL`. A pré-ficha não duplica label.

## O que é sugerido · o que exige revisão · o que NÃO é preenchido

- **Sugerido com evidência:** cliente, telefone (se escrito), cidade (4 aprovadas), etapa (com termo que disparou),
  documentos com situação (`Pendente / Recebido / a enviar / Recusado / Não se aplica`), impedimentos (com termo+linha),
  próxima ação (com autor → responsável Família/Equipe EDR), prazo (com fonte).
- **Sempre exige revisão humana:** tudo. O botão Transferir só preenche campo vazio, mostra toast
  "Confira antes de salvar" e o submit continua manual.
- **Nunca preenchido:** CPF, data de nascimento, renda, FGTS, lote, composição familiar, data de contato —
  não há como inferir com segurança de uma conversa; se não está no texto, mostra "não identificado na conversa".
- **Nunca gravado:** cliente, documentos, impedimentos, histórico — zero writes até "Salvar família".

## Padrão do texto em Observações — aprovado 2026-08-04

O resumo transferido segue SEMPRE este formato (definido pelo Duam após o 1º aceite visual —
o bloco anterior era "texto de sistema despejado", difícil de bater o olho):

```
[PRÉ-FICHA WHATSAPP — CONFERIR]

Etapa sugerida: Documentação
Documentos:
• Comprovante de renda — Recebido / a enviar
• Carteira de trabalho — Não se aplica

Impedimentos: Nenhum sinal de alerta
Cidade citada: Jupi            ← só aparece quando detectada
Próxima ação: ta bom vou mandar hj a noite
Prazo: hoje
Responsável sugerido: Família — Marluce

Evidências da conversa:
• [14:16] Elyda: Falta o comprovante de renda do seu esposo ainda
• [14:23] Marluce: ta bom vou mandar hj a noite
```

Regras: decisão operacional primeiro, prova agrupada no fim em **ordem cronológica** (posição da
linha na conversa — funciona mesmo sem timestamp) e deduplicada — uma linha que sustenta
3 documentos aparece 1 vez; campos sem valor viram `—`; **zero ruído técnico** ("Mensagens lidas",
"Gerado sem IA", fonte do prazo etc. ficam fora do texto salvo). A justificativa da etapa
("porque menciona…") continua visível na pré-ficha da tela — só não vai pro texto salvo.

## Precedência da decisão humana (etapa) — corrigido 2026-08-04

A primeira versão preenchia a etapa se o select ainda estivesse em `triagem` (o default) — o que
sobrescreveria uma escolha manual **legítima** da Elyda por Triagem. Regra atual, centralizada em
`prefichaTransferencia()` ([js/preficha.js](../../js/preficha.js)) e coberta por teste:

- Qualquer mudança da operadora no select `#status_kanban` (evento `change`, que só dispara em
  interação humana) marca decisão manual → a pré-ficha **nunca mais** toca na etapa nessa tela.
- Depois que a pré-ficha aplica a etapa uma vez, transferências seguintes **não reaplicam** —
  inclusive se a Elyda corrigir a etapa de volta depois da aplicação.
- **Borda (corrigido 2026-08-04):** "aceita para etapa" ≠ "o select mudou visualmente". Se a
  sugestão coincide com o status exibido (ex.: formulário em Triagem + conversa sugerindo Triagem),
  a transferência conta como aplicação e **trava reaplicação futura** — uma segunda conversa
  sugerindo Documentação não sobrescreve. Antes, a trava só subia quando o select mudava de valor.
- Nome e Telefone seguem a regra existente: só preenchem campo vazio. Observações: anexa o resumo
  uma única vez (dedup por conteúdo). Nada disso altera o fluxo de salvar família.

## Divergências encontradas (demo aprovada × cadastro real)

1. **Cidade** — a demo tem o campo; o cadastro real não tem coluna/campo de cidade. Decisão local: registrar
   no resumo de Observações. Se o Duam quiser campo próprio, é mudança de schema (fora deste escopo).
2. **Situações de documento** — os rótulos aprovados na demo (`Recebido / a enviar` etc.) não são idênticos aos
   status do checklist real (`pendente/entregue/recusado/nao_aplicavel/vencido`). A pré-ficha mantém os rótulos
   aprovados como **sugestão textual**; mapear sugestão → status real do checklist seria um passo futuro, com
   decisão explícita (hoje seria write automático em `crm_documentos`, proibido nesta etapa).
3. **Responsável (Família/Equipe EDR)** — não existe no modelo de dados; fica só no resumo.
4. **Etapa** — o vocabulário da demo cobre 3 das 8 etapas do kanban (`triagem`, `documentacao`, `correspondente`).
   As demais não são inferíveis por conversa inicial — a regra nunca sugere `aprovado`+ .

## Limitações conhecidas da regra simples

- Matching por `includes` de termos: "comprovante de pagamento" não é detectado (não está no vocabulário) — correto;
  mas conversas com vocabulário fora da lista passam em branco.
- Ordem de etapas é fixa (`correspondente` > `documentacao` > `triagem`): conversa da Cleide sugere Documentação
  quando Triagem seria melhor — **visível e corrigível** pela justificativa "porque menciona…".
- Última frase de compromisso pode ser da Elyda ("me avisa…") — responsável sai "Equipe EDR" com a evidência ao lado.
- Nome do cliente exige padrão `[hh:mm] Nome:` com inicial maiúscula; prints/exports fora desse padrão → "não identificado".
- Linhas coladas com marcador de lista na frente (`•`, `-`, `*`, `>`) são normalizadas antes da
  leitura (corrigido 2026-08-04 — o marcador quebrava a separação autor:mensagem e "• [14" virava autor).
- UX: após Transferir, o campo Observações autoexpande até 320px pra conferência do resumo sem
  rolagem escondida; acima disso mantém scroll interno; resize manual preservado.
- Detecção de operadora é fixa no nome "Elyda".

## Como testar

```bash
node tests/preficha.test.js     # 71 asserções: 3 conversas aprovadas + vazio/malformado/malicioso + cidades + telefone + precedência da transferência
node tests/triagem-renda.test.js # regressão: continua 54/54
```

No navegador (local, sem deploy): `npx serve -s .` → login → Clientes → Nova família →
card "Organizar conversa do WhatsApp" → colar → Organizar → conferir → Transferir → conferir campos → **não salvar** se for só teste.

⚠️ **Gotcha de teste local:** se o Service Worker já tiver sido registrado numa visita anterior no
mesmo `localhost:porta`, ele serve o `js/preficha.js` **antigo** do precache (a `VERSION` do sw.js
só muda no deploy.sh). Antes de testar mudança de JS localmente: DevTools → Application →
Service Workers → Unregister + Clear storage, ou usar guia anônima. Não afeta produção.

## Como reverter

Remoção limpa, sem resíduo (nenhum dado é gravado pela feature):

1. `familia.html`: remover o bloco `<style>` da pré-ficha (head), o card `#card-preficha`, a linha
   `<script src="js/preficha.js…">` e o bloco de wiring `// ── Pré-ficha WhatsApp` no script inline.
2. `sw.js`: remover a linha `'js/preficha.js?cb=' + VERSION,` do precache.
3. Apagar `js/preficha.js` e `tests/preficha.test.js`.

## Evidências desta entrega (2026-08-04)

- `node tests/preficha.test.js` → **86 passaram, 0 falharam** (padrão fixo do resumo + ordem cronológica
  das evidências + 5 do caso "linha colada com bullet" que quebrava autor/responsável).
- Sabotagens: (1) regra "Não se aplica" removida → 2 testes acusaram; (2) respeito à escolha manual
  removido → teste acusou; (3) borda revertida (flag dentro do if de mudança visual) → os 2 testes
  da borda acusaram. Restauradas → 73/73.
- `node tests/triagem-renda.test.js` → **54 passaram, 0 falharam** (sem regressão).
- Navegador real (Playwright, Supabase stubado): escolha manual de Triagem → transferência mantém
  `triagem`; sem escolha manual → vira `documentacao`; após aplicação + correção manual da Elyda →
  segunda transferência mantém `triagem`. Zero erros de página.
