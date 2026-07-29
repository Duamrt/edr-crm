-- =====================================================================
-- EDR CRM — Lotes: SCRIPT DE TESTE (para ambiente descartável)
--
-- Data: 2026-07-29
--
-- STATUS — por teste, sem generalizar:
--
--   T1 · T3 · T4 · EXTRA (updated_at) ... ✅ EXECUTADOS E APROVADOS na branch
--       `lotes-v2` (2026-07-29). O SQL versionado é o MESMO que rodou.
--
--   T2 ... ⚠️ PARCIAL. A versão que rodou provava SOMENTE o SELECT de
--       crm_procura_lote — **1 das 12 policies**. O teste foi ampliado
--       depois para uma MATRIZ COMPLETA (3 tabelas × 4 operações × 2
--       identidades), e essa versão **ainda NÃO foi executada**.
--       ⇒ CRUD autenticado nas 3 tabelas é PENDÊNCIA de nova branch.
--       ⇒ NÃO declarar "12 policies provadas" antes dessa execução.
--
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
    v_cli         uuid;
    v_proc        uuid;   -- procura criada no setup
    v_oport       uuid;   -- oportunidade do setup (já tem ligação)
    v_oport_livre uuid;   -- oportunidade SEM ligação (alvo do insert de teste)
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

    -- ===============================================================
    -- SETUP DE DADO — uma linha em CADA uma das 3 tabelas
    -- ===============================================================
    -- ⚠️ CORREÇÃO (achado do Codex, 2026-07-29): a versão anterior só criava
    --    linha em crm_procura_lote, e depois media leitura numa tabela e
    --    escrita em outra — cobrindo 4 policies de 12. Agora cada tabela tem
    --    sua linha, e cada uma será exercitada nas 4 operações.
    --
    --    ⚠️ crm_procura_oportunidade não tem existência própria: ela LIGA uma
    --    procura a uma oportunidade (2 FKs NOT NULL). Por isso o setup cria
    --    a cadeia inteira — cliente → procura → oportunidade → ligação.
    insert into public.crm_clientes (nome, cpf, telefone)
    values ('TESTE T2', '00000000002', '00000000000') returning id into v_cli;

    -- 1/3 — crm_procura_lote
    insert into public.crm_procura_lote (cliente_id, cidade, regiao, situacao)
    values (v_cli, 'Petrolina', 'Centro', 'procurando') returning id into v_proc;

    -- 2/3 — crm_oportunidade_lote
    insert into public.crm_oportunidade_lote (descricao, cidade, regiao)
    values ('T2 setup - oportunidade', 'Petrolina', 'Centro') returning id into v_oport;

    -- 3/3 — crm_procura_oportunidade (a ligação entre as duas acima)
    insert into public.crm_procura_oportunidade (procura_id, oportunidade_id, situacao)
    values (v_proc, v_oport, 'sugerida');

    -- ===============================================================
    -- IDs EXTRAS — para os inserts de teste NÃO baterem em outra regra
    -- ===============================================================
    -- 🐛 CORREÇÃO (achado do Codex, 2026-07-29): a versão anterior tentava
    --    inserir uma ligação reusando v_proc + v_oport, que JÁ estão ligados
    --    acima. Isso viola `crm_po_sem_duplicata unique (procura_id,
    --    oportunidade_id)` e falharia ANTES de a policy ser avaliada —
    --    marcaria "REPROVOU" na policy de INSERT quando o culpado seria a
    --    restrição de duplicidade. Por isso: uma oportunidade EXTRA, livre,
    --    para a ligação de teste usar.
    insert into public.crm_oportunidade_lote (descricao, cidade, regiao)
    values ('T2 setup - oportunidade LIVRE', 'Petrolina', 'Centro')
    returning id into v_oport_livre;

    -- guarda os ids para os blocos 2a e 2b.
    -- ⚠️ `cliente` é essencial para a CONTRAPROVA: sem perfil, o insert de
    --    procura precisa usar um cliente_id VÁLIDO. Com uuid inventado, o
    --    erro seria de FK — e o teste marcaria "bloqueado" sem o RLS ter
    --    sido a causa (o 2º falso-verde apontado pelo Codex).
    create temp table t2_ids(cliente uuid, proc uuid, oport uuid, oport_livre uuid)
      on commit drop;
    insert into t2_ids values (v_cli, v_proc, v_oport, v_oport_livre);

    -- temp table: junta todas as medições num resultado só. Mesmo motivo do
    -- T1 — com selects separados, o conector devolve apenas o último e a
    -- contraprova some. É o CONJUNTO que prova.
    create temp table t2_res(etapa text, detalhe text) on commit drop;
  end $$;

  -- necessário para os blocos abaixo rodarem como authenticated (ver T1).
  -- t2_ids é lida pelo insert de crm_procura_oportunidade no bloco 2a.
  -- ⚠️ O grant é sobre as tabelas de APOIO do teste — nunca sobre as 3
  --    tabelas de Lotes, que continuam protegidas só pelo RLS.
  grant insert, select on t2_res to authenticated;
  grant select on t2_ids to authenticated;

  -- ===================================================================
  -- AS 12 POLICIES — 3 tabelas × 4 operações, com 2 identidades
  -- ===================================================================
  -- 🐛 CORREÇÃO 3 (achados do Codex, 2026-07-29): a versão anterior usava um
  --    LOOP com EXECUTE/format() sobre uma lista de tabelas. Parecia elegante
  --    e escondia DOIS FALSO-VERDES:
  --
  --    (a) o insert de ligação reusava a procura + oportunidade do setup, que
  --        JÁ estavam ligadas. Falharia pela UNIQUE (procura_id,
  --        oportunidade_id) — nunca chegaria a exercitar a policy.
  --
  --    (b) a contraprova usava `when others then PASSOU`, aceitando QUALQUER
  --        erro como bloqueio de RLS. Como ela inseria com cliente_id e FKs
  --        inventados, o erro seria de CHAVE ESTRANGEIRA (23503) e o teste
  --        marcaria "policy bloqueou" sem o RLS ter sido consultado.
  --        Este era o defeito grave: um RLS ABERTO passaria no teste.
  --
  --    ⇒ LOOP ABANDONADO. As 3 tabelas têm dependências diferentes demais
  --      (a ligação exige 2 FKs válidas; a procura exige cliente; a
  --      oportunidade não exige nada) para o mesmo código genérico. Três
  --      blocos explícitos e curtos são mais seguros que uma matriz ambígua.
  --
  --    ⇒ REGRA NOVA em toda contraprova: só conta como bloqueio o SQLSTATE
  --      **42501** (insufficient_privilege), que é o erro de RLS. Qualquer
  --      outro (FK 23503, check 23514, unique 23505) é REPROVA por teste
  --      mal-montado — não é aprovação disfarçada.

  -- ---------- 2a — COM perfil: as 4 operações devem FUNCIONAR ----------
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

  insert into t2_res values ('t2a_0_funcao',
    case when crm_user_has_profile() then 'PASSOU func=true' else 'REPROVOU func=false' end);

  do $$
  declare
    v_n     int;
    v_novo  uuid;
    v_cli   uuid;
    v_proc  uuid;
    v_olivre uuid;
  begin
    select cliente, proc, oport_livre into v_cli, v_proc, v_olivre from t2_ids;

    -- =============== TABELA 1/3: crm_procura_lote ===============
    begin
      select count(*) into v_n from public.crm_procura_lote;
      insert into t2_res values ('t2a_procura_1_select',
        case when v_n = 1 then 'PASSOU leu 1' else 'REPROVOU leu '||v_n end);
    exception when others then
      insert into t2_res values ('t2a_procura_1_select', 'REPROVOU '||sqlstate||' '||sqlerrm);
    end;

    -- ⚠️ situacao='atendida' de propósito: o índice único parcial do T3 só
    --    cobre situações ATIVAS. Com 'procurando' o insert bateria na regra
    --    de negócio e pareceria falha de policy.
    v_novo := null;
    begin
      insert into public.crm_procura_lote (cliente_id, cidade, regiao, situacao)
      values (v_cli, 'Juazeiro', 'Zona Norte', 'atendida') returning id into v_novo;
      insert into t2_res values ('t2a_procura_2_insert', 'PASSOU inseriu');
    exception when others then
      insert into t2_res values ('t2a_procura_2_insert', 'REPROVOU '||sqlstate||' '||sqlerrm);
    end;

    if v_novo is not null then
      begin
        update public.crm_procura_lote set observacao = 'T2 update' where id = v_novo;
        get diagnostics v_n = row_count;
        insert into t2_res values ('t2a_procura_3_update',
          case when v_n = 1 then 'PASSOU alterou 1' else 'REPROVOU alterou '||v_n end);
      exception when others then
        insert into t2_res values ('t2a_procura_3_update', 'REPROVOU '||sqlstate||' '||sqlerrm);
      end;
      begin
        delete from public.crm_procura_lote where id = v_novo;
        get diagnostics v_n = row_count;
        insert into t2_res values ('t2a_procura_4_delete',
          case when v_n = 1 then 'PASSOU removeu 1' else 'REPROVOU removeu '||v_n end);
      exception when others then
        insert into t2_res values ('t2a_procura_4_delete', 'REPROVOU '||sqlstate||' '||sqlerrm);
      end;
    else
      insert into t2_res values ('t2a_procura_3_update', 'REPROVOU insert falhou antes');
      insert into t2_res values ('t2a_procura_4_delete', 'REPROVOU insert falhou antes');
    end if;

    -- =============== TABELA 2/3: crm_oportunidade_lote ===============
    -- ⚠️ 2 linhas no setup: a do vínculo + a LIVRE. Por isso espera 2.
    begin
      select count(*) into v_n from public.crm_oportunidade_lote;
      insert into t2_res values ('t2a_oport_1_select',
        case when v_n = 2 then 'PASSOU leu 2' else 'REPROVOU leu '||v_n end);
    exception when others then
      insert into t2_res values ('t2a_oport_1_select', 'REPROVOU '||sqlstate||' '||sqlerrm);
    end;

    v_novo := null;
    begin
      insert into public.crm_oportunidade_lote (descricao, cidade, regiao)
      values ('T2 escrita autenticada', 'Petrolina', 'Centro') returning id into v_novo;
      insert into t2_res values ('t2a_oport_2_insert', 'PASSOU inseriu');
    exception when others then
      insert into t2_res values ('t2a_oport_2_insert', 'REPROVOU '||sqlstate||' '||sqlerrm);
    end;

    if v_novo is not null then
      begin
        update public.crm_oportunidade_lote set observacao = 'T2 update' where id = v_novo;
        get diagnostics v_n = row_count;
        insert into t2_res values ('t2a_oport_3_update',
          case when v_n = 1 then 'PASSOU alterou 1' else 'REPROVOU alterou '||v_n end);
      exception when others then
        insert into t2_res values ('t2a_oport_3_update', 'REPROVOU '||sqlstate||' '||sqlerrm);
      end;
      begin
        delete from public.crm_oportunidade_lote where id = v_novo;
        get diagnostics v_n = row_count;
        insert into t2_res values ('t2a_oport_4_delete',
          case when v_n = 1 then 'PASSOU removeu 1' else 'REPROVOU removeu '||v_n end);
      exception when others then
        insert into t2_res values ('t2a_oport_4_delete', 'REPROVOU '||sqlstate||' '||sqlerrm);
      end;
    else
      insert into t2_res values ('t2a_oport_3_update', 'REPROVOU insert falhou antes');
      insert into t2_res values ('t2a_oport_4_delete', 'REPROVOU insert falhou antes');
    end if;

    -- =============== TABELA 3/3: crm_procura_oportunidade ===============
    begin
      select count(*) into v_n from public.crm_procura_oportunidade;
      insert into t2_res values ('t2a_ligacao_1_select',
        case when v_n = 1 then 'PASSOU leu 1' else 'REPROVOU leu '||v_n end);
    exception when others then
      insert into t2_res values ('t2a_ligacao_1_select', 'REPROVOU '||sqlstate||' '||sqlerrm);
    end;

    -- 🐛 CORREÇÃO: usa a oportunidade LIVRE (v_olivre), não a do setup.
    --    Com a do setup, o par (procura, oportunidade) já existiria e o
    --    insert falharia pela UNIQUE — antes de a policy ser avaliada.
    v_novo := null;
    begin
      insert into public.crm_procura_oportunidade (procura_id, oportunidade_id, situacao)
      values (v_proc, v_olivre, 'apresentada') returning id into v_novo;
      insert into t2_res values ('t2a_ligacao_2_insert', 'PASSOU inseriu');
    exception when others then
      insert into t2_res values ('t2a_ligacao_2_insert', 'REPROVOU '||sqlstate||' '||sqlerrm);
    end;

    if v_novo is not null then
      begin
        update public.crm_procura_oportunidade set observacao = 'T2 update' where id = v_novo;
        get diagnostics v_n = row_count;
        insert into t2_res values ('t2a_ligacao_3_update',
          case when v_n = 1 then 'PASSOU alterou 1' else 'REPROVOU alterou '||v_n end);
      exception when others then
        insert into t2_res values ('t2a_ligacao_3_update', 'REPROVOU '||sqlstate||' '||sqlerrm);
      end;
      begin
        delete from public.crm_procura_oportunidade where id = v_novo;
        get diagnostics v_n = row_count;
        insert into t2_res values ('t2a_ligacao_4_delete',
          case when v_n = 1 then 'PASSOU removeu 1' else 'REPROVOU removeu '||v_n end);
      exception when others then
        insert into t2_res values ('t2a_ligacao_4_delete', 'REPROVOU '||sqlstate||' '||sqlerrm);
      end;
    else
      insert into t2_res values ('t2a_ligacao_3_update', 'REPROVOU insert falhou antes');
      insert into t2_res values ('t2a_ligacao_4_delete', 'REPROVOU insert falhou antes');
    end if;
  end $$;
  reset role;

  -- ---------- 2b — CONTRAPROVA sem perfil: as 4 devem ser BARRADAS ----------
  -- Sem esta metade, "authenticated consegue tudo" não distinguiria RLS
  -- funcionando de RLS aberto para qualquer logado no banco.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

  insert into t2_res values ('t2b_0_funcao',
    case when crm_user_has_profile() then 'REPROVOU func=true' else 'PASSOU func=false' end);

  -- 🐛 CORREÇÃO DO FALSO-VERDE GRAVE (achado do Codex, 2026-07-29):
  --    A versão anterior inseria com `cliente_id = gen_random_uuid()` e FKs
  --    inventadas, e classificava com `when others then PASSOU`. Ou seja:
  --    o insert falhava por CHAVE ESTRANGEIRA (23503) e o teste anotava
  --    "policy bloqueou". Um RLS COMPLETAMENTE ABERTO passaria nesse teste.
  --
  --    Agora, duas mudanças que se reforçam:
  --      1. os inserts usam IDs VÁLIDOS, preparados no setup — o único
  --         motivo possível de falha passa a ser o RLS;
  --      2. só o SQLSTATE **42501** (insufficient_privilege) conta como
  --         bloqueio. Qualquer outro erro é REPROVA por teste mal-montado.
  do $$
  declare
    v_n     int;
    v_cli   uuid;
    v_proc  uuid;
    v_olivre uuid;
  begin
    -- IDs VÁLIDOS do setup: sem eles, o erro seria de FK, não de RLS.
    select cliente, proc, oport_livre into v_cli, v_proc, v_olivre from t2_ids;

    -- =============== TABELA 1/3: crm_procura_lote ===============
    select count(*) into v_n from public.crm_procura_lote;
    insert into t2_res values ('t2b_procura_1_select',
      case when v_n = 0 then 'PASSOU leu 0' else 'REPROVOU leu '||v_n end);

    begin
      insert into public.crm_procura_lote (cliente_id, cidade, regiao, situacao)
      values (v_cli, 'Invasao', 'Sem perfil', 'atendida');
      insert into t2_res values ('t2b_procura_2_insert', 'REPROVOU inseriu sem perfil');
    exception
      when insufficient_privilege then
        insert into t2_res values ('t2b_procura_2_insert', 'PASSOU bloqueado 42501 (RLS)');
      when others then
        insert into t2_res values ('t2b_procura_2_insert',
          'REPROVOU erro NAO-RLS '||sqlstate||' '||sqlerrm);
    end;

    update public.crm_procura_lote set observacao = 'invasao' where true;
    get diagnostics v_n = row_count;
    insert into t2_res values ('t2b_procura_3_update',
      case when v_n = 0 then 'PASSOU alterou 0' else 'REPROVOU alterou '||v_n end);

    delete from public.crm_procura_lote where true;
    get diagnostics v_n = row_count;
    insert into t2_res values ('t2b_procura_4_delete',
      case when v_n = 0 then 'PASSOU removeu 0' else 'REPROVOU removeu '||v_n end);

    -- =============== TABELA 2/3: crm_oportunidade_lote ===============
    select count(*) into v_n from public.crm_oportunidade_lote;
    insert into t2_res values ('t2b_oport_1_select',
      case when v_n = 0 then 'PASSOU leu 0' else 'REPROVOU leu '||v_n end);

    begin
      insert into public.crm_oportunidade_lote (descricao, cidade, regiao)
      values ('T2 sem perfil', 'Invasao', 'Sem perfil');
      insert into t2_res values ('t2b_oport_2_insert', 'REPROVOU inseriu sem perfil');
    exception
      when insufficient_privilege then
        insert into t2_res values ('t2b_oport_2_insert', 'PASSOU bloqueado 42501 (RLS)');
      when others then
        insert into t2_res values ('t2b_oport_2_insert',
          'REPROVOU erro NAO-RLS '||sqlstate||' '||sqlerrm);
    end;

    update public.crm_oportunidade_lote set observacao = 'invasao' where true;
    get diagnostics v_n = row_count;
    insert into t2_res values ('t2b_oport_3_update',
      case when v_n = 0 then 'PASSOU alterou 0' else 'REPROVOU alterou '||v_n end);

    delete from public.crm_oportunidade_lote where true;
    get diagnostics v_n = row_count;
    insert into t2_res values ('t2b_oport_4_delete',
      case when v_n = 0 then 'PASSOU removeu 0' else 'REPROVOU removeu '||v_n end);

    -- =============== TABELA 3/3: crm_procura_oportunidade ===============
    select count(*) into v_n from public.crm_procura_oportunidade;
    insert into t2_res values ('t2b_ligacao_1_select',
      case when v_n = 0 then 'PASSOU leu 0' else 'REPROVOU leu '||v_n end);

    -- FKs VÁLIDAS (procura do setup + oportunidade livre) e par ainda não
    -- usado: nem FK nem UNIQUE podem mascarar o resultado.
    begin
      insert into public.crm_procura_oportunidade (procura_id, oportunidade_id, situacao)
      values (v_proc, v_olivre, 'sugerida');
      insert into t2_res values ('t2b_ligacao_2_insert', 'REPROVOU inseriu sem perfil');
    exception
      when insufficient_privilege then
        insert into t2_res values ('t2b_ligacao_2_insert', 'PASSOU bloqueado 42501 (RLS)');
      when others then
        insert into t2_res values ('t2b_ligacao_2_insert',
          'REPROVOU erro NAO-RLS '||sqlstate||' '||sqlerrm);
    end;

    update public.crm_procura_oportunidade set observacao = 'invasao' where true;
    get diagnostics v_n = row_count;
    insert into t2_res values ('t2b_ligacao_3_update',
      case when v_n = 0 then 'PASSOU alterou 0' else 'REPROVOU alterou '||v_n end);

    delete from public.crm_procura_oportunidade where true;
    get diagnostics v_n = row_count;
    insert into t2_res values ('t2b_ligacao_4_delete',
      case when v_n = 0 then 'PASSOU removeu 0' else 'REPROVOU removeu '||v_n end);
  end $$;
  reset role;

  -- ---------- 2c — o dado do setup sobreviveu ao 2b? ----------
  -- Sem isto, "removeu 0" poderia significar "não havia nada para remover".
  --
  -- ⚠️ ARITMÉTICA (conferir sempre que o setup mudar):
  --    · crm_procura_lote ......... 1 do setup. O 2a criou 1 e apagou a
  --                                 mesma (saldo 0) ⇒ esperado 1.
  --    · crm_oportunidade_lote .... 2 do setup (a do vínculo + a LIVRE).
  --                                 O 2a criou 1 e apagou a mesma ⇒ esperado 2.
  --    · crm_procura_oportunidade . 1 do setup. O 2a criou 1 (usando a
  --                                 oportunidade livre) e apagou ⇒ esperado 1.
  --    Acima do esperado → o DELETE do 2a não funcionou.
  --    Abaixo → o 2b conseguiu apagar. Falhas opostas, ambas graves.
  do $$
  declare v_n int;
  begin
    select count(*) into v_n from public.crm_procura_lote;
    insert into t2_res values ('t2c_intacto_procura',
      case when v_n = 1 then 'PASSOU 1 linha intacta'
           when v_n > 1 then 'REPROVOU sobrou '||v_n||' (delete do 2a falhou?)'
           else 'REPROVOU sobrou 0 (2b apagou o setup!)' end);

    select count(*) into v_n from public.crm_oportunidade_lote;
    insert into t2_res values ('t2c_intacto_oport',
      case when v_n = 2 then 'PASSOU 2 linhas intactas'
           when v_n > 2 then 'REPROVOU sobrou '||v_n||' (delete do 2a falhou?)'
           else 'REPROVOU sobrou '||v_n||' (2b apagou o setup!)' end);

    select count(*) into v_n from public.crm_procura_oportunidade;
    insert into t2_res values ('t2c_intacto_ligacao',
      case when v_n = 1 then 'PASSOU 1 linha intacta'
           when v_n > 1 then 'REPROVOU sobrou '||v_n||' (delete do 2a falhou?)'
           else 'REPROVOU sobrou 0 (2b apagou o setup!)' end);
  end $$;

  select etapa, detalhe,
         case when detalhe like 'PASSOU%' then 'OK' else 'FALHA' end as veredito
  from t2_res order by etapa;
rollback;
-- ESPERADO: 29 linhas, TODAS começando com 'PASSOU'.
--   2 de função (t2a_0, t2b_0)
--   12 do bloco 2a  → 3 tabelas × 4 operações, todas funcionando
--   12 do bloco 2b  → 3 tabelas × 4 operações, todas barradas
--   3  do bloco 2c  → o dado do setup intacto em cada tabela
--
--   t2a com REPROVOU → RLS fecha demais: a tela não funcionaria
--   t2b com REPROVOU → duas leituras possíveis, e a mensagem distingue:
--                      · 'REPROVOU inseriu sem perfil'  → RLS ABERTO. Grave.
--                      · 'REPROVOU erro NAO-RLS 23503'  → o teste está
--                        mal-montado (FK inválida). NÃO é aprovação: o RLS
--                        não chegou a ser exercitado. Corrigir o teste.
--   t2c com REPROVOU → o 2b conseguiu apagar algo, ou o delete do 2a falhou
--
-- ⚠️ NENHUM 'PASSOU' pode vir de `when others`. Se aparecer um SQLSTATE que
--    não seja 42501 numa contraprova, o resultado é REPROVA — foi assim que
--    a versão anterior mascarou um RLS potencialmente aberto.
--
-- ⚠️ STATUS DESTA VERSÃO DO T2: **NÃO EXECUTADA.**
--    A execução em `lotes-v2` (2026-07-29) rodou uma versão que media
--    SOMENTE leitura de crm_procura_lote, e ela passou:
--        t2a_com_perfil | func=true  | leu=1 | PASSOU
--        t2b_sem_perfil | func=false | leu=0 | PASSOU
--    Ou seja: **1 das 12 policies está provada** (SELECT de
--    crm_procura_lote). As outras 11 aguardam nova branch descartável.
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
--   T2  logado ....... PASSOU **SÓ LEITURA de crm_procura_lote** — com perfil:
--                      func=true, leu 1; sem perfil: func=false, leu 0.
--                      ⚠️ Isso é **1 das 12 policies** criadas pelo 08
--                      (3 tabelas × 4 operações). INSERT/UPDATE/DELETE não
--                      foram exercitados em tabela nenhuma, e
--                      crm_oportunidade_lote e crm_procura_oportunidade não
--                      foram tocadas. O T2 virou matriz completa e aguarda
--                      nova branch.
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
--   5. T2 provava só LEITURA (achado do Codex, 2026-07-29):
--      o 08 cria 4 policies SEPARADAS por tabela — SELECT, INSERT, UPDATE e
--      DELETE. São regras distintas: provar uma não prova as outras. Com 3
--      tabelas, a execução em `lotes-v2` exercitou as de SELECT e deixou 9
--      policies sem teste. A tela de Lotes vai precisar das quatro.
--
--   6. A 1ª ampliação ainda não cobria as 3 tabelas (achado do Codex):
--      ela media leitura em crm_procura_lote e escrita em
--      crm_oportunidade_lote, e nunca tocava crm_procura_oportunidade —
--      4 policies de 12. Testar coisas DIFERENTES em tabelas diferentes
--      dava aparência de cobertura sem cobertura.
--
--   7. 🐛 A MATRIZ EM LOOP tinha DOIS FALSO-VERDES (achado do Codex):
--
--      (a) o insert de ligação reusava procura + oportunidade do setup, que
--          já estavam ligadas ⇒ falharia pela UNIQUE, e a policy de INSERT
--          apareceria como REPROVADA sem nunca ter sido avaliada.
--
--      (b) 🚨 GRAVE: a contraprova inseria com cliente_id e FKs inventados e
--          classificava com `when others then PASSOU`. O erro real seria
--          23503 (foreign_key_violation), mas o teste anotava "policy
--          bloqueou". **Um RLS completamente aberto passaria nesse teste.**
--
--      Correções: (i) LOOP ABANDONADO — três blocos explícitos, porque as
--      dependências das 3 tabelas não cabem no mesmo molde; (ii) todos os
--      inserts usam IDs VÁLIDOS do setup; (iii) contraprova só aceita
--      SQLSTATE 42501 como bloqueio — qualquer outro erro REPROVA.
--      AINDA NÃO EXECUTADO.
--
-- =====================================================================
-- ESTADO ATUAL — o que está provado e o que não está
-- =====================================================================
-- ✅ PROVADO em `lotes-v2` (2026-07-29):
--    · T1 (anônimo bloqueado) · T3 (2ª procura ativa) · T4 (2ª aceitação)
--    · EXTRA updated_at nas 3 tabelas
--    · Estrutura, owner, GRANT efetivo, RLS ativa, 4 policies por tabela
--      (que as policies EXISTEM — não que cada uma se comporta como deve)
--    · T2 apenas no SELECT de crm_procura_lote
--
-- ⚠️ NÃO PROVADO — cobertura de policy por tabela:
--
--      tabela                      | SELECT | INSERT | UPDATE | DELETE
--      ----------------------------|--------|--------|--------|--------
--      crm_procura_lote            |   ✅   |   ❌   |   ❌   |   ❌
--      crm_oportunidade_lote       |   ❌   |   ❌   |   ❌   |   ❌
--      crm_procura_oportunidade    |   ❌   |   ❌   |   ❌   |   ❌
--
--    ⇒ 1 de 12. O T2 em matriz cobre as 12, mas exige nova branch.
--    · A tela lotes.html contra estas tabelas com dado real.
--    · Os formulários de cadastro de procura/oportunidade (não existem ainda).
--    · Qualquer coisa em celular.
-- =====================================================================
