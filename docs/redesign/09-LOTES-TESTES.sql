-- =====================================================================
-- EDR CRM — Lotes: SCRIPT DE TESTE (para ambiente descartável)
--
-- Data: 2026-07-29
--
-- STATUS DESTA VERSÃO DO ARQUIVO: **NUNCA EXECUTADA.**
--   Uma versão ANTERIOR rodou em branch descartável (`teste-lotes`, destruída).
--   Depois disso o arquivo foi corrigido em 3 pontos — ver "HISTÓRICO" no fim.
--   Portanto: os resultados registrados abaixo vieram da versão anterior.
--   Esta versão corrigida aguarda autorização de Duam para nova branch.
--   PRODUÇÃO NUNCA FOI TOCADA, em nenhum momento.
--
-- Como usar:
--   0. ⚠️ A branch nasce com o SCHEMA mas SEM DADOS de produção. Por isso os
--      testes criam seus próprios clientes dentro de cada transação — tudo é
--      desfeito no rollback.
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
    -- A branch nasce SEM dados de produção: cria o cliente aqui.
    -- Tudo é desfeito no rollback ao final.
    insert into public.crm_clientes (nome, cpf, telefone)
    values ('TESTE T1', '00000000001', '00000000000') returning id into v_cli;
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
  -- branch sem dados: cria o cliente do teste (desfeito no rollback)
  insert into public.crm_clientes (nome, cpf, telefone)
  values ('TESTE T3', '00000000003', '00000000000') returning id into v_cliente;

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
  v_c1 uuid; v_c2 uuid; v_p1 uuid; v_p2 uuid; v_op uuid;
  v_lid uuid;              -- id da LIGAÇÃO (crm_procura_oportunidade) sabotada no EXTRA
  v_v   timestamptz;       -- valor lido de volta após a sabotagem
begin
  -- branch sem dados: cria os dois clientes do teste (desfeitos no rollback).
  -- Clientes PRÓPRIOS deste teste — não reusa nada do T3, que já foi revertido.
  insert into public.crm_clientes (nome, cpf, telefone)
  values ('TESTE T4-A', '00000000041', '00000000000') returning id into v_c1;
  insert into public.crm_clientes (nome, cpf, telefone)
  values ('TESTE T4-B', '00000000042', '00000000000') returning id into v_c2;

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
  values (v_p1, v_op, 'sugerida') returning id into v_lid;   -- guardado para o EXTRA
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

  -- ---------------------------------------------------------------
  -- EXTRA — o trigger de updated_at escreve no campo? (AS 3 TABELAS)
  -- ---------------------------------------------------------------
  -- ⚠️ NÃO comparar horários: dentro de uma transação `now()` é CONSTANTE
  --    (horário de início), então updated_at seria igual antes e depois — daria
  --    falso-negativo. pg_sleep não ajuda: now() não avança na transação.
  --    Método correto: SABOTAR o campo com data antiga e ver o trigger
  --    sobrescrever.
  --
  -- ⚠️ CORREÇÃO (2026-07-29): a versão anterior testava SÓ
  --    crm_procura_oportunidade, mas o resumo afirmava "3/3 tabelas".
  --    Agora as 3 são realmente exercitadas, uma a uma.
  --    Este é o teste que pegaria a função errada (set_crm_updated_at grava em
  --    `ultima_atualizacao`, coluna que não existe aqui) — ver 08-...sql seção 5.

  -- 1/3 — crm_procura_oportunidade (a ligação criada acima)
  update public.crm_procura_oportunidade set updated_at = '2000-01-01' where id = v_lid;
  select updated_at into v_v from public.crm_procura_oportunidade where id = v_lid;
  if v_v > '2020-01-01' then
    raise notice 'EXTRA 1/3 OK — crm_procura_oportunidade: trigger sobrescreveu';
  else
    raise exception 'EXTRA 1/3 REPROVOU — crm_procura_oportunidade ficou em %', v_v;
  end if;

  -- 2/3 — crm_procura_lote
  update public.crm_procura_lote set updated_at = '2000-01-01' where id = v_p1;
  select updated_at into v_v from public.crm_procura_lote where id = v_p1;
  if v_v > '2020-01-01' then
    raise notice 'EXTRA 2/3 OK — crm_procura_lote: trigger sobrescreveu';
  else
    raise exception 'EXTRA 2/3 REPROVOU — crm_procura_lote ficou em %', v_v;
  end if;

  -- 3/3 — crm_oportunidade_lote
  update public.crm_oportunidade_lote set updated_at = '2000-01-01' where id = v_op;
  select updated_at into v_v from public.crm_oportunidade_lote where id = v_op;
  if v_v > '2020-01-01' then
    raise notice 'EXTRA 3/3 OK — crm_oportunidade_lote: trigger sobrescreveu';
  else
    raise exception 'EXTRA 3/3 REPROVOU — crm_oportunidade_lote ficou em %', v_v;
  end if;
end $$;
rollback;  -- desfaz tudo


-- ---------------------------------------------------------------------
-- LIMPEZA — não é mais necessária
-- ---------------------------------------------------------------------
-- Todos os testes rodam em BEGIN/ROLLBACK: nada fica no banco depois deles.
-- (A branch é descartada de qualquer forma.)


-- =====================================================================
-- RESULTADOS DA EXECUÇÃO ANTERIOR (versão pré-correção) — 2026-07-29
-- =====================================================================
-- Branch `teste-lotes` (pxldvwlzvducninsfavo), criada, usada e DESTRUÍDA.
-- Produção nunca foi tocada.
--
--   T1  anônimo bloqueado ....... PASSOU — dono lê 1, anon lê 0
--   T2  usuário logado .......... PASSOU — perfil real: função=true, leu 1
--   T3  2ª procura ativa ........ PASSOU — bloqueada; encerrada convive
--   T4  2ª aceitação ............ PASSOU — bloqueada
--   EX  updated_at .............. PASSOU em 1 tabela (crm_procura_oportunidade)
--
--   🐛 A execução encontrou um DEFEITO GRAVE que teria quebrado a produção:
--      set_crm_updated_at() escreve em `ultima_atualizacao`, não em
--      `updated_at`. Corrigido com função própria — ver 08-...sql seção 5.
--
-- =====================================================================
-- HISTÓRICO DE CORREÇÕES DESTE ARQUIVO (posteriores à execução acima)
-- =====================================================================
-- 2026-07-29 — revisão do Codex, 2 achados neste arquivo:
--
--   1. `v_lid` era usada no EXTRA sem declaração nem valor. O bloco não
--      compilaria. (Havia ainda um `declare` no meio do corpo executável,
--      inválido em PL/pgSQL.) Agora `v_lid` e `v_v` estão no DECLARE do bloco
--      e `v_lid` recebe o id via RETURNING no insert da ligação.
--
--   2. O resumo afirmava "3/3 tabelas", mas o EXTRA exercitava só
--      crm_procura_oportunidade. Agora o EXTRA testa as 3, uma a uma
--      (EXTRA 1/3, 2/3, 3/3), e o resumo acima diz o que de fato rodou.
--
-- CONSEQUÊNCIA: os resultados acima NÃO valem como prova desta versão.
-- Para provar o arquivo como está hoje, é preciso rodá-lo do zero numa nova
-- branch descartável — aguardando autorização de Duam.
-- =====================================================================
