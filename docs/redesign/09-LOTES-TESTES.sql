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
-- ⚠️ CORREÇÃO (Duam): a versão anterior deste teste era FALSO-VERDE.
--    A tabela começa vazia, então `count = 0` passaria mesmo com RLS ABERTA.
--    Agora: insere um registro ANTES e prova que `anon` NÃO o enxerga.
--    Transação explícita — `set local role` só é determinístico dentro dela.
begin;
  do $$
  declare v_cli uuid;
  begin
    select id into v_cli from public.crm_clientes limit 1;
    insert into public.crm_procura_lote (cliente_id, cidade, regiao, situacao)
    values (v_cli, 'Petrolina', 'Centro', 'procurando');
  end $$;

  -- como postgres (dono): o registro EXISTE
  select count(*) as t1a_dono_deve_ver_1 from public.crm_procura_lote;

  -- como anon: NÃO pode enxergar o mesmo registro
  set local role anon;
  select count(*) as t1b_anon_deve_ser_zero from public.crm_procura_lote;
  reset role;
rollback;
-- ESPERADO: t1a = 1 (o dado existe) E t1b = 0 (anon não vê).
--   t1a = 0  → o insert falhou, teste inválido
--   t1b > 0  → RLS ABERTA, REPROVA


-- ---------------------------------------------------------------------
-- TESTE 2 — USUÁRIO LOGADO LIBERADO
-- ---------------------------------------------------------------------
-- Simula um usuário autenticado que TEM perfil em crm_profiles.
-- Substituir <UUID_DE_UM_PERFIL> por um id real de crm_profiles da branch.
--
-- begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<UUID_DE_UM_PERFIL>","role":"authenticated"}';
--   select count(*) as t2_logado_deve_ler from public.crm_procura_lote;
--   reset role;
-- rollback;
-- ESPERADO: lê sem erro (0 linhas se a tabela estiver vazia, mas SEM erro de
--           permissão). Erro de acesso REPROVA.


-- ---------------------------------------------------------------------
-- TESTE 3 — SEGUNDA PROCURA ATIVA BLOQUEADA
-- ---------------------------------------------------------------------
-- Prova o índice crm_procura_uma_ativa_por_familia (decisão 2 de Duam:
-- uma procura ativa por família).
-- ⚠️ CORREÇÃO (Duam): T3 e T4 agora rodam em TRANSAÇÃO própria com ROLLBACK.
--    Antes, T3 deixava o 1º cliente com procura ativa e o T4 reusava o mesmo
--    cliente — o T4 falharia no insert, ANTES de chegar à dupla aceitação.
begin;
do $$
declare
  v_cliente uuid;
begin
  select id into v_cliente from public.crm_clientes order by id limit 1;

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
rollback;  -- desfaz tudo: o T4 recebe o banco limpo


-- ---------------------------------------------------------------------
-- TESTE 4 — SEGUNDA ACEITAÇÃO DA MESMA OPORTUNIDADE BLOQUEADA
-- ---------------------------------------------------------------------
-- Prova o índice crm_po_uma_aceita_por_oportunidade — o BUG que Duam achou:
-- sem ele, um mesmo lote seria "aceito" por duas famílias.
-- ⚠️ Usa clientes DIFERENTES dos do T3 (offset 2 e 3) e roda em transação
--    própria — dupla proteção contra interferência entre testes.
begin;
do $$
declare
  v_c1 uuid; v_c2 uuid; v_p1 uuid; v_p2 uuid; v_op uuid; v_qtd int;
begin
  select count(*) into v_qtd from public.crm_clientes;
  if v_qtd < 4 then
    raise exception 'T4 NÃO PODE RODAR — precisa de pelo menos 4 clientes (há %)', v_qtd;
  end if;

  select id into v_c1 from public.crm_clientes order by id offset 2 limit 1;
  select id into v_c2 from public.crm_clientes order by id offset 3 limit 1;

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

  -- EXTRA (dentro desta transação, pois depende dos dados criados acima):
  -- o trigger de updated_at dispara?
  declare v_antes timestamptz; v_depois timestamptz; v_lid uuid;
  begin
    select id, updated_at into v_lid, v_antes
    from public.crm_procura_oportunidade where procura_id=v_p2 limit 1;
    perform pg_sleep(0.2);
    update public.crm_procura_oportunidade set observacao='toque' where id=v_lid;
    select updated_at into v_depois from public.crm_procura_oportunidade where id=v_lid;
    if v_depois > v_antes then
      raise notice 'EXTRA OK — trigger de updated_at disparou';
    else
      raise exception 'EXTRA REPROVOU — updated_at nao mudou';
    end if;
  end;
end $$;
rollback;  -- desfaz tudo


-- ---------------------------------------------------------------------
-- LIMPEZA — não é mais necessária
-- ---------------------------------------------------------------------
-- Todos os testes rodam em BEGIN/ROLLBACK: nada fica no banco depois deles.
-- (A branch é descartada de qualquer forma.)


-- =====================================================================
-- RESUMO ESPERADO
--   T1  anônimo lê 0 linhas ......................... [ ] a rodar na branch
--       (função já provada FALSE em produção)  ...... [x] PROVADO 2026-07-29
--   T2  usuário logado lê sem erro .................. [ ] a rodar na branch
--   T3  segunda procura ativa bloqueada ............. [ ] a rodar na branch
--   T4  segunda aceitação bloqueada ................. [ ] a rodar na branch
--   EX  updated_at dispara .......................... [ ] a rodar na branch
-- =====================================================================
