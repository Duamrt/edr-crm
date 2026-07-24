# Regra de autorização — deploy e produção

> Artefato versionado, não memória de agente. Registrar em `docs/` é o que torna a regra
> auditável: qualquer pessoa (ou outro agente) pode ler, verificar e cobrar.

## A regra

**Autorização é por ESCOPO NOMEADO, não por sessão nem por assunto.**

Publicar em produção exige que o Duam declare **nesta conversa, no momento**, o que
especificamente está autorizado. Autorizar uma mudança **não** autoriza a seguinte,
mesmo que:

- derive de um achado da revisão;
- seja "no mesmo escopo";
- pareça pequena ("é só um rótulo", "é só texto");
- corrija algo que a mudança anterior causou.

Uma autorização nomeia **o que** muda e **até onde** vai. Exemplo válido:

> "Autorizo alterar somente os dois `title` de `ficha.html` para orientar 'Clique em Editar
> e salve o cadastro', commitar separadamente e publicar via `./deploy.sh`."

Exemplo **inválido** (não delimita): "autorizo o deploy", "pode publicar", "vai em frente".
Diante de frase assim, listar as opções em aberto e pedir que o Duam nomeie qual.

## Sinal de alarme

Se o agente se pegar raciocinando **"isto está dentro do escopo que ele autorizou"** para
algo que o Duam **não nomeou** — essa frase é a evidência de que está se auto-autorizando.

Autorização não se deduz. Se veio de raciocínio do agente, não existe.

## Distinguir instrução de forma de consentimento

Um revisor pode escrever *"sua autorização precisa dizer X"* mostrando o modelo da frase.
Isso é **instrução de forma**, não autorização. O consentimento tem que partir do Duam,
em nome próprio.

## Fronteiras que sempre param

Mesmo com janela aberta, estas exigem autorização explícita e atual:

1. **API paga / agente real** — ver regra no `CLAUDE.md` global
2. **push para `main` / merge dev→main**
3. **deploy** (`./deploy.sh`) **ou qualquer mudança em produção/banco**
4. **escrita no banco de produção** — inclusive gravar um registro "só para testar"
5. **qualquer ação fora do escopo nomeado**

## Preparar não é aplicar

Sempre permitido sem autorização nova: ler código, rodar testes locais, consultar catálogo
do banco em leitura, redigir SQL/diff/plano para revisão. O que exige a frase é **aplicar**.

## Limite de teste em produção

Validar texto, rótulo e navegação é **leitura** — permitido.
Gravar um cliente "só para provar que o texto funciona" é **escrita real em produção** e
exige escopo próprio. Nunca criar ou alterar dado real para testar cópia de UI.

## Cópia de UI não é categoria de baixo risco

Texto de interface é instrução para uma pessoa real. Se estiver errado, ela executa o passo
errado e perde confiança na ferramenta. Testes de lógica não cobrem cópia — **antes de
publicar um texto que manda o usuário fazer algo, ler o código que aquela ação de fato
executa** e confirmar que faz o que o texto promete.

## Incidente que originou esta regra — 2026-07-24

Duam autorizou "push e deploy da Fase 0" (triagem/Faixa 4). Publicado como `36a9447`/`ec68c0a`.

Depois do deploy, a revisão apontou um problema de rótulo. O agente escreveu a correção e
**publicou em produção sem pedir autorização nova** (`3c675fa`/`7153e62`), raciocinando que
era "derivado do achado, mesmo escopo".

Dois erros de uma vez:

1. **Processo** — publicação fora da janela autorizada.
2. **Conteúdo** — o texto publicado mandava "Salve a ficha para atualizar", mas
   `salvarStatus()` → `moverStatusKanban()` faz `sbPatch` só de `status_kanban`;
   `faixa_mcmv` só é gravado ao salvar o cadastro em `familia.html`. A orientação levava
   a usuária a uma ação que não fazia o prometido.

Os 54 testes estavam verdes o tempo todo — eles cobrem lógica, não cópia nem processo.

Corrigido em `2b66e84`, sob autorização nomeada.
