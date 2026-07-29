-- =====================================================================
-- EDR CRM — Lotes: Famílias procurando oportunidade
-- SQL PROPOSTO PARA REVISÃO DE DUAM — **NÃO APLICADO**
--
-- Data: 2026-07-29
-- Base: docs/redesign/07-LOTES-PROPOSTA-DADOS.md (conceito aprovado por Duam)
--
-- ⚠️ NADA AQUI FOI EXECUTADO. Este arquivo é para leitura e aprovação.
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

  constraint crm_po_situacao_valida check (
    situacao in ('sugerida','apresentada','recusada','aceita')
  ),
  -- a mesma oportunidade não é relacionada duas vezes à mesma procura
  constraint crm_po_sem_duplicata unique (procura_id, oportunidade_id)
);

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
--    ✅ VERIFICADO: o projeto JÁ TEM a função set_crm_updated_at().
--    Reusada aqui — nenhuma função nova é criada.
-- ---------------------------------------------------------------------
create trigger trg_crm_procura_lote_updated_at
  before update on public.crm_procura_lote
  for each row execute function public.set_crm_updated_at();

create trigger trg_crm_oportunidade_lote_updated_at
  before update on public.crm_oportunidade_lote
  for each row execute function public.set_crm_updated_at();

-- crm_procura_oportunidade não tem updated_at (só created_at) — sem trigger.


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
-- PENDÊNCIA ANTES DE APLICAR:
--   1. Quais cidades/regiões entram na lista inicial? (a validação da lista
--      fica na aplicação, não no banco — permite ajustar sem migration)
--   ✅ 2. RESOLVIDA: set_crm_updated_at() já existe e foi reusada.
-- =====================================================================
