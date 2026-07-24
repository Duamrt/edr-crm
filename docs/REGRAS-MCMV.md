# Regras MCMV — faixas de renda e vigência

> Fonte única de verdade sobre limites de renda do programa.
> Código correspondente: `MCMV_LIMITES` em `js/utils.js`.

## Faixas vigentes

**Vigência:** Portaria MCID 333/2026
**Última atualização deste documento:** 2026-07-24

| Faixa | Renda familiar bruta mensal | Observação |
|---|---|---|
| **Faixa 1** | até R$ 3.200,00 | maior subsídio |
| **Faixa 2** | R$ 3.200,01 a R$ 5.000,00 | |
| **Faixa 3** | R$ 5.000,01 a R$ 9.600,00 | |
| **Faixa 4** | R$ 9.600,01 a R$ 13.000,00 | MCMV Classe Média |
| *(acima)* | acima de R$ 13.000,00 | **fora do MCMV** → SBPE / financiamento tradicional |

Valores para o **urbano**. Rural tem tabela própria — não modelada no CRM hoje.

## Fontes oficiais

- [Ministério das Cidades — Perguntas frequentes](https://www.gov.br/cidades/pt-br/composicao/ouvidoria/perguntas-frequentes)
- [MCMV Classe Média (Faixa 4)](https://www.gov.br/cidades/pt-br/acesso-a-informacao/acoes-e-programas/habitacao/programa-minha-casa-minha-vida/minha-casa-minha-vida-classe-media/minha-casa-minha-vida-classe-media-1)

## Onde os limites vivem no código

```js
// js/utils.js
const MCMV_LIMITES = { faixa1_max: 3200, faixa2_max: 5000, faixa3_max: 9600, faixa4_max: 13000 }
const MCMV_VIGENCIA = 'Portaria MCID 333/2026'
```

`calcFaixaMcmv(renda)` retorna `1..4`, ou `null` para renda zero **ou** acima do teto.
Para distinguir os dois casos de `null`, usar `rotaFinanciamento(renda)`.

## Como atualizar quando sair portaria nova

Os limites mudam por decreto federal. **Revisar pelo menos uma vez por ano**, ou sempre
que sair notícia de reajuste do programa.

Checklist:

1. Confirmar valores na fonte oficial (links acima) — **nunca** por notícia de portal
2. Atualizar `MCMV_LIMITES` e `MCMV_VIGENCIA` em `js/utils.js`
3. Atualizar os `<option>` do select em `familia.html` (rótulos mostram os tetos)
4. Atualizar a tabela deste documento + a data de vigência
5. Ajustar os valores esperados em `tests/triagem-renda.test.js` (bloco "fronteiras exatas")
6. Rodar `node tests/triagem-renda.test.js` — deve dar **54/54 verde**
   (se a contagem mudar por testes novos, atualizar este número junto)
7. Se houver faixa nova, adicionar `.pill-faixa-N` em `css/style.css`

### ⚠️ Dados históricos não são recalculados

`crm_clientes.faixa_mcmv` guarda a faixa **no momento do cadastro**. Ao mudar os limites,
clientes antigos **mantêm a faixa antiga** até alguém reeditar a ficha.

O triador sinaliza a divergência (`"Cadastrada como Faixa X, mas renda indica Faixa Y"`),
mas não corrige sozinho. Recálculo em massa é operação de banco separada, com autorização
explícita do Duam.

## Banco de dados

`crm_clientes.faixa_mcmv` — `integer`, nullable, **sem CHECK constraint**
(verificado em catálogo 2026-07-24). Faixas novas gravam sem migration.

## Histórico de limites

| Data | Faixas | Fonte |
|---|---|---|
| até 2026-07-24 | 1: 2.640 · 2: 4.400 · 3: 8.000 *(sem Faixa 4)* | tabela 2024-2025, desatualizada |
| **2026-07-24** | 1: 3.200 · 2: 5.000 · 3: 9.600 · 4: 13.000 | Portaria MCID 333/2026 |
