# Resultado — Módulo 2 (Dashboard)

**Data:** 2026-07-28
**Status:** estrutura do protótipo implementada e testada localmente. **NÃO deployado.**

---

## Histórico do módulo (2 tentativas)

### Tentativa 1 — commit `ff07302` — REPROVADA por Duam
Só paleta e tipografia sobre o HTML antigo. Resultado: Dashboard antigo repintado.
Duam comparou os prints e identificou a divergência:
> "a ideia do dashboard nao ta diferente do que foi atualizado ou eu to enganado?"

Veredito dele: **não publicar** — "seria entregar outra ideia visual".

### Tentativa 2 — ESTA — estrutura fiel ao protótipo
Escopo novo autorizado: montar o Dashboard aprovado, preservando dados e botões que já funcionam.
Regra adicional inegociável do Duam: **o número do painel verde tem que ser real, nunca fixo.**

---

## Arquivos alterados
- `dashboard.html` — `<body>` reestruturado: painel de foco (hero verde), reordenação dos blocos, títulos sem emoji, `#vencendo-card` movido para antes do painel (exigência do seletor CSS). **Scripts e IDs intocados.** Backup: `dashboard-ANTES-estrutura.html` no scratchpad.
- `css/dashboard.css` — painel de foco, KPIs com borda superior, `.dash-card-warn`, ordenação visual, responsivo do painel, correção do menu lateral em telas pequenas.
- `js/data/dashboard.js` — **alterado sob autorização expressa de Duam**, exclusivamente para
  remover o card de Lotes (`josue_reservados`/`josue_total`), que exibia números do loteamento
  antigo. Nenhuma outra função do arquivo foi tocada. Validado com `node -c` (OK).
  Backup: `dashboard-js-ANTES.js` no scratchpad. Detalhes na seção "Ajuste posterior" abaixo.
- `docs/redesign/02-DASHBOARD.md` — doc atualizada ANTES da alteração (exigência do Duam), com a mudança de escopo e os achados novos.
- **NÃO alterados:** os demais arquivos de `js/` (`agenda-widget.js`, `auth.js`, `supabase.js`,
  `utils.js`), `css/style.css`, `css/tokens.css`, banco, RLS, e **nenhuma outra tela**.

---

## 🔒 O número do painel é REAL — como isso foi garantido

O número grande do painel **é o próprio `#vencendo-badge`**, o mesmo elemento que o JS já preenchia com `itens.length` — a contagem real vinda da RPC `get_crm_docs_vencendo` (janela de 15 dias).

- O ID foi **movido** para dentro do painel; o JS continua encontrando-o por `getElementById`.
- **Nenhuma linha de JS foi criada ou alterada** para isso.
- No HTML o valor inicial é só um ponto (`·`), substituído assim que o banco responde.
- **Verificado por comando:** nenhum número chumbado no HTML do painel.

---

## Evidência de teste

### Verificado por comando (Claude)
- **Contrato de IDs: 25/25** presentes e únicos. ✓
- **Contrato de classes: 51/51** classes geradas pelo JS têm estilo no CSS (checagem automatizada; subiu de 43 para 51 porque a varredura passou a cobrir as classes de status dinâmico). ✓
- **`js/` — só `js/data/dashboard.js` modificado**, pela remoção autorizada do card de Lotes
  (ver "Ajuste posterior"). `agenda-widget.js`, `auth.js`, `supabase.js` e `utils.js` intocados. ✓
  *(Na etapa de reestruturação visual, antes desse ajuste, `git status js/` estava vazio.)*
- **Outras telas + `style.css` + `tokens.css` + `index.html`: 0 arquivos modificados.** ✓
- Dashboard não carrega `style.css` (0) nem `tokens.css` (0); carrega `dashboard.css` (1). ✓
- `dashboardCarregar()`, `logout()` e a CSP preservados. ✓
- Ordem dos irmãos correta (`#vencendo-card` antes de `.foco`), badge dentro do painel, card nasce oculto. ✓

### Teste dos DOIS estados do painel — PASSOU (6/6, com prova visual)
Página de teste isolada carregando o `css/dashboard.css` real, sem tocar em banco nem em credencial:

| Estado | Resultado |
|---|---|
| **A — com documentos vencendo** | título de alerta visível · número **3** em verde-limão · botão "Ver pendências" presente ✓ |
| **B — sem documentos vencendo** | "Nenhum documento vencendo agora" · **0** em cinza discreto · botão "Ver pendências" oculto ✓ |

Os 6 assertos passaram (título da página = "PASSOU"). Confirmado também por captura de tela em desktop (1440px): texto à esquerda, número à direita — igual ao protótipo.
Console: único erro é `favicon.ico` 404 **da página de teste** (não do CRM).

### Bug encontrado e corrigido ANTES de sair da máquina
O seletor irmão (`~`) do CSS só enxerga para frente. Na primeira montagem o painel ficou **antes** do `#vencendo-card`, o que faria o estado "tudo em dia" **nunca disparar** — o painel diria "documentos vencendo" mesmo com zero pendências (exatamente o número mentiroso que o Duam proibiu).
**Correção:** `#vencendo-card` movido para antes do painel no HTML, com a ordem visual restaurada por `order` no CSS. Comentários de aviso deixados nos dois arquivos.
`:has()` foi descartado de propósito — o projeto nunca usou, e não vale estrear técnica nova numa tela crítica.

### Ajuste extra (regressão evitada)
Ao remover os emojis do menu lateral, notei que o CSS antigo zerava a fonte dos links em telas pequenas (`font-size:0`) — o menu ficaria **vazio** no celular, já que o emoji era o único conteúdo visível. Corrigido: rótulos em texto, com largura da barra ajustada de 76px para 96px.

---

## O que NÃO foi testado
- **Dashboard logado com dados reais:** o navegador automatizado não tem sessão e o `authGuard()` redireciona para o Login (comportamento correto — a proteção funciona). **Depende do aceite do Duam.**
- **Cliques funcionais:** Atualizar, Sair, "Cobrei agora", "+ ADD" — não exercitados.
- **Celular (aparelho real):** o `@media` foi escrito e o painel foi verificado em desktop (1440px), mas não em aparelho real.
- **Produção:** nada publicado.

---

## Ajuste posterior — remoção do card "Lotes" (2026-07-28)

Após validar a tela com dados reais, Duam identificou que o card `4/28 · 24 livres`
mostrava números do **loteamento antigo do Josué**, que não correspondem mais à realidade.

**Autorização:** Duam liberou expressamente editar `js/data/dashboard.js` **apenas** para isso.

**O que foi feito:**
- Removido o card e as variáveis `josue_reservados` / `josue_total` do `renderKpis()`.
- Removido o skeleton correspondente em `dashboard.html`.
- `.kpi-grid` de 4 → 3 colunas; `@media` ajustados (antes deixariam 1 card órfão numa 2ª linha).
- **Não substituído** por outra métrica: "Tarefas hoje"/"Tarefas vencidas" já constam em
  "O que tá quebrado" e duplicariam a informação (decisão de Duam).
- Comentários deixados no código apontando para a documentação.

**Provas:**
- `node -c js/data/dashboard.js` → **OK** (sintaxe válida). ✓
- `renderKpis()` gera agora **3 cards**: Cobrar hoje · Em movimento · Concluídos no mês. ✓
- `josue` em código ativo: **0** (a única ocorrência restante é o comentário explicativo). ✓
- IDs do contrato: **25/25**. ✓
- Arquivos alterados: exatamente os 5 do escopo autorizado; **0** outras telas. ✓
- HTML servido: "Lotes" aparece só no link do menu lateral + comentário — **nenhum card**. ✓

**Pendência registrada:** o 4º card volta como **"Famílias procurando lote"** com número real,
somente quando o módulo Lotes existir. Nada de placeholder ou "0 oportunidades" até lá.

---

## Divergência consciente vs. protótipo
O protótipo tem o KPI "Documentos"; o CRM real gera "Concluídos no mês". A composição dos 4 KPIs é montada pelo JS (`renderKpis` reescreve o bloco inteiro), então trocá-la exigiria editar `js/data/dashboard.js` — **fora do escopo autorizado**. Só a aparência foi alinhada. O dado de documentos aparece com muito mais destaque no painel verde.

## Rollback
Por Git (NÃO existe `rollback.sh`): `git revert <hash>` antes do deploy; `git revert -m 1 <hash-do-merge>` em `main` depois de publicado.

## Fundação CSS
Continua anulada pelo revert `be1c89e`. O Dashboard novo **não depende** de `css/style.css` — a fundação segue guardada.

---

## Aceite visual — ACEITO por Duam (2026-07-28, local, porta 3215)

Validado por Duam no navegador, logado com dados reais:
- [x] Card `4/28 · 24 livres` **sumiu**.
- [x] Os **3 cards ocupam a linha inteira** (Cobrar hoje · Em movimento · Concluídos no mês).
- [x] Painel de foco mostrando **3 documentos**, coerente com a lista logo abaixo.
- [x] **Console sem erros.**

### ⚠️ Armadilha do cache local (registrar para não repetir)
Duam continuou vendo o card antigo mesmo após `Ctrl+Shift+R`. **Causa:** os scripts eram
carregados com `?cb=1785254937` — o cache buster do último deploy, que **não muda** ao editar
arquivos localmente. Para o navegador era a mesma URL, então servia a cópia em cache.

**Solução aplicada:** cache buster trocado para `?cb=1785333000` no `dashboard.html`.
**Lição:** ao testar mudança de JS localmente, trocar o `cb=` ou o navegador serve a versão velha —
e a validação vira falso-negativo (ou pior, falso-positivo). Em produção o `deploy.sh` faz isso sozinho.

## Pendente
- [ ] **Autorização explícita de deploy** (NÃO concedida — nada publicado).
- [ ] Cliques não exercitados: Atualizar, Sair, "Cobrei agora", "Ver pendências", "+ ADD".
- [ ] Celular real não validado.
- [ ] Estado "tudo em dia" não exercitado no CRM real (hoje há 3 documentos vencendo).
