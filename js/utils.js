// EDR CRM — Utilitários
const CRM_VERSION = '1778689016'

document.addEventListener('DOMContentLoaded', () => {
  const d = new Date(parseInt(CRM_VERSION) * 1000)
  const v = `v${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`
  const el = document.getElementById('crm-versao-footer')
  if (el) el.textContent = v
  console.log(`%c EDR CRM ${v} `, 'background:#2d6a4f;color:#fff;font-weight:bold;padding:4px 8px;border-radius:4px;')
})

// Formatar CPF: 000.000.000-00
function fmtCpf(v) {
  if (!v) return ''
  return v.replace(/\D/g,'').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4')
}

// Formatar telefone
function fmtTel(v) {
  if (!v) return ''
  const d = v.replace(/\D/g,'')
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/,'($1) $2-$3')
  return d.replace(/(\d{2})(\d{4})(\d{4})/,'($1) $2-$3')
}

// Formatar moeda
function fmtMoeda(v) {
  if (v == null) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Formatar data: dd/mm/aaaa
function fmtData(v) {
  if (!v) return '—'
  const d = v.includes('T') ? new Date(v) : new Date(v + 'T12:00:00')
  return d.toLocaleDateString('pt-BR')
}

// Diferença em dias a partir de hoje
function diasDesde(v) {
  if (!v) return null
  const d = new Date(v)
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

// Dias até a data (positivo = ainda tem tempo)
function diasAte(v) {
  if (!v) return null
  const d = new Date(v + 'T12:00:00')
  return Math.floor((d.getTime() - Date.now()) / 86400000)
}

// SLA badge visual para o kanban
function slaBadge(ultimaAtualizacao) {
  const dias = diasDesde(ultimaAtualizacao)
  if (dias === null) return ''
  if (dias >= 7) return '<span class="badge badge-red">⏱ ' + dias + 'd parado</span>'
  if (dias >= 3) return '<span class="badge badge-yellow">⏱ ' + dias + 'd</span>'
  return ''
}

// Badge de vencimento de documento
function vencimentoBadge(dataVencimento) {
  const dias = diasAte(dataVencimento)
  if (dias === null) return ''
  if (dias < 0) return '<span class="badge badge-red">Vencido</span>'
  if (dias <= 15) return '<span class="badge badge-red">' + dias + 'd p/ vencer</span>'
  if (dias <= 30) return '<span class="badge badge-yellow">' + dias + 'd</span>'
  return ''
}

// Link WhatsApp
function linkWhatsapp(telefone, mensagem) {
  const tel = telefone.replace(/\D/g,'')
  return `https://wa.me/55${tel}?text=${encodeURIComponent(mensagem)}`
}

// Template WhatsApp: cobrança de documento
function wppCobrarDoc(nomeCliente, doc) {
  return `Olá ${nomeCliente}! 👋 Sou Elyda da EDR Engenharia. Precisamos do(a) ${doc} para dar continuidade ao seu processo MCMV. Pode enviar pelo WhatsApp ou passar aqui na nossa sede. Qualquer dúvida, estou à disposição!`
}

// Template WhatsApp: atualização de status
function wppAtualizacao(nomeCliente, status) {
  return `Olá ${nomeCliente}! Temos uma atualização do seu processo MCMV: ${status}. Qualquer dúvida, fale comigo! 😊`
}

// Tetos MCMV (fácil de atualizar quando vier decreto novo)
const MCMV_LIMITES = { faixa1_max: 2640, faixa2_max: 4400, faixa3_max: 8000 }

// Limiar de dias sem interação real antes de virar pendência operacional
const MCMV_DIAS_PARADO = 7

// Docs essenciais por etapa do kanban — travam avanço
const MCMV_DOCS_ESSENCIAIS_CORRESPONDENTE = ['rg_cpf_titular','comp_residencia','comp_renda','cadunico']
const MCMV_DOCS_TODOS = ['rg_cpf_titular','rg_cpf_conjuge','certidao','comp_residencia','comp_renda','ctps','fgts','ir','certidao_negativa','cadunico']
const MCMV_DOCS_POR_ETAPA = {
  triagem: [],
  documentacao: [],
  correspondente: MCMV_DOCS_ESSENCIAIS_CORRESPONDENTE,
  aprovado: MCMV_DOCS_TODOS,
  prefeitura: MCMV_DOCS_TODOS,
  assinatura: MCMV_DOCS_TODOS,
  concluido: [],
  perdido: []
}

// Faixa MCMV a partir da renda (tabela MCMV 2024-2025 urbano)
function calcFaixaMcmv(renda) {
  if (!renda) return null
  if (renda <= MCMV_LIMITES.faixa1_max) return 1
  if (renda <= MCMV_LIMITES.faixa2_max) return 2
  if (renda <= MCMV_LIMITES.faixa3_max) return 3
  return null
}

// Dias desde a última interação REAL (não apenas UPDATE no registro)
// Considera: histórico de tipo 'acao' ou 'comunicacao' + mudanças de status_kanban
function diasSemInteracaoReal(cliente, historico = []) {
  const eventosReais = historico.filter(h => {
    if (['acao', 'comunicacao'].includes(h.tipo)) return true
    if (h.tipo === 'sistema' && /Status alterado para|Movido para/i.test(h.descricao || '')) return true
    return false
  })
  if (eventosReais.length) {
    const datas = eventosReais.map(h => new Date(h.created_at).getTime())
    return Math.floor((Date.now() - Math.max(...datas)) / 86400000)
  }
  // Fallback: data do primeiro contato (cliente novo)
  if (cliente.data_primeiro_contato) {
    return Math.floor((Date.now() - new Date(cliente.data_primeiro_contato + 'T12:00:00').getTime()) / 86400000)
  }
  return null
}

// === AGENTE 1: TRIADOR DE ELEGIBILIDADE MCMV (determinístico) ===
// Retorna análise em 3 categorias de gravidade:
//   - bloqueadores: impedem definitivamente (CADMUT, renda fora, doc recusado)
//   - riscos: afetam aprovação bancária (score, nome sujo, FGTS bloqueado)
//   - operacionais: fricção resolvível (doc pendente, sem lote, parado)
function triagemMCMV(cliente, docs = [], impedimentos = [], historico = []) {
  const grupos = { bloqueadores: [], riscos: [], operacionais: [] }
  const positivos = []
  const acoes = []

  // Renda
  const rendaConfirmada = Number(cliente.renda_total_confirmada) || 0
  const rendaSimulada = Number(cliente.renda_total_simulada) || 0
  const rendaUsada = rendaConfirmada || rendaSimulada
  const faixaCalculada = calcFaixaMcmv(rendaUsada)

  if (rendaConfirmada > 0) {
    positivos.push({ icone: '✅', texto: `Renda confirmada: ${fmtMoeda(rendaConfirmada)}` })
  } else if (rendaSimulada > 0) {
    grupos.operacionais.push({ icone: '⚠️', texto: `Apenas renda simulada (${fmtMoeda(rendaSimulada)}) — falta confirmar` })
    acoes.push('Solicitar comprovante de renda para confirmar valor')
  } else {
    grupos.bloqueadores.push({ icone: '🚫', texto: 'Nenhuma renda informada' })
    acoes.push('Cadastrar renda (simulada ou confirmada)')
  }

  // Faixa MCMV
  if (faixaCalculada) {
    positivos.push({ icone: '✅', texto: `Renda enquadra na Faixa ${faixaCalculada} MCMV` })
    if (cliente.faixa_mcmv && cliente.faixa_mcmv !== faixaCalculada) {
      grupos.operacionais.push({ icone: '⚠️', texto: `Cadastrada como Faixa ${cliente.faixa_mcmv}, mas renda indica Faixa ${faixaCalculada}` })
      acoes.push(`Ajustar faixa cadastrada para Faixa ${faixaCalculada}`)
    }
  } else if (rendaUsada > 0) {
    grupos.bloqueadores.push({ icone: '🚫', texto: `Renda ${fmtMoeda(rendaUsada)} acima do teto MCMV (${fmtMoeda(MCMV_LIMITES.faixa3_max)})` })
    acoes.push('Renda fora do programa — encaminhar para financiamento tradicional')
  }

  // Lote
  if (cliente.lote_id) {
    positivos.push({ icone: '✅', texto: 'Lote vinculado' })
  } else {
    grupos.operacionais.push({ icone: '⚠️', texto: 'Sem lote vinculado' })
    acoes.push('Vincular lote disponível')
  }

  // Impedimentos — classificados por gravidade
  const impAtivos = impedimentos.filter(i => i.ativo)
  impAtivos.forEach(i => {
    const label = IMPEDIMENTO_LABEL[i.tipo] || i.tipo
    if (i.tipo === 'cadmut') {
      grupos.bloqueadores.push({ icone: '🚫', texto: 'CADMUT — já foi proprietário (bloqueio definitivo)' })
      acoes.push('CADMUT é bloqueio definitivo do MCMV — descartar ou encaminhar para financiamento tradicional')
    } else if (i.tipo === 'renda_insuficiente') {
      grupos.riscos.push({ icone: '❌', texto: 'Renda insuficiente para a faixa' })
      acoes.push('Renda insuficiente — reavaliar composição familiar ou aguardar melhora')
    } else if (i.tipo === 'score_baixo') {
      grupos.riscos.push({ icone: '❌', texto: `Risco: ${label}` })
      acoes.push('Score baixo — aguardar 3-6 meses ou tentar correspondente alternativo')
    } else if (i.tipo === 'nome_sujo') {
      grupos.riscos.push({ icone: '❌', texto: `Risco: ${label}` })
      acoes.push('Nome sujo — orientar negociação e quitação das pendências')
    } else if (i.tipo === 'fgts_bloqueado') {
      grupos.riscos.push({ icone: '❌', texto: `Risco: ${label}` })
      acoes.push('FGTS bloqueado — verificar motivo no app FGTS / Caixa')
    } else {
      grupos.riscos.push({ icone: '❌', texto: `Impedimento: ${label}` })
    }
  })
  if (!impAtivos.length) {
    positivos.push({ icone: '✅', texto: 'Sem impedimentos ativos' })
  }

  // Documentos
  const docsRecusados = docs.filter(d => d.status === 'recusado')
  const docsPendentes = docs.filter(d => d.status === 'pendente')
  const docsVencidos = docs.filter(d => d.status === 'vencido')

  if (docsRecusados.length) {
    grupos.bloqueadores.push({ icone: '🚫', texto: `${docsRecusados.length} documento(s) recusado(s)` })
    acoes.push(`Resolver docs recusados: ${docsRecusados.map(d => DOC_LABEL[d.tipo] || d.tipo).join(', ')}`)
  }
  if (docsVencidos.length) {
    grupos.operacionais.push({ icone: '⚠️', texto: `${docsVencidos.length} documento(s) vencido(s)` })
    acoes.push(`Renovar docs vencidos: ${docsVencidos.map(d => DOC_LABEL[d.tipo] || d.tipo).join(', ')}`)
  }
  if (docsPendentes.length) {
    grupos.operacionais.push({ icone: '⚠️', texto: `${docsPendentes.length} documento(s) pendente(s)` })
    acoes.push(`Cobrar docs pendentes: ${docsPendentes.map(d => DOC_LABEL[d.tipo] || d.tipo).slice(0,3).join(', ')}${docsPendentes.length > 3 ? '...' : ''}`)
  }
  if (!docsPendentes.length && !docsRecusados.length && !docsVencidos.length && docs.length) {
    positivos.push({ icone: '✅', texto: 'Todos os documentos OK' })
  }

  // Dias sem interação real (não conta UPDATE de telefone como interação)
  const dias = diasSemInteracaoReal(cliente, historico)
  if (dias !== null && dias >= MCMV_DIAS_PARADO) {
    grupos.operacionais.push({ icone: '⚠️', texto: `${dias} dias sem interação real` })
    acoes.push(`Família parada há ${dias} dias — ligar / mandar WhatsApp`)
  }

  // === STATUS FINAL ===
  let status, statusLabel, statusCor, motivoRessalva = null
  if (grupos.bloqueadores.length > 0) {
    status = 'bloqueado'
    statusLabel = 'BLOQUEADO'
    statusCor = 'vermelho'
  } else if (grupos.riscos.length > 0) {
    status = 'apto_ressalva'
    statusLabel = 'APTO COM RESSALVA'
    statusCor = 'amarelo'
    motivoRessalva = 'risco de crédito'
  } else if (grupos.operacionais.length >= 2) {
    status = 'apto_ressalva'
    statusLabel = 'APTO COM RESSALVA'
    statusCor = 'amarelo'
    motivoRessalva = 'pendência operacional'
  } else {
    status = 'apto'
    statusLabel = 'APTO'
    statusCor = 'verde'
  }

  return {
    status,
    statusLabel,
    statusCor,
    motivoRessalva,
    faixaCalculada,
    grupos,
    positivos,
    acoes
  }
}

// === AGENTE 2: AUDITOR DE DOCUMENTOS MCMV (determinístico) ===

// Tiers fixos de criticidade — ordena cobrança dentro do grupo Operacional
// (independente da etapa: o que pesa mais no funil bancário cobra primeiro)
const MCMV_DOC_TIER = {
  // Tier 1 — Crítica (rodar simulação básica)
  rg_cpf_titular: 1,
  comp_renda: 1,
  certidao: 1,
  // Tier 2 — Média (validar capacidade de compra)
  fgts: 2,
  ctps: 2,
  ir: 2,
  // Tier 3 — Baixa (juntar pro contrato final)
  comp_residencia: 3,
  cadunico: 3,
  certidao_negativa: 3,
  rg_cpf_conjuge: 3
}

// Detecta docs irrelevantes ao perfil (devem virar nao_aplicavel)
function detectarNaoAplicaveis(cliente, membros = []) {
  const naoAplicaveis = []
  const temConjuge = membros.some(m => (m.parentesco || '') === 'Cônjuge')
  if (!temConjuge) naoAplicaveis.push('rg_cpf_conjuge')
  if (cliente.fgts === false || cliente.fgts === null) naoAplicaveis.push('fgts')
  // CTPS só é exigida pra renda formal (CLT). Informal/autônomo não tem CTPS ativa.
  if (cliente.tipo_renda && cliente.tipo_renda !== 'formal' && cliente.tipo_renda !== 'misto') {
    naoAplicaveis.push('ctps')
  }
  return naoAplicaveis
}

// Cruza dados cadastrais com status dos docs em busca de inconsistências
function detectarInconsistencias(cliente, docs, membros = []) {
  const inc = []
  const docPorTipo = {}
  docs.forEach(d => { docPorTipo[d.tipo] = d })

  if (cliente.fgts === true && docPorTipo.fgts && docPorTipo.fgts.status === 'pendente') {
    inc.push({ tipo: 'fgts', msg: 'Cliente tem FGTS, mas extrato segue pendente' })
  }
  if (cliente.tipo_renda === 'formal' && docPorTipo.ctps && docPorTipo.ctps.status === 'pendente') {
    inc.push({ tipo: 'ctps', msg: 'Renda formal (CLT), mas CTPS pendente' })
  }
  if (docPorTipo.comp_renda && docPorTipo.comp_renda.status === 'entregue' && !cliente.renda_total_confirmada) {
    inc.push({ tipo: 'comp_renda', msg: 'Comprovante de renda entregue, mas renda confirmada não foi preenchida no cadastro' })
  }
  const temConjuge = membros.some(m => (m.parentesco || '') === 'Cônjuge')
  if (temConjuge && docPorTipo.rg_cpf_conjuge && docPorTipo.rg_cpf_conjuge.status === 'pendente') {
    inc.push({ tipo: 'rg_cpf_conjuge', msg: 'Cônjuge na composição, mas RG/CPF do cônjuge pendente' })
  }
  return inc
}

function auditarDocumentos(cliente, docs = [], membros = []) {
  const entregues = docs.filter(d => d.status === 'entregue')
  const pendentes = docs.filter(d => d.status === 'pendente')
  const recusados = docs.filter(d => d.status === 'recusado')
  const naoAplicaveis = docs.filter(d => d.status === 'nao_aplicavel')
  const relevantesTotal = docs.length - naoAplicaveis.length  // só conta o que importa

  // Completude honesta: % dos docs RELEVANTES que estão entregues
  // (N/A sai do denominador — pasta solteira sem FGTS chega a 100% real)
  const completude = relevantesTotal > 0
    ? Math.round((entregues.length / relevantesTotal) * 100)
    : 100

  // Sugestões de N/A — docs ainda 'pendente' que deveriam virar nao_aplicavel
  const sugestoesNA = detectarNaoAplicaveis(cliente, membros)
    .map(tipo => docs.find(d => d.tipo === tipo && d.status === 'pendente'))
    .filter(Boolean)

  const inconsistencias = detectarInconsistencias(cliente, docs, membros)

  // Etapa atual e próxima — pra calcular docs que travam avanço
  const ETAPAS_FLUXO = ['triagem','documentacao','correspondente','aprovado','prefeitura','assinatura','concluido']
  const idxAtual = ETAPAS_FLUXO.indexOf(cliente.status_kanban)
  const proximaEtapa = idxAtual >= 0 ? ETAPAS_FLUXO[idxAtual + 1] : null
  const essenciaisProxima = (proximaEtapa && MCMV_DOCS_POR_ETAPA[proximaEtapa]) || []

  const docsTravando = pendentes.filter(d => essenciaisProxima.includes(d.tipo))

  // Vencendo em <15 dias (inclui pendentes com vencimento e entregues com renovação próxima)
  const vencendo = docs.filter(d => {
    if (!d.data_vencimento) return false
    if (!['pendente','entregue'].includes(d.status)) return false
    const dias = diasAte(d.data_vencimento)
    return dias !== null && dias >= 0 && dias <= 15
  })

  const grupos = { bloqueadores: [], riscos: [], operacionais: [] }
  const acoes = []
  const tiposListados = new Set()

  // Bloqueadores: recusados (sempre) + pendentes que travam próxima etapa
  recusados.forEach(d => {
    if (tiposListados.has(d.tipo)) return
    tiposListados.add(d.tipo)
    grupos.bloqueadores.push({ icone: '🚫', texto: `${DOC_LABEL[d.tipo] || d.tipo} (recusado)`, tipo: d.tipo })
    acoes.push(`Resolver doc recusado: ${DOC_LABEL[d.tipo] || d.tipo}`)
  })
  docsTravando.forEach(d => {
    if (tiposListados.has(d.tipo)) return
    tiposListados.add(d.tipo)
    const proxLabel = KANBAN_LABEL[proximaEtapa] || proximaEtapa
    grupos.bloqueadores.push({ icone: '🛑', texto: `${DOC_LABEL[d.tipo] || d.tipo} (bloqueia ${proxLabel})`, tipo: d.tipo })
  })

  // Riscos: vencendo + inconsistências
  vencendo.forEach(d => {
    if (tiposListados.has(d.tipo)) return
    tiposListados.add(d.tipo)
    const dias = diasAte(d.data_vencimento)
    grupos.riscos.push({ icone: '⚠️', texto: `${DOC_LABEL[d.tipo] || d.tipo} vence em ${dias}d`, tipo: d.tipo })
  })
  inconsistencias.forEach(i => {
    if (tiposListados.has(i.tipo)) return
    tiposListados.add(i.tipo)
    grupos.riscos.push({ icone: '⚠️', texto: i.msg, tipo: i.tipo })
    acoes.push(i.msg)
  })

  // Operacionais: demais pendentes (exclui sugestões de N/A — vão pro bloco N/A)
  // Ordenados por tier fixo de criticidade (Crítica → Média → Baixa)
  const tiposNaSugeridos = new Set(sugestoesNA.map(d => d.tipo))
  const TIER_LABEL = { 1: 'Crítica', 2: 'Média', 3: 'Baixa' }
  const TIER_ICONE = { 1: '🔴', 2: '🟡', 3: '⚪' }
  pendentes
    .filter(d => !tiposListados.has(d.tipo) && !tiposNaSugeridos.has(d.tipo))
    .sort((a, b) => (MCMV_DOC_TIER[a.tipo] || 99) - (MCMV_DOC_TIER[b.tipo] || 99))
    .forEach(d => {
      tiposListados.add(d.tipo)
      const tier = MCMV_DOC_TIER[d.tipo] || 3
      const sufixo = TIER_LABEL[tier] ? ` · ${TIER_LABEL[tier]}` : ''
      grupos.operacionais.push({
        icone: TIER_ICONE[tier] || '⚪',
        texto: `${DOC_LABEL[d.tipo] || d.tipo}${sufixo}`,
        tipo: d.tipo,
        tier
      })
    })

  if (grupos.bloqueadores.length || grupos.riscos.length) {
    acoes.unshift('Cobrar via WhatsApp os docs urgentes desta família')
  }

  // Pasta pronta = 100% dos docs relevantes entregues
  const pastaPronta = completude >= 100 && relevantesTotal > 0

  return {
    completude,
    total: docs.length,
    relevantesTotal,
    entregues: entregues.length,
    pendentes: pendentes.length,
    proximaEtapa,
    pastaPronta,
    grupos,
    sugestoesNA,
    naoAplicaveis,
    acoes
  }
}

// Labels amigáveis
const KANBAN_LABEL = {
  triagem: 'Triagem',
  documentacao: 'Documentação',
  correspondente: 'Com Correspondente',
  aprovado: 'Aprovado/Ajustes',
  prefeitura: 'Prefeitura/Projetos',
  assinatura: 'Assinatura',
  concluido: 'Concluído',
  perdido: 'Perdido'
}

const DOC_LABEL = {
  rg_cpf_titular: 'RG e CPF (titular)',
  rg_cpf_conjuge: 'RG e CPF (cônjuge)',
  certidao: 'Certidão de nascimento/casamento',
  comp_residencia: 'Comprovante de residência',
  comp_renda: 'Comprovante de renda',
  ctps: 'Carteira de trabalho',
  fgts: 'Extrato do FGTS',
  ir: 'Declaração de IR ou isento',
  certidao_negativa: 'Certidão negativa de débitos',
  cadunico: 'CadÚnico atualizado'
}

const IMPEDIMENTO_LABEL = {
  score_baixo: 'Score baixo',
  nome_sujo: 'Nome sujo (Serasa/SPC)',
  cadmut: 'CADMUT (já foi proprietário)',
  fgts_bloqueado: 'FGTS bloqueado',
  renda_insuficiente: 'Renda insuficiente',
  outro: 'Outro'
}

const TIPO_RENDA_LABEL = {
  formal: 'Formal (CLT)',
  informal: 'Informal',
  autonomo: 'Autônomo',
  misto: 'Misto'
}

// Máscara CPF ao digitar
function maskCpf(input) {
  input.addEventListener('input', function() {
    let v = this.value.replace(/\D/g,'').substring(0,11)
    v = v.replace(/(\d{3})(\d)/,'$1.$2')
    v = v.replace(/(\d{3})(\d)/,'$1.$2')
    v = v.replace(/(\d{3})(\d{1,2})$/,'$1-$2')
    this.value = v
  })
}

// Máscara telefone ao digitar
function maskTel(input) {
  input.addEventListener('input', function() {
    let v = this.value.replace(/\D/g,'').substring(0,11)
    if (v.length <= 10) v = v.replace(/(\d{2})(\d{4})(\d{0,4})/,'($1) $2-$3')
    else v = v.replace(/(\d{2})(\d{5})(\d{0,4})/,'($1) $2-$3')
    this.value = v
  })
}

// ESC fecha o modal mais recente aberto na página
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return

  // Modal IA (ficha.html)
  const modalAI = document.getElementById('modal-ai')
  if (modalAI && !modalAI.classList.contains('hidden')) {
    modalAI.classList.add('hidden')
    return
  }

  // Modal edição de lote (lotes.html) — fecha primeiro, depois o de detalhe
  const modalEdit = document.getElementById('modal-editar-lote')
  if (modalEdit && !modalEdit.classList.contains('hidden')) {
    if (typeof fecharEdicao === 'function') fecharEdicao()
    else modalEdit.classList.add('hidden')
    return
  }

  // Modal detalhe de lote (lotes.html)
  const modalLote = document.getElementById('modal-lote')
  if (modalLote && !modalLote.classList.contains('hidden')) {
    if (typeof fecharModal === 'function') fecharModal()
    else modalLote.classList.add('hidden')
    return
  }

  // Qualquer outro .modal-overlay aberto (futuras páginas)
  const overlay = document.querySelector('.modal-overlay:not(.hidden)')
  if (overlay) overlay.classList.add('hidden')
})

// Toast simples
function toast(msg, tipo = 'info') {
  const el = document.createElement('div')
  el.className = `toast toast-${tipo}`
  el.textContent = msg
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3500)
}

// Loading overlay
function showLoading() { document.getElementById('loading')?.classList.remove('hidden') }
function hideLoading() { document.getElementById('loading')?.classList.add('hidden') }

// Confirmar ação
function confirmar(msg) { return window.confirm(msg) }
