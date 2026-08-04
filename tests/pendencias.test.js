// Testes — Atalhos de pendências do card "O que tá quebrado" (js/data/pendencias.js)
// Roda sem framework: node tests/pendencias.test.js
//
// IMPORTANTE (Opção A — fonte única no banco): estes testes cobrem só a camada JS
// (recortes, títulos, agrupamento, hrefs). Os CRITÉRIOS de pendência moram na view
// crm_vw_pendencias e NÃO são testados aqui — o teste de contrato contador×lista
// roda contra o banco nas Etapas 2/3 (ver docs/redesign/11-QUEBRADO-ATALHOS.md).

const fs = require('fs')
const path = require('path')
const vm = require('vm')

const noop = () => {}
const elStub = new Proxy({}, {
  get: (_, p) => (p === 'style' || p === 'dataset' || p === 'classList')
    ? new Proxy({}, { get: () => noop, set: () => true })
    : (typeof p === 'string' && ['textContent','innerHTML','value','id'].includes(p) ? '' : noop)
})
const ctx = {
  console, setTimeout, clearTimeout, Date, Math, JSON, Set, Map,
  window: { addEventListener: noop, location: { href: '' } },
  document: {
    addEventListener: noop, querySelector: () => null, querySelectorAll: () => [],
    getElementById: () => null, createElement: () => elStub, body: elStub
  },
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop }
}
vm.createContext(ctx)
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'utils.js'), 'utf8'), ctx)
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'data', 'pendencias.js'), 'utf8'), ctx)

let passou = 0, falhou = 0
function t(nome, fn) {
  try { fn(); console.log(`  ✅ ${nome}`); passou++ }
  catch (e) { console.log(`  ❌ ${nome}\n     ${e.message}`); falhou++ }
}
function eq(atual, esperado, msg) {
  const a = JSON.stringify(atual), e = JSON.stringify(esperado)
  if (a !== e) throw new Error(`${msg || ''} esperado ${e}, veio ${a}`)
}
function ok(v, msg) { if (!v) throw new Error(msg || 'esperado truthy') }

const RECORTES = vm.runInContext('PENDENCIA_RECORTES', ctx)
const href = r => vm.runInContext(`pendenciaHref(${JSON.stringify(r)})`, ctx)
const titulo = (r, itens) => vm.runInContext(`pendenciaTitulo(${JSON.stringify(r)}, ${JSON.stringify(itens)})`, ctx)
const agrupar = itens => vm.runInContext(`pendenciaAgruparPorCliente(${JSON.stringify(itens)})`, ctx)
const labelItem = i => vm.runInContext(`pendenciaLabelItem(${JSON.stringify(i)})`, ctx)

console.log('\n=== Recortes formalizados (contrato com a summary e a view) ===')
{
  t('exatamente os 6 recortes do card, nomes fixos', () =>
    eq(Object.keys(RECORTES).sort(), [
      'docs_recusados','docs_vencidos','impedimentos',
      'tarefas_amanha','tarefas_hoje','tarefas_vencidas'
    ]))
  t('todo recorte tem título e unidade singular/plural', () => {
    Object.values(RECORTES).forEach(d => {
      ok(d.titulo && d.titulo.length > 3)
      ok(Array.isArray(d.unidade) && d.unidade.length === 2)
    })
  })
  t('href válido para recorte conhecido, null para desconhecido', () => {
    eq(href('docs_vencidos'), 'clientes.html?pendencia=docs_vencidos')
    eq(href('tarefas_hoje'), 'clientes.html?pendencia=tarefas_hoje')
    eq(href('qualquer_coisa'), null)
    eq(href(''), null)
  })
  t('SQL proposto cobre os mesmos 6 recortes + revoga acesso direto à view', () => {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'docs', 'redesign', '11-QUEBRADO-SQL-PROPOSTO.sql'), 'utf8')
    Object.keys(RECORTES).forEach(r => ok(sql.includes(`'${r}'`), `recorte ${r} ausente do SQL`))
    ok(sql.includes('REVOKE ALL ON public.crm_vw_pendencias FROM anon'), 'REVOKE anon ausente')
    ok(sql.includes('REVOKE ALL ON public.crm_vw_pendencias FROM authenticated'), 'REVOKE authenticated ausente')
    ok(sql.includes("auth.uid()"), 'checagem de auth ausente na RPC')
    ok(sql.includes('public.crm_profiles'), 'checagem de profile (qualificada) ausente na RPC')
  })
  t('Etapa 2 é transação atômica com preflight antes de qualquer DDL', () => {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'docs', 'redesign', '11-QUEBRADO-SQL-PROPOSTO.sql'), 'utf8')
    const iBegin = sql.indexOf('BEGIN;')
    const iPreflight = sql.indexOf('PREFLIGHT:')
    const iCreateView = sql.indexOf('CREATE VIEW public.crm_vw_pendencias')
    const iCommit = sql.indexOf('COMMIT;')
    ok(iBegin !== -1 && iCommit !== -1, 'BEGIN/COMMIT ausentes')
    ok(iPreflight !== -1, 'preflight ausente')
    ok(iBegin < iPreflight && iPreflight < iCreateView && iCreateView < iCommit,
      'ordem errada: BEGIN → preflight → DDL → COMMIT')
    ok(sql.includes("c.relname = 'crm_vw_pendencias'"), 'preflight não checa a view')
    ok(sql.includes("p.proname = 'get_crm_pendencias'"), 'preflight não checa a função')
  })
  t('CREATE FUNCTION sem OR REPLACE (cria, nunca substitui)', () => {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'docs', 'redesign', '11-QUEBRADO-SQL-PROPOSTO.sql'), 'utf8')
    ok(sql.includes('CREATE FUNCTION public.get_crm_pendencias'), 'CREATE FUNCTION ausente')
    ok(!sql.includes('CREATE OR REPLACE FUNCTION'), 'OR REPLACE presente — proibido nesta etapa')
  })
  t('search_path endurecido: só pg_catalog, relações do CRM qualificadas', () => {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'docs', 'redesign', '11-QUEBRADO-SQL-PROPOSTO.sql'), 'utf8')
    ok(sql.includes("SET search_path TO 'pg_catalog'"), 'search_path pg_catalog ausente')
    ok(!sql.includes("SET search_path TO 'public'"), 'search_path public presente — proibido')
    ok(sql.includes('FROM public.crm_vw_pendencias v'), 'view não qualificada na RPC')
    ok(sql.includes('FROM public.crm_documentos'), 'crm_documentos não qualificada')
    ok(sql.includes('FROM public.crm_tarefas'), 'crm_tarefas não qualificada')
    ok(!sql.includes('CURRENT_DATE do banco (UTC)') && !sql.includes('(UTC)'),
      'alegação de UTC deve sair — timezone é o configurado no banco')
  })
}

console.log('\n=== Título — mesma unidade do contador + clientes do mesmo conjunto ===')
{
  const doc = (cid, tipo) => ({ recorte: 'docs_vencidos', cliente_id: cid, cliente_nome: 'X', item_tipo: tipo })
  t('2 documentos de 1 cliente → "2 documentos · 1 cliente" (o caso da divergência)', () =>
    eq(titulo('docs_vencidos', [doc('a','comp_renda'), doc('a','scr')]),
       'Documentos vencidos — 2 documentos · 1 cliente'))
  t('1 documento → singular', () =>
    eq(titulo('docs_vencidos', [doc('a','scr')]),
       'Documentos vencidos — 1 documento · 1 cliente'))
  t('3 tarefas em 2 clientes', () => {
    const tar = cid => ({ recorte: 'tarefas_vencidas', cliente_id: cid })
    eq(titulo('tarefas_vencidas', [tar('a'), tar('a'), tar('b')]),
       'Tarefas vencidas — 3 tarefas · 2 clientes')
  })
  t('lista vazia → "0 <unidade plural> · 0 clientes"', () =>
    eq(titulo('impedimentos', []), 'Impedimentos ativos — 0 impedimentos · 0 clientes'))
  t('recorte desconhecido → null', () => eq(titulo('nada', []), null))
}

console.log('\n=== Agrupamento por cliente ===')
{
  const itens = [
    { cliente_id: 'a', cliente_nome: 'Ana', item_tipo: 'scr' },
    { cliente_id: 'b', cliente_nome: 'Bia', item_tipo: 'fgts' },
    { cliente_id: 'a', cliente_nome: 'Ana', item_tipo: 'ctps' }
  ]
  const g = agrupar(itens)
  t('agrupa preservando ordem de chegada', () => {
    eq(g.length, 2)
    eq(g[0].cliente_nome, 'Ana')
    eq(g[0].itens.length, 2)
    eq(g[1].cliente_nome, 'Bia')
  })
  t('lista vazia → sem grupos', () => eq(agrupar([]).length, 0))
}

console.log('\n=== Rótulo do item (vocabulário oficial do utils.js) ===')
{
  t('doc sem descrição usa DOC_LABEL', () =>
    eq(labelItem({ recorte: 'docs_vencidos', item_tipo: 'comp_renda' }), 'Comprovante de renda'))
  t('doc com descrição customizada prevalece', () =>
    eq(labelItem({ recorte: 'docs_recusados', item_tipo: 'outro', item_descricao: 'Procuração do cônjuge' }), 'Procuração do cônjuge'))
  t('impedimento usa IMPEDIMENTO_LABEL', () =>
    eq(labelItem({ recorte: 'impedimentos', item_tipo: 'nome_sujo' }), 'Nome sujo (Serasa/SPC)'))
  t('tarefa usa a própria descrição', () =>
    eq(labelItem({ recorte: 'tarefas_vencidas', item_tipo: 'tarefa', item_descricao: 'Cobrar extrato' }), 'Cobrar extrato'))
}

console.log('\n=== Formalização dos parâmetros de URL em clientes.html ===')
{
  const html = fs.readFileSync(path.join(__dirname, '..', 'clientes.html'), 'utf8')
  t('lê ?pendencia= e chama iniciarModoPendencias', () => {
    ok(html.includes("urlParams.get('pendencia')"))
    ok(html.includes('iniciarModoPendencias(pendParam)'))
  })
  t('BUG do funil corrigido: ?status= agora é aplicado ao filtro', () => {
    ok(html.includes("urlParams.get('status')"))
    ok(html.includes("document.getElementById('filtro-status').value = statusParam"))
  })
  t('?prioridade= continua funcionando (não regrediu)', () =>
    ok(html.includes("urlParams.get('prioridade')")))
  t('container pend-view e id card-tabela presentes', () => {
    ok(html.includes('id="pend-view"'))
    ok(html.includes('id="card-tabela"'))
  })
  t('pendencias.js incluído na página', () =>
    ok(html.includes('js/data/pendencias.js')))
}

console.log('\n=== pendenciasCarregar — validação de entrada ===')
;(async () => {
  try {
    await vm.runInContext(`pendenciasCarregar('inexistente')`, ctx)
    console.log('  ❌ recorte desconhecido rejeita antes de chamar o banco\n     não rejeitou')
    falhou++
  } catch (e) {
    if (e.message === 'Recorte desconhecido: inexistente') {
      console.log('  ✅ recorte desconhecido rejeita antes de chamar o banco'); passou++
    } else {
      console.log(`  ❌ recorte desconhecido rejeita antes de chamar o banco\n     erro inesperado: ${e.message}`); falhou++
    }
  }

  console.log(`\n${'='.repeat(50)}`)
  console.log(`RESULTADO: ${passou} passaram, ${falhou} falharam`)
  process.exit(falhou ? 1 : 0)
})()
