-- =====================================================================
-- EDR CRM — Lotes: SCRIPT DE TESTE (para ambiente descartável)
--
-- Data: 2026-07-29
-- Status: PRONTO PARA RODAR. **NÃO EXECUTADO** — aguarda autorização de
--         Duam para criar a branch de banco.
--
-- Como usar:
--   1. Criar branch de banco no Supabase (ambiente separado, descartável)
--   2. Rodar 08-LOTES-SQL-PROPOSTO.sql
--   3. Rodar ESTE arquivo
--   4. Conferir os 4 resultados
--   5. Destruir a branch
--
-- Nenhum destes comandos toca o banco de produção.
-- =====================================================================


-- ---------------------------------------------------------------------
-- TESTE 1 — ANÔNIMO BLOQUEADO
-- ---------------------------------------------------------------------
-- ✅ JÁ PROVADO EM PRODUÇÃO, SEM PRECISAR DE BRANCH (2026-07-29):
--
--   select auth.uid(), crm_user_has_profile(),
--          (select count(*) from crm_profiles where id = auth.uid());
--   → uid_atual = null | funcao_retorna = FALSE | perfis_encontrados = 0
--
--   A função é:
--     SELECT EXISTS (SELECT 1 FROM crm_profiles WHERE id = auth.uid())
--   Sem sessão, auth.uid() é null, nenhuma linha casa, retorna FALSE.
--   Como as 12 policies usam essa função em USING/WITH CHECK, o RLS nega.
--
-- Confirmação na branch (com a tabela já criada):
set local role anon;
select count(*) as t1_anon_deve_ser_zero from public.crm_procura_lote;
reset role;
-- ESPERADO: 0 linhas. Qualquer número > 0 REPROVA.


-- ---------------------------------------------------------------------
-- TESTE 2 — USUÁRIO LOGADO LIBERADO
-- ---------------------------------------------------------------------
-- Simula um usuário autenticado que TEM perfil em crm_profiles.
-- Substituir <UUID_DE_UM_PERFIL> por um id real de crm_profiles da branch.
--
-- set local role authenticated;
-- set local request.jwt.claims = '{"sub":"<UUID_DE_UM_PERFIL>","role":"authenticated"}';
-- select count(*) as t2_logado_deve_ler from public.crm_procura_lote;
-- reset role;
-- ESPERADO: lê sem erro (0 linhas se a tabela estiver vazia, mas SEM erro de
--           permissão). Erro de acesso REPROVA.


-- ---------------------------------------------------------------------
-- TESTE 3 — SEGUNDA PROCURA ATIVA BLOQUEADA
-- ---------------------------------------------------------------------
-- Prova o índice crm_procura_uma_ativa_por_familia (decisão 2 de Duam:
-- uma procura ativa por família).
do $$
declare
  v_cliente uuid;
  v_erro    text;
begin
  select id into v_cliente from public.crm_clientes limit 1;

  -- 1ª procura: deve passar
  insert into public.crm_procura_lote (cliente_id, cidade, regiao, situacao)
  values (v_cliente, 'Petrolina', 'Centro', 'procurando');
  raise notice 'T3.1 OK — primeira procura inserida';

  -- 2ª procura ATIVA para o MESMO cliente: deve FALHAR
  begin
    insert into public.crm_procura_lote (cliente_id, cidade, regiao, situacao)
    values (v_cliente, 'Juazeiro', 'Zona Norte', 'em_analise');
    raise exception 'T3.2 REPROVOU — a segunda procura ativa foi aceita!';
  exception when unique_violation then
    raise notice 'T3.2 PASSOU — segunda procura ativa bloqueada pelo índice';
  end;

  -- 3ª procura com situação ENCERRADA: deve PASSAR (histórico preservado)
  insert into public.crm_procura_lote (cliente_id, cidade, regiao, situacao)
  values (v_cliente, 'Petrolina', 'Zona Sul', 'desistiu');
  raise notice 'T3.3 OK — procura encerrada convive com a ativa (histórico)';
end $$;


-- ---------------------------------------------------------------------
-- TESTE 4 — SEGUNDA ACEITAÇÃO DA MESMA OPORTUNIDADE BLOQUEADA
-- ---------------------------------------------------------------------
-- Prova o índice crm_po_uma_aceita_por_oportunidade — o BUG que Duam achou:
-- sem ele, um mesmo lote seria "aceito" por duas famílias.
do $$
declare
  v_c1 uuid; v_c2 uuid; v_p1 uuid; v_p2 uuid; v_op uuid;
begin
  select id into v_c1 from public.crm_clientes offset 0 limit 1;
  select id into v_c2 from public.crm_clientes offset 1 limit 1;

  -- duas famílias diferentes procurando
  insert into public.crm_procura_lote (cliente_id, cidade, regiao, situacao)
  values (v_c1, 'Petrolina', 'Centro', 'procurando') returning id into v_p1;
  insert into public.crm_procura_lote (cliente_id, cidade, regiao, situacao)
  values (v_c2, 'Petrolina', 'Centro', 'procurando') returning id into v_p2;

  -- uma oportunidade
  insert into public.crm_oportunidade_lote (descricao, cidade, regiao)
  values ('Lote teste na Rua X', 'Petrolina', 'Centro') returning id into v_op;

  -- as duas podem VER a oportunidade (situação 'sugerida') — é o normal
  insert into public.crm_procura_oportunidade (procura_id, oportunidade_id, situacao)
  values (v_p1, v_op, 'sugerida');
  insert into public.crm_procura_oportunidade (procura_id, oportunidade_id, situacao)
  values (v_p2, v_op, 'sugerida');
  raise notice 'T4.1 OK — duas famílias podem avaliar a mesma oportunidade';

  -- 1ª aceitação: passa
  update public.crm_procura_oportunidade set situacao='aceita'
  where procura_id=v_p1 and oportunidade_id=v_op;
  raise notice 'T4.2 OK — primeira aceitação registrada';

  -- 2ª aceitação da MESMA oportunidade: deve FALHAR
  begin
    update public.crm_procura_oportunidade set situacao='aceita'
    where procura_id=v_p2 and oportunidade_id=v_op;
    raise exception 'T4.3 REPROVOU — a mesma oportunidade foi aceita 2x!';
  exception when unique_violation then
    raise notice 'T4.3 PASSOU — segunda aceitação bloqueada (bug de Duam resolvido)';
  end;
end $$;


-- ---------------------------------------------------------------------
-- EXTRA — updated_at realmente dispara?
-- ---------------------------------------------------------------------
do $$
declare v_id uuid; v_antes timestamptz; v_depois timestamptz;
begin
  select id, updated_at into v_id, v_antes
  from public.crm_procura_oportunidade limit 1;

  perform pg_sleep(0.2);
  update public.crm_procura_oportunidade set observacao='toque' where id=v_id;

  select updated_at into v_depois from public.crm_procura_oportunidade where id=v_id;

  if v_depois > v_antes then
    raise notice 'EXTRA OK — trigger de updated_at disparou';
  else
    raise exception 'EXTRA REPROVOU — updated_at não mudou';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- LIMPEZA (a branch é descartada de qualquer forma, mas fica registrado)
-- ---------------------------------------------------------------------
-- delete from public.crm_procura_oportunidade;
-- delete from public.crm_oportunidade_lote;
-- delete from public.crm_procura_lote;


-- =====================================================================
-- RESUMO ESPERADO
--   T1  anônimo lê 0 linhas ......................... [ ] a rodar na branch
--       (função já provada FALSE em produção)  ...... [x] PROVADO 2026-07-29
--   T2  usuário logado lê sem erro .................. [ ] a rodar na branch
--   T3  segunda procura ativa bloqueada ............. [ ] a rodar na branch
--   T4  segunda aceitação bloqueada ................. [ ] a rodar na branch
--   EX  updated_at dispara .......................... [ ] a rodar na branch
-- =====================================================================
