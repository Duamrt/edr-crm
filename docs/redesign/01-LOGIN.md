# Módulo 1 — Login (index.html)

**Criado:** 2026-07-28
**Status:** documentação + protótipo. NÃO implementado no CRM real. NÃO deployado.
**Arquivo real alvo:** `index.html` (raiz do repo edr-crm)
**Protótipo:** `C:\Users\Duam Rodrigues\Downloads\prototipo-login.html`
**Referência visual (versionada):** `docs/redesign/assets/login-referencia.png`
**Logo oficial (versionada):** `img/edr-logo.svg`

## Objetivo
Substituir a aparência genérica do login atual (card branco central "EDR CRM / Gestão MCMV") pela nova identidade "operação / construção civil", conforme referência aprovada por Duam. Split-screen: lado claro (marca) + lado verde escuro (formulário).

## Composição aprovada (referência)
**Lado esquerdo — claro (--paper):**
- Logo EDR ENGENHARIA (SVG original, sem reinventar marca/ícone/letra E).
- Headline serifada (Fraunces): "Toda família tem um próximo passo." (com "próximo" em itálico).
- Subtexto: "Gestão habitacional com clareza, controle e foco no que importa."
- Traços técnicos/arquitetônicos discretos + cruzes laranja pequenas (decoração leve, SVG/CSS, não emoji).

**Lado direito — verde escuro (--ink):**
- Título serifado "Acessar operação".
- Campo E-mail (label + input com ícone envelope embutido, sem card branco).
- Campo Senha (label + input com ícone cadeado + olho para revelar).
- Botão CTA verde-limão "Entrar no CRM".
- Rodapé: "Acesso restrito à equipe EDR" + indicador "Sistema operacional".

## O QUE NÃO PODE QUEBRAR (autenticação — manter EXATAMENTE)
O JS de autenticação atual de `index.html` deve ser preservado ao pé da letra:
1. `sessionGet()` no load → se já logado, `window.location.replace('dashboard.html')`.
2. Submit do form → `await login(email, senha)` (de `js/auth.js`) → sucesso → `replace('dashboard.html')`.
3. Tratamento de erro: `invalid_credentials`/`invalid login` → mensagens específicas (email malformado / senha curta / "E-mail ou senha não conferem"); senão `traduzirErro()`.
4. Estados do botão: "Entrando..." + disabled durante submit; volta a "Entrar" no erro.
5. `showLoading()`/`hideLoading()` no overlay `#loading`.
6. Scripts carregados: `js/supabase.js`, `js/auth.js`, `js/utils.js`, `js/sw-register.js`.
7. Os IDs que o JS usa NÃO podem mudar: `#form-login`, `#email`, `#senha`, `#btn-entrar`, `#login-erro`, `#loading`.
8. `autocomplete="username"` / `autocomplete="current-password"` mantidos.
9. CSP no `<meta>` mantida (não afrouxar).

**Resumo:** muda SÓ o HTML de apresentação e o CSS. O `<script>` de auth e os IDs ficam idênticos.

## Critérios de aceite
- [ ] Visual bate com a referência (split claro/escuro, logo real, headline serifada, CTA verde-limão).
- [ ] Logo é o SVG original inline (não a imagem gerada, não ícone reinventado).
- [ ] Login funciona: e-mail+senha corretos → entra no dashboard.
- [ ] Erro de senha errada → mensagem "E-mail ou senha não conferem".
- [ ] Já logado → redireciona direto pro dashboard (não mostra login).
- [ ] Botão mostra "Entrando..." durante o submit.
- [ ] Olho revela/esconde a senha.
- [ ] Responsivo: em mobile os dois lados empilham (marca em cima ou reduzida, form acessível).
- [ ] Sem emoji, sem card branco central, sem ícone genérico.
- [ ] `node -c` no HTML (script) válido.

## Como validar
1. **Protótipo:** abrir `prototipo-login.html` no navegador — conferir composição, logo, olho da senha, responsivo (encolher janela).
2. **Implementação real (quando autorizada):** rodar local (`npx serve -s .`), logar com usuário real de teste → deve entrar no dashboard; senha errada → mensagem certa; recarregar já logado → pula pro dashboard.
3. Registrar evidência (o que testou, o que passou, o que ficou pendente) em `RESULTADO-01-LOGIN.md` nesta pasta.

## Pré-requisito de implementação (obrigatório antes de editar index.html)
- **Copiar a logo para dentro do repo.** Hoje ela está em `C:\Users\Duam Rodrigues\Downloads\EDR LOGO preto.svg` (pasta pessoal). O CRM publicado NÃO consegue ler de lá. Copiar o SVG original para `img/edr-logo.svg` (ou inline no HTML) e referenciar essa cópia versionada. Nunca apontar para a pasta pessoal.
- Guardar a imagem de referência aprovada em `docs/redesign/assets/` (opcional, mas ajuda quem for validar depois).

## Pendências / decisões abertas
- Confirmar com Duam se o texto "Acessar operação" fica ou se prefere "Bem-vindo" / outro.
- Confirmar cor exata do CTA (verde-limão da referência vs. --green sólido).
- O protótipo usa fontes do Google (Fraunces/Jakarta/DM Mono) — na implementação real, garantir import (mesma pendência da fundação CSS).
- **Prova/validação:** `node -c` só checa a sintaxe do JS extraído — NÃO valida HTML nem prova que a tela renderiza. A validação visual real é abrir no navegador e conferir com o olho. Registrar em RESULTADO-01-LOGIN.md o que foi visto de fato.
