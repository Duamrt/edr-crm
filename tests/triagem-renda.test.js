// Testes de regressão — Fase 0: "Triagem não pode bloquear atendimento por renda"
// Roda sem framework: node tests/triagem-renda.test.js
//
// Contexto: renda acima do teto MCMV NÃO pode marcar cliente como bloqueado nem
// sugerir "Perdido". É desvio de rota (Faixa 4 ou SBPE), não impedimento.
// Limites: Portaria MCID 333/2026.

const fs = require('fs')
const path = require('path')
const vm = require('vm')

// Carrega utils.js num contexto isolado (o arquivo é script global, sem exports).
// utils.js registra listeners no DOM ao carregar → stub mínimo de document/window.
const utilsSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'utils.js'), 'utf8')
const noop = () => {}
const elStub = new Proxy({}, {
  get: (_, p) => (p === 'style' || p === 'dataset' || p === 'classList')
    ? new Proxy({}, { get: () => noop, set: () => true })
    : (typeof p === 'string' && ['textContent','innerHTML','value','id'].includes(p) ? '' : noop)
})
const ctx = {
  console, setTimeout, clearTimeout, Date, Math, JSON,
  window: { addEventListener: noop, location: { href: '' } },
  document: {
    addEventListener: noop, querySelector: () => null, querySelectorAll: () => [],
    getElementById: () => null, createElement: () => elStub, body: elStub
  },
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop }
}
vm.createContext(ctx)
vm.runInContext(utilsSrc, ctx)

// `function` vaza pro contexto; `const` (MCMV_LIMITES) não — lê via avaliação explícita.
const MCMV_LIMITES = vm.runInContext('MCMV_LIMITES', ctx)
const {
  calcFaixaMcmv, rotaFinanciamento,
  isTriagemBloqueadaSimples, triagemMCMV, podeAvancarEtapa
} = ctx

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
function notOk(v, msg) { if (v) throw new Error(msg || 'esperado falsy') }

console.log('\n=== Limites MCMV (Portaria MCID 333/2026) ===')
t('faixa1_max = 3200', () => eq(MCMV_LIMITES.faixa1_max, 3200))
t('faixa2_max = 5000', () => eq(MCMV_LIMITES.faixa2_max, 5000))
t('faixa3_max = 9600', () => eq(MCMV_LIMITES.faixa3_max, 9600))
t('faixa4_max = 13000', () => eq(MCMV_LIMITES.faixa4_max, 13000))

console.log('\n=== calcFaixaMcmv — fronteiras exatas ===')
t('3200 → Faixa 1 (limite superior)', () => eq(calcFaixaMcmv(3200), 1))
t('3200.01 → Faixa 2', () => eq(calcFaixaMcmv(3200.01), 2))
t('5000 → Faixa 2 (limite superior)', () => eq(calcFaixaMcmv(5000), 2))
t('5000.01 → Faixa 3', () => eq(calcFaixaMcmv(5000.01), 3))
t('9600 → Faixa 3 (limite superior)', () => eq(calcFaixaMcmv(9600), 3))
t('9600.01 → Faixa 4', () => eq(calcFaixaMcmv(9600.01), 4))
t('13000 → Faixa 4 (limite superior)', () => eq(calcFaixaMcmv(13000), 4))
t('13000.01 → null (fora do MCMV)', () => eq(calcFaixaMcmv(13000.01), null))
t('0 → null (sem renda)', () => eq(calcFaixaMcmv(0), null))

console.log('\n=== CASO EDMARCIO — R$ 9.738,65 ===')
t('CRÍTICO: 9738.65 → Faixa 4 (era "Fora do MCMV")', () => eq(calcFaixaMcmv(9738.65), 4))
t('rota = mcmv, não sbpe', () => eq(rotaFinanciamento(9738.65).rota, 'mcmv'))
t('label = "Faixa 4 MCMV"', () => eq(rotaFinanciamento(9738.65).label, 'Faixa 4 MCMV'))
t('sem alerta de desvio', () => notOk(rotaFinanciamento(9738.65).alerta))
t('NÃO bloqueia triagem simples', () =>
  notOk(isTriagemBloqueadaSimples({ renda_total_confirmada: 9738.65 }, [])))
t('triagemMCMV não retorna bloqueado', () => {
  const r = triagemMCMV({ renda_total_confirmada: 9738.65, faixa_mcmv: null }, [], [], [])
  if (r.status === 'bloqueado') throw new Error(`status=bloqueado, bloqueadores=${JSON.stringify(r.grupos.bloqueadores)}`)
  eq(r.faixaCalculada, 4, 'faixaCalculada:')
})
t('CRÍTICO: pode avançar Triagem → Documentação', () => {
  const r = triagemMCMV({ renda_total_confirmada: 9738.65 }, [], [], [])
  const check = podeAvancarEtapa('documentacao', {
    temDocRecusado: false, temImpedimentoAtivo: false,
    triagemBloqueada: r.status === 'bloqueado'
  })
  ok(check.ok, `bloqueou com motivo: ${check.motivo}`)
})

console.log('\n=== Renda ACIMA do MCMV (> 13.000) — alerta, não bloqueio ===')
const RICO = { renda_total_confirmada: 20000 }
t('rota = sbpe', () => eq(rotaFinanciamento(20000).rota, 'sbpe'))
t('alerta = true', () => ok(rotaFinanciamento(20000).alerta))
t('NÃO bloqueia triagem simples', () => notOk(isTriagemBloqueadaSimples(RICO, [])))
t('status = fora_mcmv (não bloqueado)', () => {
  const r = triagemMCMV(RICO, [], [], [])
  eq(r.status, 'fora_mcmv')
  eq(r.statusLabel, 'FORA DO MCMV')
})
t('renda alta entra em desvios, não bloqueadores', () => {
  const r = triagemMCMV(RICO, [], [], [])
  eq(r.grupos.bloqueadores.length, 0, 'bloqueadores deve estar vazio:')
  ok(r.grupos.desvios.length > 0, 'desvios deve ter item')
})
t('CRÍTICO: pode avançar para Documentação mesmo fora do MCMV', () => {
  const r = triagemMCMV(RICO, [], [], [])
  const check = podeAvancarEtapa('documentacao', {
    temDocRecusado: false, temImpedimentoAtivo: false,
    triagemBloqueada: r.status === 'bloqueado'
  })
  ok(check.ok, `bloqueou: ${check.motivo}`)
})
t('nenhuma ação sugere "Perdido"', () => {
  const r = triagemMCMV(RICO, [], [], [])
  const txt = JSON.stringify(r.acoes).toLowerCase()
  notOk(txt.includes('perdido'), `ações mencionam Perdido: ${JSON.stringify(r.acoes)}`)
})

console.log('\n=== NÃO-REGRESSÃO: bloqueios reais continuam bloqueando ===')
t('renda zero AINDA bloqueia', () =>
  ok(isTriagemBloqueadaSimples({ renda_total_confirmada: 0, renda_total_simulada: 0 }, [])))
t('CADMUT AINDA bloqueia (não reclassificado na Fase 0)', () =>
  ok(isTriagemBloqueadaSimples({ renda_total_confirmada: 5000 }, [{ tipo: 'cadmut' }])))
// MUDANÇA DELIBERADA (Fase 0): renda_insuficiente saiu do bloqueio rápido do Kanban
// para alinhar com o triador completo, que sempre a classificou como risco de crédito.
// Antes divergia: Kanban travava o card, ficha dizia "apto com ressalva".
t('renda_insuficiente NÃO bloqueia mais (alinhado ao triador)', () =>
  notOk(isTriagemBloqueadaSimples({ renda_total_confirmada: 5000 }, [{ tipo: 'renda_insuficiente' }])))
t('CADMUT + renda válida = status bloqueado', () => {
  const r = triagemMCMV({ renda_total_confirmada: 5000 }, [], [{ tipo: 'cadmut', ativo: true }], [])
  eq(r.status, 'bloqueado')
})
t('doc recusado AINDA impede avanço para correspondente', () => {
  const check = podeAvancarEtapa('correspondente', {
    temDocRecusado: true, temImpedimentoAtivo: false, triagemBloqueada: false
  })
  notOk(check.ok, 'deveria bloquear com doc recusado')
})

console.log('\n=== PARIDADE Kanban × Ficha — critérios compartilhados (renda + impedimentos) ===')
// ESCOPO DESTE BLOCO: isTriagemBloqueadaSimples() cobre APENAS renda e impedimentos ativos.
// Documento recusado NÃO passa por aqui — o Kanban carrega `_recusadoSet` numa query
// separada (kanban.html:145) e entrega direto a podeAvancarEtapa(). Por isso os casos
// abaixo usam docs=[]: comparam o que as duas funções de fato compartilham.
// A paridade da composição COMPLETA (incluindo docs) é testada no bloco seguinte.
const CASOS_PARIDADE = [
  { nome: 'renda zero',            cli: { renda_total_confirmada: 0, renda_total_simulada: 0 }, imps: [] },
  { nome: 'CADMUT',                cli: { renda_total_confirmada: 5000 }, imps: [{ tipo: 'cadmut', ativo: true }] },
  { nome: 'renda_insuficiente',    cli: { renda_total_confirmada: 5000 }, imps: [{ tipo: 'renda_insuficiente', ativo: true }] },
  { nome: 'score_baixo',           cli: { renda_total_confirmada: 5000 }, imps: [{ tipo: 'score_baixo', ativo: true }] },
  { nome: 'nome_sujo',             cli: { renda_total_confirmada: 5000 }, imps: [{ tipo: 'nome_sujo', ativo: true }] },
  { nome: 'Faixa 4 (EDMARCIO)',    cli: { renda_total_confirmada: 9738.65 }, imps: [] },
  { nome: 'acima do MCMV (SBPE)',  cli: { renda_total_confirmada: 20000 }, imps: [] },
  { nome: 'Faixa 1 limpa',         cli: { renda_total_confirmada: 3000 }, imps: [] },
  { nome: 'CADMUT + renda alta',   cli: { renda_total_confirmada: 20000 }, imps: [{ tipo: 'cadmut', ativo: true }] },
]
CASOS_PARIDADE.forEach(({ nome, cli, imps }) => {
  t(`paridade: ${nome}`, () => {
    const kanban = isTriagemBloqueadaSimples(cli, imps)
    const ficha = triagemMCMV(cli, [], imps, []).elegibilidadeBloqueada
    if (kanban !== ficha) {
      throw new Error(`DIVERGÊNCIA — Kanban bloqueia=${kanban}, Ficha bloqueia=${ficha}`)
    }
  })
})

t('renda_insuficiente é RISCO, não bloqueio (regra decidida na Fase 0)', () => {
  const cli = { renda_total_confirmada: 5000 }
  const imps = [{ tipo: 'renda_insuficiente', ativo: true }]
  notOk(isTriagemBloqueadaSimples(cli, imps), 'Kanban não deve bloquear')
  const r = triagemMCMV(cli, [], imps, [])
  eq(r.status, 'apto_ressalva', 'ficha deve ser apto com ressalva:')
  ok(r.grupos.riscos.some(x => /renda insuficiente/i.test(x.texto)), 'deve estar em riscos')
  eq(r.grupos.bloqueadores.length, 0, 'bloqueadores deve estar vazio:')
})

t('cliente com renda_insuficiente avança para Documentação', () => {
  const cli = { renda_total_confirmada: 5000 }
  const imps = [{ tipo: 'renda_insuficiente', ativo: true }]
  const r = triagemMCMV(cli, [], imps, [])
  const check = podeAvancarEtapa('documentacao', {
    temDocRecusado: false, temImpedimentoAtivo: false,
    triagemBloqueada: r.status === 'bloqueado'
  })
  ok(check.ok, `bloqueou: ${check.motivo}`)
})

console.log('\n=== PARIDADE da COMPOSIÇÃO COMPLETA (inclui documento recusado) ===')
// Cada tela monta a decisão final de forma diferente — o que precisa bater é o VEREDITO:
//
//   Kanban (kanban.html:263-266): _recusadoSet (query própria) + _impSet + _triagemBloqSet
//   Ficha  (ficha.html:848-853):  tudo derivado de triagemMCMV(cliente, docs, imps)
//
// Simula as duas composições e exige o mesmo resultado de podeAvancarEtapa().
function vereditoKanban(cli, imps, docs, etapa) {
  return podeAvancarEtapa(etapa, {
    temDocRecusado: docs.some(d => d.status === 'recusado'),   // _recusadoSet
    temImpedimentoAtivo: imps.some(i => i.ativo),              // _impSet
    triagemBloqueada: isTriagemBloqueadaSimples(cli, imps)     // _triagemBloqSet
  }).ok
}
function vereditoFicha(cli, imps, docs, etapa) {
  const t = triagemMCMV(cli, docs, imps, [])
  return podeAvancarEtapa(etapa, {
    temDocRecusado: docs.some(d => d.status === 'recusado'),
    temImpedimentoAtivo: imps.some(i => i.ativo),
    triagemBloqueada: t.elegibilidadeBloqueada   // espelha ficha.html:851
  }).ok
}

const DOC_OK = [{ tipo: 'rg', status: 'entregue' }]
const DOC_RECUSADO = [{ tipo: 'rg', status: 'recusado' }]
const CASOS_COMPOSICAO = [
  { nome: 'Faixa 4 + docs OK → Documentação',        cli: { renda_total_confirmada: 9738.65 }, imps: [], docs: DOC_OK,       etapa: 'documentacao' },
  { nome: 'Faixa 4 + doc RECUSADO → Documentação',   cli: { renda_total_confirmada: 9738.65 }, imps: [], docs: DOC_RECUSADO, etapa: 'documentacao' },
  { nome: 'Faixa 4 + doc RECUSADO → correspondente', cli: { renda_total_confirmada: 9738.65 }, imps: [], docs: DOC_RECUSADO, etapa: 'correspondente' },
  { nome: 'SBPE + doc RECUSADO → correspondente',    cli: { renda_total_confirmada: 20000 },   imps: [], docs: DOC_RECUSADO, etapa: 'correspondente' },
  { nome: 'SBPE + docs OK → correspondente',         cli: { renda_total_confirmada: 20000 },   imps: [], docs: DOC_OK,       etapa: 'correspondente' },
  { nome: 'renda_insuf + doc RECUSADO → correspond.',cli: { renda_total_confirmada: 5000 },    imps: [{ tipo: 'renda_insuficiente', ativo: true }], docs: DOC_RECUSADO, etapa: 'correspondente' },
  { nome: 'CADMUT + docs OK → Documentação',         cli: { renda_total_confirmada: 5000 },    imps: [{ tipo: 'cadmut', ativo: true }], docs: DOC_OK, etapa: 'documentacao' },
]
CASOS_COMPOSICAO.forEach(({ nome, cli, imps, docs, etapa }) => {
  t(`composição: ${nome}`, () => {
    const k = vereditoKanban(cli, imps, docs, etapa)
    const f = vereditoFicha(cli, imps, docs, etapa)
    if (k !== f) throw new Error(`DIVERGÊNCIA — Kanban permite=${k}, Ficha permite=${f}`)
  })
})

t('doc recusado bloqueia correspondente em AMBAS as telas', () => {
  const cli = { renda_total_confirmada: 9738.65 }
  notOk(vereditoKanban(cli, [], DOC_RECUSADO, 'correspondente'), 'Kanban deveria bloquear')
  notOk(vereditoFicha(cli, [], DOC_RECUSADO, 'correspondente'), 'Ficha deveria bloquear')
})

t('doc recusado NÃO impede Triagem → Documentação (só etapas avançadas)', () => {
  const cli = { renda_total_confirmada: 9738.65 }
  ok(vereditoKanban(cli, [], DOC_RECUSADO, 'documentacao'), 'Kanban deveria permitir')
  ok(vereditoFicha(cli, [], DOC_RECUSADO, 'documentacao'), 'Ficha deveria permitir')
})

console.log('\n=== ficha.html:850 — prova de que NÃO é bug (ternário devolve booleano) ===')
t('padrão `_auditoria ? triagemMCMV(...).status === "bloqueado" : false` é booleano', () => {
  const _auditoria = { qualquer: 'objeto' }   // truthy, como na ficha real
  const _cliente = { renda_total_confirmada: 9738.65 }
  const triagemBloqueada = _auditoria
    ? triagemMCMV(_cliente, [], [], []).elegibilidadeBloqueada
    : false
  eq(typeof triagemBloqueada, 'boolean', 'tipo:')
  eq(triagemBloqueada, false, 'família apta não pode ser marcada bloqueada:')
})
t('mesmo padrão com CADMUT devolve true corretamente', () => {
  const _auditoria = {}
  const triagemBloqueada = _auditoria
    ? triagemMCMV({ renda_total_confirmada: 5000 }, [], [{ tipo: 'cadmut', ativo: true }], []).elegibilidadeBloqueada
    : false
  eq(triagemBloqueada, true)
})

console.log(`\n${'='.repeat(52)}`)
console.log(`  ${passou} passou · ${falhou} falhou`)
console.log('='.repeat(52) + '\n')
process.exit(falhou > 0 ? 1 : 0)
