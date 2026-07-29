# Módulo 6 — Lotes · Leitura do banco (ANTES de qualquer desenho)

**Data:** 2026-07-29
**Escopo autorizado por Duam:** leitura limitada — estrutura, contagens e distribuição.
**Sem nomes, CPF, telefone, documentos ou endereços.** Nada foi alterado.

## Por que esta leitura veio primeiro
A tela Lotes mostra planta, quadras e contagem de disponíveis de um terreno que não
existe mais — **não é visual antigo, é informação de negócio errada**. Antes de desenhar
estrutura nova, era preciso separar o que é vínculo legítimo do que é sobra do loteamento.

## Estrutura de `crm_lotes` (7 colunas)
`id` (uuid) · `numero` (int, obrigatório) · `metragem` (numeric) · `quadra` (text) ·
`status` (text, default `'disponivel'`) · `observacao` (text) · `created_at` (timestamptz)

## 📊 RETRATO SEGURO — 31 registros

| Grupo | Total | Com família | Livres | Metragem | Criados |
|---|---|---|---|---|---|
| Quadra **A** | 17 | 2 | **15** | todas | 13/05/2026 |
| Quadra **B** | 11 | 2 | **9** | todas | 13/05/2026 |
| **Avulso** | 3 | 3 | 0 | nenhuma | 14/05/2026 |

**Status:** 29 `disponivel` · 2 `bloqueado` (os 2 bloqueados não têm família).
**Total de famílias com lote vinculado:** 7.

## Classificação — com a linguagem correta (correção de Duam)

### 1. 24 lotes A/B SEM família vinculada
**Forte candidato a sobra do loteamento antigo.** É o que alimenta a planta, as quadras
como estoque e a contagem de "disponíveis" na tela.
> Indícios: numeração sequencial (A: 1–17, B: 1–11), todas com metragem, criados no
> mesmo dia. **Indício de padrão, não prova documental** — o banco não nomeia o terreno.

### 2. 7 vínculos com famílias — NÃO apagar, NÃO alterar, NÃO esconder
Até que cada caso seja entendido. Subdividem-se em:

**a) 3 "Avulso" vinculados — ⚠️ A VALIDAR**
> **Correção expressa de Duam (2026-07-29):** o banco prova que existem 3 avulsos
> vinculados; **NÃO prova que são imóveis reais**. Isso é confirmação de negócio,
> pendente com Duam.
> **Termo correto: "avulsos vinculados a validar" — nunca "lotes reais".**
> Indícios: numeração alta e sem padrão (67, 288), sem metragem, criados 1 dia depois.

**b) 4 vínculos em Quadra A/B — DECISÃO CRÍTICA, só Duam pode confirmar**
Duas leituras possíveis:
- reserva antiga do loteamento, que perdeu validade junto com o terreno; **ou**
- registro reaproveitado para um lote real (o "Quadra A nº 5" hoje significa outra coisa).

Enquanto não houver confirmação, **preservar integralmente**.

## 🔒 REGRA DE TRABALHO (definida por Duam)
1. **Nada é apagado agora.**
2. Publicar as 4 telas aprovadas (Agenda, Clientes, Ficha, Kanban) — não dependem de Lotes.
3. Lotes entra como **próximo módulo, imediatamente** — a reforma NÃO está encerrada.
4. **Não esconder a tela do menu:** o vínculo de lote ainda é usado em Clientes, Ficha e
   cadastro de família; esconder tiraria acesso da equipe.
5. Substituir **apenas a parte falsa**: planta, quadras como estoque, "disponíveis" e
   contagem inventada. **Não apagar tabela, não esconder função, não inventar
   disponibilidade nova.**

## Onde `crm_lotes` é usada (13 referências em 5 telas)
| Tela | Uso |
|---|---|
| `clientes.html` | mostra "Lote N" na lista |
| `kanban.html` | mostra "Lote N" no card |
| `ficha.html` | mostra lote vinculado **e permite trocar** |
| `familia.html` | seletor de lote no cadastro |
| `lotes.html` | a tela em si (leitura **e escrita**) |

> Consequência: apagar ou renomear a tabela quebraria 5 telas. A estrutura nova de
> "famílias procurando oportunidade" **convive** com `crm_lotes`, não a substitui.

## Sequência acordada para Lotes (Duam)
1. Registrar família interessada: região, valor máximo, metragem desejada, preferências,
   próxima ação.
2. Mostrar a fila de famílias aguardando oportunidade.
3. Ao surgir um lote real, cadastrar a oportunidade e relacionar com famílias compatíveis.
4. **Só então** o Dashboard ganha o card real "Famílias procurando lote" — com número real.

## Pendências com Duam (bloqueiam o desenho)
- [ ] Os **4 vínculos em Quadra A/B** são reserva antiga ou lote real reaproveitado?
- [ ] Os **3 "Avulso" vinculados** correspondem a imóveis reais? (validação de negócio)
- [ ] Autorização para criar tabela nova no Supabase (fronteira — não cruzada).

## O que NÃO foi feito nesta leitura
- Nenhum dado pessoal consultado.
- Nenhuma alteração no banco.
- A tela `lotes.html` **não foi aberta** — a descrição de "planta, quadras e
  disponibilidade" vem do relato de Duam, não de inspeção visual.
