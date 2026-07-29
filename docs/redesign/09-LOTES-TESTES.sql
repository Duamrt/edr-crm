-- =====================================================================
-- EDR CRM — Lotes: SCRIPT DE TESTE (para ambiente descartável)
--
-- Data: 2026-07-29
--
-- STATUS: **EXECUTADO E APROVADO** na branch `lotes-v2` (2026-07-29).
--   Cada teste abaixo traz, logo após o SQL, o resultado real que retornou.
--   O SQL versionado aqui é o MESMO que rodou — reconciliado em 2026-07-29
--   após o Codex apontar que o T1 executado divergia do arquivo (ver
--   "RECONCILIAÇÃO DE EVIDÊNCIA" no fim).
--   PRODUÇÃO NUNCA FOI TOCADA, em nenhum momento.
--
-- Como usar:
--   0. ⚠️ COMO A BRANCH REALMENTE NASCE (confirmado por log em 2026-07-29):
--      a criação da branch aplica TODAS as 46 migrations do projeto, e ela
--      FALHA logo na 1ª (`performance_indexes_edr_system`, do EDR), com
--        ERROR: relation "adicional_pagamentos" does not exist
--      porque essa migration indexa tabelas do EDR que nunca foram criadas
--      por migration. Resultado: branch em MIGRATIONS_FAILED, com 0 tabelas —
--      mas com o banco ACTIVE_HEALTHY e utilizável.
--      ⇒ O caminho que FUNCIONA: aplicar à mão, na ordem, o conteúdo exato
--        das 15 migrations de CRM. Elas são autossuficientes (só dependem de
--        auth.users/auth.uid()/gen_random_uuid) e passaram 15/15.
--      A branch traz o SCHEMA mas nunca os DADOS de produção — por isso os
--      testes criam seus próprios clientes e são desfeitos no rollback.
--   1. Criar branch de banco no Supabase (ambiente separado, descartável)
--   2. Aplicar as 15 migrations de CRM (ver nota 0)
--   3. Rodar 08-LOTES-SQL-PROPOSTO.sql
--   4. Rodar ESTE arquivo
--   5. Conferir os resultados
--   6. Destruir a branch
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
--
-- ⚠️ CORREÇÃO 2 (achado do Codex, 2026-07-29) — RECONCILIAÇÃO DE EVIDÊNCIA:
--    A versão anterior fazia DOIS selects separados. Ao executar na branch
--    `lotes-v2`, o conector MCP devolveu apenas o resultado do ÚLTIMO select
--    (t1b = 0) e engoliu o primeiro. Sem ver t1a, o teste era inválido:
--    t1a = 0 significaria que o insert falhou e o "anon lê 0" não provaria nada.
--
--    O SQL abaixo é EXATAMENTE o que foi executado e retornou:
--        t1a_dono_deve_ver_1     | 1 | PASSOU
--        t1b_anon_deve_ser_zero  | 0 | PASSOU
--
--    Mudanças em relação à versão anterior, e por quê:
--      · temp table `t1_res` — junta as duas medições em UM resultado, para
--        que o par apareça na saída. É o par que prova, não o número solto.
--      · `grant insert, select on t1_res to anon` — sem isso o insert como
--        anon falha com 42501 (permission denied for table t1_res). A temp
--        table pertence ao dono da sessão; anon não a enxerga por padrão.
--        Isso NÃO afeta a prova: o grant é sobre a tabela de resultado, não
--        sobre crm_procura_lote, que continua protegida só pelo RLS.
--      · coluna `veredito` — o próprio Postgres decide PASSOU/REPROVOU, em
--        vez de eu comparar números a olho.
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
    create temp table t1_res(etapa text, valor bigint) on commit drop;
    -- como postgres (dono): o registro EXISTE
    insert into t1_res values ('t1a_dono_deve_ver_1', (select count(*) from public.crm_procura_lote));
  end $$;

  -- necessário para o insert abaixo rodar como anon (ver nota acima)
  grant insert, select on t1_res to anon;

  -- como anon: NÃO pode enxergar o mesmo registro
  set local role anon;
  insert into t1_res values ('t1b_anon_deve_ser_zero', (select count(*) from public.crm_procura_lote));
  reset role;

  select etapa, valor,
         case when etapa like 't1a%' and valor = 1 then 'PASSOU'
              when etapa like 't1b%' and valor = 0 then 'PASSOU'
              else 'REPROVOU' end as veredito
  from t1_res order by etapa;
rollback;
-- ESPERADO: t1a = 1 (o dado existe) E t1b = 0 (anon não vê).
--   t1a = 0  → o insert falhou, teste inválido
--   t1b > 0  → RLS ABERTA, REPROVA
-- ✅ EXECUTADO na branch `lotes-v2` (2026-07-29): t1a=1 PASSOU · t1b=0 PASSOU


-- ---------------------------------------------------------------------
-- TESTE 2 — USUÁRIO LOGADO LIBERADO
-- ---------------------------------------------------------------------
-- ⚠️ CORREÇÃO (Duam/Codex, 2026-07-29) — este teste tinha DOIS problemas:
--
--   (a) Estava INTEIRAMENTE COMENTADO. Nunca rodou a partir deste arquivo.
--       O "PASSOU, leu 1 linha" registrado antes veio de SQL digitado à mão
--       na branch — não deste script. Agora é código executável.
--
--   (b) Pedia "um UUID real de crm_profiles da branch". Mas a branch nasce
--       SEM DADOS: não há perfil nenhum para copiar. O teste travaria por
--       falta de perfil e isso seria confundido com falha de RLS.
--       Agora ele CRIA a própria identidade, dentro da transação.
--
-- MÉTODO (e por que ele é honesto):
--
--   1. crm_profiles.id tem FK para auth.users(id) — verificado no catálogo:
--        crm_profiles_id_fkey  FOREIGN KEY (id) REFERENCES auth.users(id)
--      Então NÃO dá para criar perfil sem antes criar o usuário. O teste
--      insere em auth.users e depois em crm_profiles, nessa ordem.
--
--   2. A leitura é feita com `set local role authenticated` **E**
--      `request.jwt.claims` apontando para esse id. As duas coisas juntas:
--      a role tira o BYPASSRLS, e o claim é de onde auth.uid() lê o id.
--      Só a role não basta — sem claim, auth.uid() é null e a função
--      retornaria FALSE por falta de identidade, não por RLS.
--
--   3. NÃO usa resultado de superusuário como prova. O papel `postgres` tem
--      BYPASSRLS: ele leria tudo mesmo com o RLS quebrado. Aqui ele só
--      insere o dado; quem faz o SELECT que vale é `authenticated`.
--
--   3b. ✅ VERIFICADO no catálogo: crm_user_has_profile() é SECURITY DEFINER —
--       ela consulta crm_profiles com os privilégios do DONO, contornando o
--       RLS daquela tabela. Isso é necessário (senão a política de crm_profiles
--       chamaria a própria função, em recursão), mas tem uma consequência
--       para este teste: a função responde honestamente "esse id tem perfil?"
--       para QUALQUER identidade. Logo, se t2b vier `true`, o defeito não está
--       no RLS das tabelas de Lotes — está na função.
--
--   4. Prova por CONTRASTE, no MESMO dado e na MESMA transação:
--        t2a → com perfil    → deve ler 1
--        t2b → SEM perfil    → deve ler 0
--      Se as duas lessem 1, o RLS estaria aberto e o "PASSOU" seria falso.
--      É esse par que transforma o teste em prova; um número sozinho, não.
--
--   5. Tudo em ROLLBACK: o usuário e o perfil de teste somem no fim.
--
--   6. UUIDs FIXOS, não gerados. `set local request.jwt.claims` exige valor
--      literal — não aceita variável. Com uuid aleatório seria preciso copiar
--      o valor à mão entre um passo e outro, que é justamente o defeito que
--      esta correção elimina. Como tudo cai no ROLLBACK, um id fixo e
--      reconhecível é seguro e deixa o teste rodável de ponta a ponta.
--
--   7. 🐛 ARMADILHA ENCONTRADA ANTES DE GASTAR BRANCH (2026-07-29):
--      crm_profiles tem o trigger trg_crm_profiles_block_self_escalation,
--      que dispara em INSERT e exige:
--          IF NEW.id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION
--      Sem sessão, auth.uid() é null ≠ uuid fixo ⇒ o insert do perfil
--      ABORTARIA com 'Não pode criar profile para outro usuário', e o T2
--      falharia por causa do trigger, não por RLS. Mesmo padrão do defeito
--      do set_crm_updated_at(): dependência de ambiente que só aparece ao
--      executar de verdade.
--
--      SAÍDA (a porta que o próprio autor deixou, não um contorno):
--      a 1ª linha do trigger é `IF auth.role() = 'service_role' THEN RETURN NEW`
--      — bypass explícito "necessário pra triggers/cron internos".
--      ⚠️ auth.role() lê o CLAIM do JWT, não o papel do Postgres: por isso o
--      setup abaixo seta request.jwt.claims com role=service_role. Trocar de
--      role do Postgres sozinho NÃO ativaria o bypass.
--      Alternativa descartada: ALTER TABLE ... DISABLE TRIGGER — mudaria o
--      estado do schema no meio do teste, mais invasivo e sem ganho.
begin;
  -- setup roda como service_role para passar pelo trigger de crm_profiles.
  -- ⚠️ Isto vale SÓ para o setup. A LEITURA que serve de prova é feita
  --    adiante como `authenticated` — ver notas 3 e 4.
  set local request.jwt.claims = '{"role":"service_role"}';

  do $$
  declare
    -- fixos de propósito — ver nota 6 acima
    v_uid uuid := '11111111-1111-4111-8111-111111111111';  -- COM perfil
    v_sem uuid := '22222222-2222-4222-8222-222222222222';  -- SEM perfil
    v_cli uuid;
  begin
    -- ✅ VERIFICADO no catálogo: em auth.users, a ÚNICA coluna NOT NULL sem
    --    default é `id`. is_sso_user e is_anonymous têm default false.
    --    Por isso o insert mínimo abaixo basta — nada de preencher aud,
    --    instance_id ou encrypted_password só por superstição.

    -- identidade 1: existe em auth.users E em crm_profiles
    insert into auth.users (id, email)
    values (v_uid, 't2-com-perfil@teste.local');
    insert into public.crm_profiles (id, nome, role)
    values (v_uid, 'TESTE T2', 'operador');

    -- identidade 2: existe em auth.users, mas NÃO tem perfil
    insert into auth.users (id, email)
    values (v_sem, 't2-sem-perfil@teste.local');

    -- o dado que será lido (ou não)
    insert into public.crm_clientes (nome, cpf, telefone)
    values ('TESTE T2', '00000000002', '00000000000') returning id into v_cli;
    insert into public.crm_procura_lote (cliente_id, cidade, regiao, situacao)
    values (v_cli, 'Petrolina', 'Centro', 'procurando');

    -- temp table: junta as 2 medições num resultado só. Mesmo motivo do T1 —
    -- com selects separados, o conector devolve apenas o último e a
    -- contraprova some. É o PAR que prova.
    create temp table t2_res(etapa text, func boolean, leu bigint) on commit drop;
  end $$;

  -- necessário para os inserts abaixo rodarem como authenticated (ver T1)
  grant insert, select on t2_res to authenticated;

  -- 2a — COM perfil: deve LER
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
  insert into t2_res values ('t2a_com_perfil', crm_user_has_profile(), (select count(*) from public.crm_procura_lote));
  reset role;

  -- 2b — CONTRAPROVA, sem perfil: deve LER ZERO no MESMO dado
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
  insert into t2_res values ('t2b_sem_perfil', crm_user_has_profile(), (select count(*) from public.crm_procura_lote));
  reset role;

  select etapa, func, leu,
         case when etapa='t2a_com_perfil' and func is true  and leu = 1 then 'PASSOU'
              when etapa='t2b_sem_perfil' and func is false and leu = 0 then 'PASSOU'
              else 'REPROVOU' end as veredito
  from t2_res order by etapa;
rollback;
-- ESPERADO:
--   t2a_com_perfil  → func = true   E  leu = 1
--   t2b_sem_perfil  → func = false  E  leu = 0
--
--   t2a leu 0 → RLS bloqueia quem TEM perfil: REPROVA (fecha demais)
--   t2b leu >0 → RLS deixa passar quem NÃO tem perfil: REPROVA (abre demais)
-- ✅ EXECUTADO na branch `lotes-v2` (2026-07-29):
--      t2a_com_perfil | func=true  | leu=1 | PASSOU
--      t2b_sem_perfil | func=false | leu=0 | PASSOU
--    O bypass service_role do setup funcionou na prática — o insert em
--    crm_profiles passou pelo trigger de escalação sem erro.


-- ---------------------------------------------------------------------
-- TESTE 3 — SEGUNDA PROCURA ATIVA BLOQUEADA
-- ---------------------------------------------------------------------
-- Prova o índice crm_procura_uma_ativa_por_familia (decisão 2 de Duam:
-- uma procura ativa por família).
-- ⚠️ CORREÇÃO (Duam): T3 e T4 agora rodam em TRANSAÇÃO própria com ROLLBACK.
--    Antes, T3 deixava o 1º cliente com procura ativa e o T4 reusava o mesmo
--    cliente — o T4 falharia no insert, ANTES de chegar à dupla aceitação.
--
-- ⚠️ CORREÇÃO 2 (reconciliação, 2026-07-29): a versão anterior usava
--    `raise notice`. Notices NÃO voltam pelo conector MCP — o teste rodaria
--    e não se veria nada, dando falsa impressão de silêncio-é-sucesso.
--    Agora grava numa temp table e faz SELECT no fim: o veredito aparece.
--    Este é o SQL exatamente como foi executado na branch.
begin;
create temp table t3_res(etapa text, veredito text) on commit drop;
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
  insert into t3_res values ('T3.1 primeira procura', 'OK inserida');

  -- 2ª procura ATIVA para o MESMO cliente: deve FALHAR
  begin
    insert into public.crm_procura_lote (cliente_id, cidade, regiao, situacao)
    values (v_cliente, 'Juazeiro', 'Zona Norte', 'em_analise');
    insert into t3_res values ('T3.2 segunda ativa', 'REPROVOU aceita indevidamente');
  exception when unique_violation then
    insert into t3_res values ('T3.2 segunda ativa', 'PASSOU bloqueada pelo indice');
  end;

  -- 3ª procura com situação ENCERRADA: deve PASSAR (histórico preservado)
  insert into public.crm_procura_lote (cliente_id, cidade, regiao, situacao)
  values (v_cliente, 'Petrolina', 'Zona Sul', 'desistiu');
  insert into t3_res values ('T3.3 encerrada convive', 'PASSOU historico preservado');
end $$;
select * from t3_res order by etapa;
rollback;  -- desfaz tudo: o T4 recebe o banco limpo
-- ✅ EXECUTADO na branch `lotes-v2` (2026-07-29):
--      T3.1 primeira procura  | OK inserida
--      T3.2 segunda ativa     | PASSOU bloqueada pelo indice
--      T3.3 encerrada convive | PASSOU historico preservado


-- ---------------------------------------------------------------------
-- TESTE 4 — SEGUNDA ACEITAÇÃO DA MESMA OPORTUNIDADE BLOQUEADA
-- ---------------------------------------------------------------------
-- Prova o índice crm_po_uma_aceita_por_oportunidade — o BUG que Duam achou:
-- sem ele, um mesmo lote seria "aceito" por duas famílias.
-- ⚠️ Usa clientes DIFERENTES dos do T3 (offset 2 e 3) e roda em transação
--    própria — dupla proteção contra interferência entre testes.
--
-- ⚠️ CORREÇÃO (reconciliação, 2026-07-29): `raise notice` trocado por temp
--    table + SELECT final — notices não voltam pelo conector MCP. Este é o
--    SQL exatamente como foi executado na branch `lotes-v2`.
begin;
create temp table t4_res(etapa text, veredito text) on commit drop;
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
  insert into t4_res values ('T4.1 duas familias avaliam', 'OK');

  -- 1ª aceitação: passa
  update public.crm_procura_oportunidade set situacao='aceita'
  where procura_id=v_p1 and oportunidade_id=v_op;
  insert into t4_res values ('T4.2 primeira aceitacao', 'OK registrada');

  -- 2ª aceitação da MESMA oportunidade: deve FALHAR
  begin
    update public.crm_procura_oportunidade set situacao='aceita'
    where procura_id=v_p2 and oportunidade_id=v_op;
    insert into t4_res values ('T4.3 segunda aceitacao', 'REPROVOU aceita 2x');
  exception when unique_violation then
    insert into t4_res values ('T4.3 segunda aceitacao', 'PASSOU bloqueada');
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
  insert into t4_res values ('EXTRA 1/3 crm_procura_oportunidade',
    case when v_v > '2020-01-01' then 'PASSOU trigger sobrescreveu' else 'REPROVOU ficou '||v_v end);

  -- 2/3 — crm_procura_lote
  update public.crm_procura_lote set updated_at = '2000-01-01' where id = v_p1;
  select updated_at into v_v from public.crm_procura_lote where id = v_p1;
  insert into t4_res values ('EXTRA 2/3 crm_procura_lote',
    case when v_v > '2020-01-01' then 'PASSOU trigger sobrescreveu' else 'REPROVOU ficou '||v_v end);

  -- 3/3 — crm_oportunidade_lote
  update public.crm_oportunidade_lote set updated_at = '2000-01-01' where id = v_op;
  select updated_at into v_v from public.crm_oportunidade_lote where id = v_op;
  insert into t4_res values ('EXTRA 3/3 crm_oportunidade_lote',
    case when v_v > '2020-01-01' then 'PASSOU trigger sobrescreveu' else 'REPROVOU ficou '||v_v end);
end $$;
select * from t4_res order by etapa;
rollback;  -- desfaz tudo
-- ✅ EXECUTADO na branch `lotes-v2` (2026-07-29):
--      T4.1 duas familias avaliam         | OK
--      T4.2 primeira aceitacao            | OK registrada
--      T4.3 segunda aceitacao             | PASSOU bloqueada
--      EXTRA 1/3 crm_procura_oportunidade | PASSOU trigger sobrescreveu
--      EXTRA 2/3 crm_procura_lote         | PASSOU trigger sobrescreveu
--      EXTRA 3/3 crm_oportunidade_lote    | PASSOU trigger sobrescreveu


-- ---------------------------------------------------------------------
-- LIMPEZA — não é mais necessária
-- ---------------------------------------------------------------------
-- Todos os testes rodam em BEGIN/ROLLBACK: nada fica no banco depois deles.
-- (A branch é descartada de qualquer forma.)


-- =====================================================================
-- ✅ EXECUÇÃO DEFINITIVA — branch `lotes-v2`, 2026-07-29
-- =====================================================================
-- Branch `lotes-v2` (lrhpnbvghrfxbjlgvbdt), criada, usada e DESTRUÍDA.
-- Produção nunca foi tocada (conferido depois: 0 tabelas novas, crm_lotes=31,
-- vínculos=7, 46 migrations).
--
--   Migrations CRM ... 15/15 aplicadas sem erro (à mão — ver nota 0 no topo)
--   Portão pré-08 .... 4/4 dependências presentes
--   Estrutura ........ 3 tabelas · dono postgres · RLS on · 4 policies e
--                      1 trigger por tabela
--   GRANT ............ has_table_privilege = true para anon E authenticated
--                      (SELECT/INSERT/UPDATE/DELETE) SEM nenhum GRANT escrito:
--                      o default ACL do schema aplicou, como previsto
--   T1  anônimo ...... PASSOU — dono lê 1, anon lê 0 no MESMO dado
--   T2  logado ....... PASSOU com contraprova — com perfil: func=true, leu 1;
--                      sem perfil: func=false, leu 0
--   T3  2ª procura ... PASSOU — bloqueada; encerrada convive
--   T4  2ª aceitação . PASSOU — bloqueada
--   EX  updated_at ... PASSOU nas 3 tabelas (1/3, 2/3, 3/3)
--   Resíduo .......... 0 em todas as tabelas (tudo em ROLLBACK)
--
-- =====================================================================
-- EXECUÇÃO ANTERIOR (branch `teste-lotes`, descartada) — só histórico
-- =====================================================================
--   Rodou uma versão pré-correção. Serve apenas para registrar o achado:
--
--   🐛 DEFEITO GRAVE que teria quebrado a produção:
--      set_crm_updated_at() escreve em `ultima_atualizacao`, não em
--      `updated_at`. Corrigido com função própria — ver 08-...sql seção 5.
--      Naquela execução o T2 estava comentado e o EXTRA cobria 1 tabela só;
--      ambos foram corrigidos e reexecutados em `lotes-v2`.
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
--   3. T2 não era autossuficiente (achado do Codex): pedia "um UUID real de
--      crm_profiles", mas a branch nasce sem dados — travaria por falta de
--      perfil e isso pareceria falha de RLS. Pior: o teste estava INTEIRO
--      COMENTADO, então nunca rodou daqui. Agora é executável, cria a própria
--      identidade (auth.users + crm_profiles) e prova por CONTRASTE
--      (com perfil lê 1 · sem perfil lê 0), sem usar superusuário como prova.
--
--      🐛 Ao preparar isso, o catálogo revelou uma armadilha que teria
--         abortado o T2 na branch: o trigger de crm_profiles exige
--         NEW.id = auth.uid(). Tratado com o bypass service_role que o
--         próprio trigger oferece — ver nota 7 do T2.
--
--   4. RECONCILIAÇÃO DE EVIDÊNCIA (achado do Codex, após `lotes-v2`):
--      o arquivo versionado ainda trazia o T1 com DOIS selects separados,
--      mas o que rodou na branch foi uma VARIANTE com temp table. Ou seja:
--      o resultado era real, mas não vinha deste arquivo — a mesma armadilha
--      do T2 comentado, em versão menor.
--
--      Por que a variante foi necessária (não foi capricho):
--        · o conector MCP devolve só o resultado do ÚLTIMO select. Com dois
--          selects, t1a sumia e sobrava "anon lê 0" — que sozinho não prova
--          nada, porque 0 também é o que se vê quando o insert falhou.
--        · `raise notice` (usado em T3/T4) não volta pelo conector: o teste
--          rodaria mudo e o silêncio pareceria sucesso.
--
--      AGORA: T1, T2, T3 e T4 no arquivo são EXATAMENTE o SQL executado,
--      com temp table + SELECT final, e cada um traz o resultado real logo
--      abaixo. Arquivo e evidência batem.
--
-- =====================================================================
-- ESTADO ATUAL
-- =====================================================================
-- Este arquivo FOI executado inteiro na branch `lotes-v2` e passou.
-- O SQL aqui é o mesmo que rodou (reconciliado no item 4 acima).
--
-- O que continua NÃO testado:
--   · a tela lotes.html contra estas tabelas com dado real;
--   · os formulários de cadastro de procura/oportunidade (não existem ainda);
--   · qualquer coisa em celular.
-- =====================================================================
