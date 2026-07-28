# Redesenho Visual EDR CRM — Visão Geral

**Criado:** 2026-07-28
**Status:** protótipo aprovado por Duam (direção visual das 5 telas + login). Aprovação é DO PROTÓTIPO — NÃO autoriza alterar CRM real, banco ou produção.

## Objetivo
Repaginar a aparência do EDR CRM mantendo 100% do funcionamento. Nova identidade "operação / construção civil": verde escuro, papel off-white, laranja de acento, tipografia serifada (Fraunces) nos títulos + Plus Jakarta Sans no corpo/números + DM Mono em metadados. Zero emoji em UI de produção.

## Regra de ouro (processo — um módulo por vez)
Para CADA módulo, nesta ordem, sem pular:
1. **Documentar** — criar doc versionada (objetivo, o que não pode quebrar, critérios de aceite, como validar). ANTES de alterar.
2. **Implementar localmente** — editar o arquivo real, sem deploy.
3. **Testar local** — verde antes de mostrar.
4. **Duam valida** — visual e funcional.
5. **Autorização explícita de deploy** — nova, específica daquele módulo. Aprovar protótipo ≠ autorizar deploy.
6. **Publicar** (`./deploy.sh`).
7. **Registrar resultado** — evidência do que foi testado + o que ficou pendente, nesta pasta.

Memória do agente NÃO é registro oficial. O registro oficial é esta pasta `docs/redesign/`.

## Ordem obrigatória de ataque
1. Documentação do desenho (esta pasta)
2. **Login** ← primeiro módulo a ser feito
3. Dashboard
4. Agenda
5. Clientes + Ficha
6. Kanban
7. Lotes

## Paleta e tipografia (tokens do novo visual)
- `--ink:#17352a` (verde escuro / sidebar / fundo login) · `--green:#164b37`
- `--paper:#f7f6ef` (papel) · `--card:#fffefa`
- `--orange:#e86d1c` (acento) · `--lime:#e2f4c2` / verde-limão CTA
- `--line:#dce2d8` · `--muted:#718176`
- Fontes: **Fraunces** (títulos serifados), **Plus Jakarta Sans** (corpo/números), **DM Mono** (labels/metadados)

## Restrições por módulo (o que NÃO pode mudar)
- **Autenticação (todos):** manter exatamente o fluxo Supabase Auth existente. Só muda aparência.
- **Agenda:** manter o CALENDÁRIO mensal como funciona. NÃO redesenhar. Só paleta/fonte/botões/acabamento.
- **Clientes:** manter a lista DENSA (todas as colunas, muitas linhas visíveis).
- **Kanban:** 6 etapas ativas em cima; Concluído/Perdido em "Histórico" recolhido abaixo; preservar arrastar card e mover em lote.
- **Lotes:** NÃO usar mapa de quadras, planta antiga nem radar decorativo. Conceito = famílias procurando lote + (depois) lotes avulsos captados.

## Referências
- Protótipo navegável das 5 telas: `C:\Users\Duam Rodrigues\Downloads\prototipo-crm-navegavel.html`
- Referência visual do Login: `C:\Users\Duam Rodrigues\.codex\generated_images\019f8a8f-08be-79a3-ad7b-e65e9f97cd0b\exec-d0dcc4a4-75c0-4d4a-aef0-5ba41d87d39d.png`
- Logo oficial (SVG, usar original): `C:\Users\Duam Rodrigues\Downloads\EDR LOGO preto.svg`

**Nota de portabilidade:** esses caminhos são da máquina pessoal do Duam. Antes de implementar cada módulo, os assets necessários (logo, imagens de referência) devem ser COPIADOS para dentro do repo (ex.: `img/`, `docs/redesign/assets/`) para que fiquem versionados e o CRM publicado consiga encontrá-los. Não referenciar pasta pessoal em código de produção.
