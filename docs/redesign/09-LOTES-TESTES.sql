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
  end $$;

  -- 2a — COM perfil: deve LER
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
  select crm_user_has_profile()                         as t2a_funcao_deve_ser_true,
         (select count(*) from public.crm_procura_lote) as t2a_deve_ler_1;
  reset role;

  -- 2b — CONTRAPROVA, sem perfil: deve LER ZERO no MESMO dado
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
  select crm_user_has_profile()                         as t2b_funcao_deve_ser_false,
         (select count(*) from public.crm_procura_lote) as t2b_deve_ser_zero;
  reset role;
rollback;
-- ESPERADO:
--   t2a_funcao_deve_ser_true  = true   E  t2a_deve_ler_1    = 1
--   t2b_funcao_deve_ser_false = false  E  t2b_deve_ser_zero = 0
--
--   t2a = 0 → RLS bloqueia quem TEM perfil: REPROVA (fecha demais)
--   t2b > 0 → RLS deixa passar quem NÃO tem perfil: REPROVA (abre demais)


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
--   T2  usuário logado .......... PASSOU, mas NÃO a partir deste arquivo:
--                                 o T2 estava todo comentado. O resultado veio
--                                 de SQL digitado à mão na branch, com um
--                                 perfil que existia lá. Sem contraprova.
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
-- CONSEQUÊNCIA: os resultados acima NÃO valem como prova desta versão.
-- Para provar o arquivo como está hoje, é preciso rodá-lo do zero numa nova
-- branch descartável — aguardando autorização de Duam.
-- =====================================================================
