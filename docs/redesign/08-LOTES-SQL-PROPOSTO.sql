-- =====================================================================
-- EDR CRM — Lotes: Famílias procurando oportunidade
-- SQL PROPOSTO PARA REVISÃO DE DUAM — **NÃO APLICADO EM PRODUÇÃO**
--
-- Data: 2026-07-29
-- Base: docs/redesign/07-LOTES-PROPOSTA-DADOS.md (conceito aprovado por Duam)
--
-- ⚠️ ONDE ESTE SQL JÁ RODOU — sem ambiguidade:
--
--   PRODUÇÃO (mepzoxoahpwcvvlymlfh) ... NUNCA EXECUTADO. Nenhuma linha deste
--       arquivo tocou o banco real, em momento nenhum. Conferido depois de
--       cada branch: 0 tabelas novas, crm_lotes=31, vínculos=7.
--
--   BRANCH `lotes-v2` (2026-07-29) ... ✅ ESTA VERSÃO foi EXECUTADA do início
--       ao fim e PASSOU, junto com os testes do 09. Branch destruída.
--       Resultados completos no fim deste arquivo.
--
--   BRANCH `teste-lotes` (anterior, descartada) ... rodou uma versão
--       pré-correção. Foi lá que apareceu o defeito da seção 5.
--
-- REGRAS RESPEITADAS:
--   · crm_lotes NÃO é tocada — nenhum ALTER, DROP ou UPDATE nela.
--   · Os 7 vínculos família↔lote existentes ficam como estão.
--   · Nenhuma migração automática dos 24 lotes A/B.
--   · Nenhum dado é inserido: as 3 tabelas nascem VAZIAS.
--
-- PADRÃO DE SEGURANÇA (copiado do que já existe, não inventado):
--   Verificado em pg_policies: crm_lotes, crm_clientes e crm_tarefas usam
--   RLS com a função crm_user_has_profile() nas 4 operações.
--   O mesmo padrão é aplicado aqui — SELECT/INSERT/UPDATE/DELETE.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. FILA — o que cada família procura
-- ---------------------------------------------------------------------
create table public.crm_procura_lote (
  id                  uuid primary key default gen_random_uuid(),
  -- RISCO 3 (Duam): apagar a família apaga o histórico de procura junto.
  -- ✅ VERIFICADO: é o padrão de TODO o CRM. As 6 tabelas filhas de
  -- crm_clientes usam CASCADE — inclusive crm_documentos e crm_historico.
  -- Manter CASCADE = coerente com LGPD (apagar a pessoa apaga os rastros dela).
  -- ✅ DECIDIDO POR DUAM (2026-07-29): MANTER CASCADE.
  -- "Segue o padrão atual do CRM e faz sentido se exclusão de família também
  --  precisa apagar seu histórico por LGPD."
  cliente_id          uuid not null references public.crm_clientes(id) on delete cascade,

  -- Cidade separada da região: "Centro" sozinho pode ser cidades diferentes.
  -- Exigência de Duam (2026-07-29). Exibido como "Petrolina — Centro".
  cidade              text not null,
  regiao              text not null,
  regiao_outra        text,          -- preenchido quando cidade/regiao = 'Outra'

  valor_maximo        numeric(12,2),
  metragem_desejada   numeric(10,2),
  preferencias        text,          -- esquina, aclive, perto de escola... (livre)

  situacao            text not null default 'procurando',

  proxima_acao        text,
  -- DATE completo: a tela exibe "02 ago" ou "em 4 dias", nunca "02/08" solto
  -- (exigência de Duam — evita ambiguidade na virada do ano).
  proxima_acao_prazo  date,

  observacao          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint crm_procura_situacao_valida check (
    situacao in ('procurando','em_analise','pausada','atendida','desistiu')
  ),
  constraint crm_procura_valor_positivo check (valor_maximo is null or valor_maximo > 0),
  constraint crm_procura_metragem_positiva check (metragem_desejada is null or metragem_desejada > 0)
);

-- DECISÃO 2 DE DUAM: uma procura ATIVA por família.
-- Índice parcial: a família pode ter várias procuras encerradas no histórico,
-- mas só UMA em andamento. Dois bairros = preferência dentro da mesma procura.
create unique index crm_procura_uma_ativa_por_familia
  on public.crm_procura_lote (cliente_id)
  where situacao in ('procurando','em_analise','pausada');

create index crm_procura_cliente   on public.crm_procura_lote (cliente_id);
create index crm_procura_situacao  on public.crm_procura_lote (situacao);
create index crm_procura_cidade    on public.crm_procura_lote (cidade, regiao);

comment on table public.crm_procura_lote is
  'Fila de famílias procurando lote. Só entra quem manifestou interesse real — '
  'nunca cadastro automático de todo cliente (decisão de Duam, 2026-07-29). '
  'Não duplica faixa/renda/status: isso vive em crm_clientes.';


-- ---------------------------------------------------------------------
-- 2. OPORTUNIDADES — lotes reais captados
--    NASCE VAZIA. Nunca migrar os 24 lotes A/B para cá.
-- ---------------------------------------------------------------------
create table public.crm_oportunidade_lote (
  id           uuid primary key default gen_random_uuid(),
  descricao    text not null,        -- "Lote na Rua X, ao lado do nº 40"
  cidade       text not null,
  regiao       text not null,
  valor        numeric(12,2),
  metragem     numeric(10,2),
  origem       text,                 -- quem ofereceu / onde foi encontrado
  situacao     text not null default 'disponivel',
  observacao   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint crm_oport_situacao_valida check (
    situacao in ('disponivel','reservada','fechada','perdida')
  ),
  constraint crm_oport_valor_positivo check (valor is null or valor > 0)
);

create index crm_oport_situacao on public.crm_oportunidade_lote (situacao);
create index crm_oport_cidade   on public.crm_oportunidade_lote (cidade, regiao);

comment on table public.crm_oportunidade_lote is
  'Lotes reais captados no mercado. Nasce vazia e só recebe registro quando '
  'uma oportunidade concreta aparecer. PROIBIDO migrar os lotes das quadras '
  'A/B de crm_lotes para cá — são sobra do loteamento antigo.';


-- ---------------------------------------------------------------------
-- 3. LIGAÇÃO — qual oportunidade foi mostrada a qual família
--    A compatibilidade é SUGERIDA pelo sistema, mas quem relaciona é a pessoa.
-- ---------------------------------------------------------------------
create table public.crm_procura_oportunidade (
  id               uuid primary key default gen_random_uuid(),
  procura_id       uuid not null references public.crm_procura_lote(id) on delete cascade,
  oportunidade_id  uuid not null references public.crm_oportunidade_lote(id) on delete cascade,
  situacao         text not null default 'sugerida',
  observacao       text,             -- por que recusou, o que faltou
  created_at       timestamptz not null default now(),
  -- CORREÇÃO 2 (Duam): a situação desta ligação MUDA (sugerida → apresentada →
  -- aceita/recusada) e era o único registro sem rastro de quando mudou.
  updated_at       timestamptz not null default now(),

  constraint crm_po_situacao_valida check (
    situacao in ('sugerida','apresentada','recusada','aceita')
  ),
  -- a mesma oportunidade não é relacionada duas vezes à mesma procura
  constraint crm_po_sem_duplicata unique (procura_id, oportunidade_id)
);

-- CORREÇÃO 1 (Duam) — BUG REAL: sem isto, a MESMA oportunidade podia ficar
-- 'aceita' por várias famílias ao mesmo tempo. Um lote só pode ser fechado
-- com uma família. Índice parcial: várias podem estar 'sugerida' ou
-- 'apresentada' (é o normal — mostra-se o lote a quem combina), mas só UMA
-- chega a 'aceita'.
create unique index crm_po_uma_aceita_por_oportunidade
  on public.crm_procura_oportunidade (oportunidade_id)
  where situacao = 'aceita';

create index crm_po_procura      on public.crm_procura_oportunidade (procura_id);
create index crm_po_oportunidade on public.crm_procura_oportunidade (oportunidade_id);

comment on table public.crm_procura_oportunidade is
  'Liga famílias da fila a oportunidades captadas. O sistema pode DESTACAR '
  'quem combina por cidade/região e valor, mas o vínculo é sempre criado por '
  'uma pessoa — nunca match automático (decisão de Duam).';


-- ---------------------------------------------------------------------
-- 4. RLS — mesmo padrão das tabelas existentes
--    Verificado em pg_policies: crm_lotes/crm_clientes/crm_tarefas usam
--    crm_user_has_profile() nas 4 operações. Replicado tal e qual.
-- ---------------------------------------------------------------------
alter table public.crm_procura_lote          enable row level security;
alter table public.crm_oportunidade_lote     enable row level security;
alter table public.crm_procura_oportunidade  enable row level security;

-- crm_procura_lote
create policy profile_select_crm_procura_lote on public.crm_procura_lote
  for select using (crm_user_has_profile());
create policy profile_insert_crm_procura_lote on public.crm_procura_lote
  for insert with check (crm_user_has_profile());
create policy profile_update_crm_procura_lote on public.crm_procura_lote
  for update using (crm_user_has_profile()) with check (crm_user_has_profile());
create policy profile_delete_crm_procura_lote on public.crm_procura_lote
  for delete using (crm_user_has_profile());

-- crm_oportunidade_lote
create policy profile_select_crm_oportunidade_lote on public.crm_oportunidade_lote
  for select using (crm_user_has_profile());
create policy profile_insert_crm_oportunidade_lote on public.crm_oportunidade_lote
  for insert with check (crm_user_has_profile());
create policy profile_update_crm_oportunidade_lote on public.crm_oportunidade_lote
  for update using (crm_user_has_profile()) with check (crm_user_has_profile());
create policy profile_delete_crm_oportunidade_lote on public.crm_oportunidade_lote
  for delete using (crm_user_has_profile());

-- crm_procura_oportunidade
create policy profile_select_crm_procura_oportunidade on public.crm_procura_oportunidade
  for select using (crm_user_has_profile());
create policy profile_insert_crm_procura_oportunidade on public.crm_procura_oportunidade
  for insert with check (crm_user_has_profile());
create policy profile_update_crm_procura_oportunidade on public.crm_procura_oportunidade
  for update using (crm_user_has_profile()) with check (crm_user_has_profile());
create policy profile_delete_crm_procura_oportunidade on public.crm_procura_oportunidade
  for delete using (crm_user_has_profile());


-- ---------------------------------------------------------------------
-- 5. updated_at automático
--
-- 🐛 DEFEITO GRAVE ENCONTRADO NO TESTE EM BRANCH (2026-07-29):
--    A versão anterior reusava set_crm_updated_at(). Parecia certo — a função
--    existe e é a padrão do CRM. MAS o corpo dela é:
--        BEGIN NEW.ultima_atualizacao = now(); RETURN NEW; END;
--    Ela escreve em `ultima_atualizacao`, coluna de crm_clientes.
--    As tabelas de Lotes usam `updated_at`. Aplicado em produção, TODO UPDATE
--    nestas 3 tabelas estouraria erro de coluna inexistente.
--    Só apareceu porque o teste foi executado de verdade.
--
--    Correção: função PRÓPRIA. set_crm_updated_at() NÃO é alterada — continua
--    servindo crm_clientes normalmente.
-- ---------------------------------------------------------------------
create or replace function public.set_lotes_updated_at()
returns trigger language plpgsql set search_path to 'public'
as $$ begin new.updated_at = now(); return new; end; $$;

create trigger trg_crm_procura_lote_updated_at
  before update on public.crm_procura_lote
  for each row execute function public.set_lotes_updated_at();

create trigger trg_crm_oportunidade_lote_updated_at
  before update on public.crm_oportunidade_lote
  for each row execute function public.set_lotes_updated_at();

create trigger trg_crm_procura_oportunidade_updated_at
  before update on public.crm_procura_oportunidade
  for each row execute function public.set_lotes_updated_at();


-- ---------------------------------------------------------------------
-- 6. PERMISSÕES (GRANT) — CORREÇÃO 4 (Duam)
-- ---------------------------------------------------------------------
-- ✅ VERIFICADO em information_schema.role_table_grants e pg_default_acl:
--
--   Não é preciso escrever GRANT nenhum. O schema `public` tem PRIVILÉGIO
--   PADRÃO configurado (pg_default_acl, defaclobjtype='r'): toda tabela nova
--   já nasce com DELETE/INSERT/REFERENCES/SELECT/TRIGGER/TRUNCATE/UPDATE para
--   anon, authenticated e service_role. É assim que crm_lotes e crm_clientes
--   têm suas permissões — ninguém as escreveu.
--
-- ⚠️ COMO A PROTEÇÃO REALMENTE FUNCIONA (correção de Duam, 2026-07-29):
--
--   Minha nota anterior dizia que "se uma política falhar, anon passa direto".
--   ISSO ESTAVA TECNICAMENTE ERRADO e foi corrigido.
--
--   Com RLS ativo, o padrão do Postgres é NEGAR. Sem política que autorize,
--   ninguém lê nada — nem `anon`, nem `authenticated`. O GRANT do schema dá
--   apenas a permissão de *tabela*; quem decide linha a linha é o RLS.
--   Ou seja: remover uma política FECHA o acesso, não abre.
--
--   O ponto de atenção correto é outro: as políticas aqui usam
--   crm_user_has_profile() para as 4 operações, sem distinguir role. A
--   segurança depende inteiramente de essa função retornar FALSE para quem
--   não está logado. É exatamente isso que precisa ser TESTADO — não assumido.
--
--   Se Duam quiser uma camada extra (defesa em profundidade), o caminho é
--   revogar de anon no nível de tabela:
--
--     -- revoke all on public.crm_procura_lote         from anon;
--     -- revoke all on public.crm_oportunidade_lote    from anon;
--     -- revoke all on public.crm_procura_oportunidade from anon;
--
--   NÃO incluído por padrão: as tabelas atuais não fazem isso, e divergir do
--   padrão sem decisão explícita pode quebrar algo que dependa de anon.
--   DECISÃO DE DUAM PENDENTE.


-- =====================================================================
-- O QUE ESTE SCRIPT **NÃO** FAZ (proposital)
-- =====================================================================
-- · Não altera, apaga ou renomeia crm_lotes.
-- · Não mexe nos 7 vínculos família↔lote existentes.
-- · Não migra os 24 lotes A/B para lugar nenhum.
-- · Não insere UM registro sequer — as 3 tabelas nascem vazias.
-- · Não mexe em crm_clientes.
-- · Não cria o card do Dashboard (só depois de existir dado real).
--
-- ROLLBACK (caso aplicado e seja preciso desfazer):
--   drop table if exists public.crm_procura_oportunidade;
--   drop table if exists public.crm_oportunidade_lote;
--   drop table if exists public.crm_procura_lote;
--   (nesta ordem, por causa das chaves estrangeiras)
--   Como nada fora dessas 3 tabelas é tocado, o rollback é limpo.
--
-- =====================================================================
-- REVISÃO DE DUAM (2026-07-29) — 4 achados, todos tratados
-- =====================================================================
-- ✅ 1. BUG: mesma oportunidade podia ficar 'aceita' por várias famílias.
--       Corrigido com índice único parcial (crm_po_uma_aceita_por_oportunidade).
-- ✅ 2. MELHORIA: ligação sem updated_at. Coluna + trigger adicionados.
-- ✅ 3. RISCO (cascade): DECIDIDO POR DUAM — manter CASCADE. Segue o padrão
--       do CRM (6/6 tabelas filhas) e é coerente com LGPD.
-- ✅ 4. RISCO (grants): verificado — não é preciso GRANT. O schema tem
--       privilégio padrão (pg_default_acl).
--       ⚠️ Minha nota original sobre `anon` estava TECNICAMENTE ERRADA e foi
--       corrigida por Duam: com RLS ativo o padrão é NEGAR; remover política
--       fecha, não abre. Texto reescrito na seção 6.
--
-- =====================================================================
-- PLANO DE TESTE EM AMBIENTE DESCARTÁVEL (exigido por Duam antes de produção)
-- =====================================================================
-- Rodar este SQL numa BRANCH de banco do Supabase (ambiente separado,
-- destruído depois) e provar 4 casos — não assumir nenhum:
--
--   1. Anônimo BLOQUEADO      → select como `anon` deve retornar 0 linhas
--                                (confirma que crm_user_has_profile() fecha
--                                 para quem não está logado)
--   2. Usuário logado LIBERADO → select como `authenticated` com perfil deve ler
--   3. Segunda procura ativa BLOQUEADA → 2º insert para o mesmo cliente_id com
--                                situação ativa deve VIOLAR o índice único parcial
--   4. Segunda aceitação BLOQUEADA → 2ª ligação 'aceita' na mesma oportunidade
--                                deve VIOLAR crm_po_uma_aceita_por_oportunidade
--
-- ✅ Os 4 casos foram provados em `lotes-v2` (2026-07-29) — ver fim do arquivo.
--
-- PENDÊNCIA ANTES DE APLICAR EM PRODUÇÃO:
--   1. Quais cidades/regiões entram na lista inicial? (a validação da lista
--      fica na aplicação, não no banco — permite ajustar sem migration)
--      ⇒ É a ÚNICA pendência que resta. Decisão de negócio de Duam.
--   ✅ RESOLVIDAS: CASCADE mantido (Duam) · GRANT desnecessário — agora
--      PROVADO por has_table_privilege, não só inferido do pg_default_acl ·
--      updated_at com função PRÓPRIA (o reuso de set_crm_updated_at
--      quebraria — ver seção 5) · execução completa em branch.
--
-- =====================================================================
-- ✅ PROVADO — execução completa na branch `lotes-v2`, 2026-07-29
-- =====================================================================
-- Branch `lotes-v2` (lrhpnbvghrfxbjlgvbdt), criada, usada e DESTRUÍDA.
-- PRODUÇÃO NÃO FOI TOCADA (conferido depois: 0 tabelas novas, crm_lotes=31,
-- vínculos=7, 46 migrations).
--
-- COMO A BRANCH FOI PREPARADA (importante — corrige o que eu dizia antes):
--   A criação da branch aplica as 46 migrations do projeto e FALHA na 1ª,
--   `performance_indexes_edr_system`, com:
--       ERROR: relation "adicional_pagamentos" does not exist
--   (ela indexa tabelas do EDR que nunca foram criadas por migration).
--   Isso deixa a branch em MIGRATIONS_FAILED com 0 tabelas — mas com o banco
--   ACTIVE_HEALTHY. As 15 migrations de CRM foram então aplicadas À MÃO, na
--   ordem original, e passaram 15/15. Elas são autossuficientes.
--   ⚠️ Eu havia escrito que "o CRM não usa migrations versionadas" e que
--      "a branch nasce sem schema". As DUAS afirmações estavam ERRADAS:
--      há 15 migrations de CRM versionadas, e a branch falha por causa de
--      uma migration do EDR — não por ausência de migrations.
--
--   Estrutura ....... 3 tabelas · dono `postgres` · RLS ativa · 4 policies e
--                     1 trigger por tabela
--   GRANT ........... PROVADO por has_table_privilege (não mais inferido):
--                     anon E authenticated com SELECT/INSERT/UPDATE/DELETE
--                     nas 3 tabelas, SEM nenhum GRANT escrito. O default ACL
--                     do schema aplicou, como a seção 6 previa.
--                     É o RLS que barra o anon — o T1 prova isso.
--   T1 anônimo ...... PASSOU — dono lê 1, `anon` lê 0 no MESMO dado
--   T2 logado ....... PASSOU com CONTRAPROVA — com perfil: função=true, leu 1;
--                     sem perfil: função=false, leu 0. O bypass service_role
--                     do setup funcionou na prática.
--   T3 procura ...... PASSOU — 2ª ativa bloqueada; encerrada convive
--   T4 aceitação .... PASSOU — 2ª aceitação da mesma oportunidade bloqueada
--   Triggers ........ PASSOU nas 3 tabelas (EXTRA 1/3, 2/3, 3/3), por
--                     sabotagem: gravar '2000-01-01' e ver o trigger
--                     sobrescrever com a data atual.
--   Resíduo ......... 0 em todas as tabelas (tudo em ROLLBACK)
--
-- NÃO PROVADO (honestidade de escopo):
--   · A tela lotes.html contra estas tabelas com dado real.
--   · Os formulários de cadastro de procura/oportunidade — não existem ainda.
--   · Qualquer coisa em celular.
--   · Este SQL foi aplicado como UM bloco via apply_migration, não statement
--     a statement.
-- =====================================================================
