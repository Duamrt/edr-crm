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

## Evidência de PRODUÇÃO
(preencher após ./deploy.sh — confirmar HTML e css/login.css novos sendo servidos em crm.edreng.com.br)
