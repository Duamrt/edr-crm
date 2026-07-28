# Resultado — Módulo 1 (Login)

**Data:** 2026-07-28
**Autorização:** Duam autorizou executar + publicar o módulo Login (mensagem nesta sessão).

## Arquivos alterados/criados
- `index.html` — reescrito (visual novo). Script de auth PRESERVADO verbatim. Backup do anterior em scratchpad (`index-ANTES.html`).
- `css/login.css` — NOVO, exclusivo do login.
- `img/edr-logo.svg` — NOVO, logo oficial copiada de Downloads (versionada).
- `docs/redesign/*.md` + `docs/redesign/assets/login-referencia.png` — documentação (Commit 1: `196e549` e `dafd1d4`).
- NÃO alterados: `js/auth.js`, `js/supabase.js`, telas internas, banco, RLS.

## Evidência de teste LOCAL (npx serve, porta 3212)
Testado por Claude, provas por comando/navegador:
- **IDs críticos preservados:** `#form-login #email #senha #btn-entrar #login-erro #loading` → todos presentes (grep = 1 cada).
- **Auth preservada:** `await login(email,senha)`, `sessionGet()`, `replace('dashboard.html')`, `invalid_credentials`, "Entrando...", "E-mail ou senha não conferem" → todos presentes.
- **CSP intacta:** 1 meta Content-Security-Policy (idêntica).
- **Scripts na ordem:** supabase → auth → utils → sw-register.
- **JS inline válido:** `node -c` no script extraído = OK. (node -c direto no .html NÃO vale — só no JS extraído.)
- **Servidor local:** index/css/logo servidos (HTTP 200). Servido = login NOVO ("Acessar operação", "Toda família tem"); zero vestígio do antigo (`login-box` = 0).
- **Console do navegador:** SEM erros.
- **Rede:** ZERO chamadas ao Supabase ao carregar (só ao submeter o form). Requisito cumprido.
- **Estrutura renderizada (accessibility tree):** EDR ENGENHARIA, headline, "Acessar operação", campos E-mail/Senha, olho "Mostrar senha", botão "Entrar no CRM", "Acesso restrito à equipe EDR", "Sistema operacional". Composição bate com a referência.

## O que Claude NÃO conseguiu testar (depende do aceite do Duam/Elyda)
- **Visual renderizado (pixels):** o ambiente não captura screenshot do navegador. A ESTRUTURA foi confirmada pela accessibility tree, mas a APARÊNCIA final (logo bem posicionada, split bonito, cores, responsivo desktop/mobile) precisa do olho do Duam.
- **Login end-to-end real:** não fiz login com credencial real. Aceite: usuário correto entra no dashboard; senha errada mostra "E-mail ou senha não conferem"; sessão existente pula o login.
- **Produção:** ver seção abaixo (preencher após deploy).

## Release isolado — fundação CSS NÃO vai neste deploy (plano B1)
O commit `1b46fe6` (fundação CSS, mexe em `css/style.css` = telas internas) estava em `dev` mas NÃO faz parte do módulo Login. Decisão do Duam: publicar SÓ o Login.

**Como foi isolado (sem rebase/reset/force push, sem alterar deploy.sh):**
- Criado commit de revert exclusivo `be1c89e` que anula o efeito de `1b46fe6`.
- `1b46fe6` **permanece no histórico** — para reaplicar na etapa Dashboard: `git revert be1c89e` (desfaz o desfazer).

**Provas exigidas antes do deploy (todas verdes):**
1. `css/style.css` em `dev` é **byte-a-byte idêntico** ao `main` — mesmo hash `1b3438878e4ea50dd58270285f070788a873a851`. Fundação sem efeito publicado. ✓
2. O revert tocou **só** `css/style.css`; não conflitou nem tocou Login (`index.html`, `css/login.css`, `img/edr-logo.svg`). ✓
3. Árvore de trabalho limpa (`git status --short` vazio). ✓
4. Arquivos que o merge leva: `index.html`, `css/login.css`, `img/edr-logo.svg`, `docs/redesign/*`. **Nenhum** fora de escopo (`css/style.css`, `js/auth.js`, `js/supabase.js` intocados). ✓

**Nota sobre CNAME:** `main` tem `CNAME` (crm.edreng.com.br) e `dev` nunca teve (divergência pré-existente). Testado merge `dev→main` em branch temporária: **CNAME preservado** — o domínio não cai. Branch de teste removida.

## Rollback (real, por Git — NÃO existe rollback.sh neste repo)
- **Antes do push:** os commits são locais. Reverter o commit indesejado com `git revert <hash>`.
- **Depois do deploy (produção):** reverter o merge publicado em `main`:
  `git checkout main && git revert -m 1 <hash-do-merge> && git push origin main`
  (o `-m 1` mantém a linha do `main` anterior ao merge). Em seguida `git checkout dev`.
- Também é possível reverter apenas o commit do Login: `git revert 2abb620` e republicar.

## Evidência de PRODUÇÃO (deploy 2026-07-28)
**Deploy:** `./deploy.sh` — merge `main`: `02d292d..beb1e02`. Cache buster: `1785254937`.

Verificado por `curl` em `https://crm.edreng.com.br`:
- `/` → **HTTP 200**, servindo o login NOVO: "Acessar operação", "Toda família tem", "Entrar no CRM", "Acesso restrito à equipe EDR", `css/login.css`. ✓
- Vestígio do login antigo (`login-box`) = **0**. ✓
- `/css/login.css` → **HTTP 200**, com as classes novas (`lg-wrap`, `lg-brand`, `lg-form-side`, `lg-btn`). ✓
- `/img/edr-logo.svg` → **HTTP 200** (logo oficial servida). ✓
- Cache buster aplicado: `css/login.css?cb=1785254937` (não ficou `cb=1`). ✓
- IDs da auth no HTML publicado: `#form-login #email #senha #btn-entrar #login-erro #loading` — **todos presentes**. ✓
- `/css/style.css` em produção **NÃO contém** `Plus+Jakarta+Sans` (= 0 ocorrências) → **fundação CSS não foi publicada**, como planejado. ✓

**Telas internas não afetadas:** no diff do deploy, dashboard/clientes/kanban/lotes/agenda/ficha/familia tiveram **0 linhas** de mudança não-cache-buster. `css/style.css`, `js/auth.js`, `js/supabase.js` **não** entraram no deploy. ✓

## Aceite funcional — PENDENTE (Duam/Elyda)
Claude NÃO testou login real (não usa credencial). Falta o aceite humano:
- [ ] Login com usuário correto → entra no Dashboard.
- [ ] Senha errada → mensagem "E-mail ou senha não conferem".
- [ ] Sessão existente → pula o login e vai direto ao Dashboard.
- [ ] Visual em celular (o `@media` existe, mas não foi validado em aparelho real).
