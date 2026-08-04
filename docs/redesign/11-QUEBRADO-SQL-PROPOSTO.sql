-- ============================================================================
-- EDR CRM — Atalhos do card "O que tá quebrado" — SQL PROPOSTO (ETAPA 2)
-- RASCUNHO PARA REVISÃO. NÃO APLICADO. Aplicação só com autorização nomeada.
-- Decisão Duam 2026-08-04: Opção A — banco como fonte única de contador E detalhe.
-- Ver docs/redesign/11-QUEBRADO-ATALHOS.md (etapas, contrato, validação).
--
-- ETAPA 2 (este arquivo): TRANSAÇÃO ATÔMICA que cria SOMENTE objetos novos.
-- Preflight falha ANTES de qualquer DDL se os objetos já existirem; qualquer
-- erro aborta tudo (BEGIN…COMMIT). Nunca substitui objeto existente.
-- ETAPA 3 (rascunho ao final): get_crm_dashboard_summary passa a contar DA VIEW.
-- ============================================================================

BEGIN;

-- ── PREFLIGHT: aborta se os objetos já existirem (etapa cria, nunca substitui) ─
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'crm_vw_pendencias'
  ) THEN
    RAISE EXCEPTION 'PREFLIGHT: public.crm_vw_pendencias ja existe — abortando sem executar DDL';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_crm_pendencias'
  ) THEN
    RAISE EXCEPTION 'PREFLIGHT: public.get_crm_pendencias ja existe — abortando sem executar DDL';
  END IF;
END
$$;

-- ── VIEW ÚNICA DE PENDÊNCIAS ────────────────────────────────────────────────
-- Critérios EXTRAÍDOS de get_crm_dashboard_summary (lida em 2026-08-04) e
-- replicados aqui UMA vez. Após a Etapa 3, esta view vira a definição única.
-- Nota de paridade: docs/impedimentos exigem cliente ativo E etapa não terminal;
-- tarefas exigem SÓ cliente não deletado (sem filtro de etapa) — igual à summary.
-- "Hoje" = CURRENT_DATE no timezone configurado no banco — mesmo comportamento
-- da summary atual. Mudança de timezone (ex.: America/Sao_Paulo) é outro escopo.

CREATE VIEW public.crm_vw_pendencias AS
WITH clientes_ativos AS (
  SELECT id, nome, status_kanban
  FROM public.crm_clientes
  WHERE deleted_at IS NULL
    AND status_kanban NOT IN ('concluido','perdido')
),
clientes_nao_deletados AS (
  SELECT id, nome, status_kanban
  FROM public.crm_clientes
  WHERE deleted_at IS NULL
)
SELECT 'docs_recusados'::text AS recorte,
       c.id AS cliente_id, c.nome AS cliente_nome, c.status_kanban,
       d.tipo AS item_tipo, d.descricao AS item_descricao,
       NULL::date AS data_ref
FROM public.crm_documentos d
JOIN clientes_ativos c ON c.id = d.cliente_id
WHERE d.status = 'recusado'

UNION ALL
SELECT 'docs_vencidos', c.id, c.nome, c.status_kanban,
       d.tipo, d.descricao, d.data_vencimento
FROM public.crm_documentos d
JOIN clientes_ativos c ON c.id = d.cliente_id
WHERE d.status IN ('entregue','pendente')
  AND d.data_vencimento IS NOT NULL
  AND d.data_vencimento < CURRENT_DATE

UNION ALL
SELECT 'impedimentos', c.id, c.nome, c.status_kanban,
       i.tipo, i.descricao, NULL::date
FROM public.crm_impedimentos i
JOIN clientes_ativos c ON c.id = i.cliente_id
WHERE i.ativo = true

UNION ALL
SELECT 'tarefas_vencidas', c.id, c.nome, c.status_kanban,
       'tarefa', t.descricao, t.prazo
FROM public.crm_tarefas t
JOIN clientes_nao_deletados c ON c.id = t.cliente_id
WHERE t.concluida = false AND t.prazo < CURRENT_DATE

UNION ALL
SELECT 'tarefas_hoje', c.id, c.nome, c.status_kanban,
       'tarefa', t.descricao, t.prazo
FROM public.crm_tarefas t
JOIN clientes_nao_deletados c ON c.id = t.cliente_id
WHERE t.concluida = false AND t.prazo = CURRENT_DATE

UNION ALL
SELECT 'tarefas_amanha', c.id, c.nome, c.status_kanban,
       'tarefa', t.descricao, t.prazo
FROM public.crm_tarefas t
JOIN clientes_nao_deletados c ON c.id = t.cliente_id
WHERE t.concluida = false AND t.prazo = CURRENT_DATE + 1;

-- ── SEGURANÇA: a view NÃO é exposta a nenhum role de API ───────────────────
-- Só a RPC SECURITY DEFINER (que checa auth.uid() + crm_profiles) a lê.
REVOKE ALL ON public.crm_vw_pendencias FROM PUBLIC;
REVOKE ALL ON public.crm_vw_pendencias FROM anon;
REVOKE ALL ON public.crm_vw_pendencias FROM authenticated;

-- ── RPC DE DETALHE ──────────────────────────────────────────────────────────
-- SECURITY DEFINER endurecida: search_path SÓ pg_catalog (nada de public no
-- path); toda relação do CRM qualificada com public.; exige usuário autenticado
-- COM profile no CRM (mesmo padrão de autorização da summary existente).
-- CREATE FUNCTION (sem OR REPLACE): a etapa cria, nunca substitui.
CREATE FUNCTION public.get_crm_pendencias(p_recorte text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sem permissao';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crm_profiles WHERE id = v_user_id) THEN
    RAISE EXCEPTION 'Usuario sem profile no CRM';
  END IF;
  IF p_recorte NOT IN ('docs_recusados','docs_vencidos','impedimentos',
                       'tarefas_vencidas','tarefas_hoje','tarefas_amanha') THEN
    RAISE EXCEPTION 'Recorte invalido: %', p_recorte;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'recorte', v.recorte,
      'cliente_id', v.cliente_id,
      'cliente_nome', v.cliente_nome,
      'status_kanban', v.status_kanban,
      'item_tipo', v.item_tipo,
      'item_descricao', v.item_descricao,
      'data_ref', v.data_ref
    ) ORDER BY v.cliente_nome ASC, v.item_tipo ASC)
    FROM public.crm_vw_pendencias v
    WHERE v.recorte = p_recorte
  ), '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_crm_pendencias(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_crm_pendencias(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_crm_pendencias(text) TO authenticated;

COMMIT;

-- ── VALIDAÇÃO DA ETAPA 2 (rodar após o COMMIT, com banco autorizado) ────────
-- Paridade (leitura):
--   SELECT recorte, COUNT(*) AS via_view, COUNT(DISTINCT cliente_id) AS clientes
--   FROM public.crm_vw_pendencias GROUP BY recorte ORDER BY recorte;
--   × subqueries atuais da summary — devem bater recorte a recorte.
-- Segurança (4 testes reais, exigem banco autorizado — NÃO executados no preparo):
--   1) anon NÃO lê a view          → SET ROLE anon; SELECT ... FROM crm_vw_pendencias → permission denied
--   2) anon NÃO executa a RPC      → chamada REST /rpc/get_crm_pendencias com apikey anon → erro de permissão
--   3) authenticated SEM profile   → JWT válido sem linha em crm_profiles → 'Usuario sem profile no CRM'
--   4) authenticated COM profile   → JWT do Duam/Elyda → 200 com o recorte esperado

-- ── ROLLBACK DA ETAPA 2 ─────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.get_crm_pendencias(text);
-- DROP VIEW IF EXISTS public.crm_vw_pendencias;

-- ============================================================================
-- ETAPA 3 — APLICADA EM 2026-08-04 (janela nomeada do Duam), com guarda por hash:
-- a definição pré-mudança tinha md5 b2e235fabe5f0bda2dfe3941b731dc35 (7708 chars)
-- e a substituição abortaria se o hash tivesse mudado desde a captura.
-- Rollback da Etapa 3 = reaplicar a definição capturada (guardada na sessão de
-- 2026-08-04; recuperável também via histórico do Supabase se necessário).
-- Rascunho original mantido abaixo para referência:
-- Em get_crm_dashboard_summary, substituir os CTEs `quebrado` e `tarefas_resumo`
-- por contagens da view (fonte única):
--
--   quebrado AS (
--     SELECT
--       COUNT(*) FILTER (WHERE recorte = 'docs_recusados')::int   AS docs_recusados,
--       COUNT(*) FILTER (WHERE recorte = 'docs_vencidos')::int    AS docs_vencidos,
--       COUNT(*) FILTER (WHERE recorte = 'impedimentos')::int     AS impedimentos_ativos
--     FROM public.crm_vw_pendencias
--   ),
--   tarefas_resumo AS (
--     SELECT
--       COUNT(*) FILTER (WHERE recorte = 'tarefas_vencidas')::int AS vencidas,
--       COUNT(*) FILTER (WHERE recorte = 'tarefas_hoje')::int     AS hoje,
--       COUNT(*) FILTER (WHERE recorte = 'tarefas_amanha')::int   AS amanha
--     FROM public.crm_vw_pendencias
--   )
--
-- ROLLBACK da Etapa 3: reaplicar a definição atual da summary — capturada em
-- 2026-08-04 via pg_get_functiondef ANTES de qualquer mudança (guardar cópia
-- integral no PR/na sessão antes de aplicar).
-- ============================================================================
