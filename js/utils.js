// EDR CRM — Utilitários
const CRM_VERSION = '1778685874'

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

// Faixa MCMV a partir da renda (tabela MCMV 2024-2025 urbano)
function calcFaixaMcmv(renda) {
  if (!renda) return null
  if (renda <= 2640) return 1
  if (renda <= 4400) return 2
  if (renda <= 8000) return 3
  return null
}

// Subsídio estimado (ESTIMATIVA — valor real vem da Caixa pela região)
function calcSubsidioEstimado(faixa, renda) {
  if (!faixa || !renda) return 0
  if (faixa === 1) return 55000
  if (faixa === 2) {
    if (renda <= 3200) return 35000
    if (renda <= 3800) return 25000
    return 15000
  }
  return 0 // Faixa 3 não tem subsídio direto
}

// === AGENTE 1: TRIADOR DE ELEGIBILIDADE MCMV (determinístico) ===
// Retorna análise completa: status, faixa, subsídio, checks, ações sugeridas
function triagemMCMV(cliente, docs = [], impedimentos = []) {
  const checks = []
  const acoes = []
  let pontosNegativos = 0
  let pontosCriticos = 0

  // Renda
  const rendaConfirmada = Number(cliente.renda_total_confirmada) || 0
  const rendaSimulada = Number(cliente.renda_total_simulada) || 0
  const rendaUsada = rendaConfirmada || rendaSimulada
  const faixaCalculada = calcFaixaMcmv(rendaUsada)
  const subsidio = calcSubsidioEstimado(faixaCalculada, rendaUsada)

  if (rendaConfirmada > 0) {
    checks.push({ icone: '✅', texto: `Renda confirmada: ${fmtMoeda(rendaConfirmada)}` })
  } else if (rendaSimulada > 0) {
    checks.push({ icone: '⚠️', texto: `Apenas renda simulada (${fmtMoeda(rendaSimulada)}) — falta confirmar` })
    acoes.push('Solicitar comprovante de renda para confirmar valor')
    pontosNegativos++
  } else {
    checks.push({ icone: '❌', texto: 'Nenhuma renda informada' })
    acoes.push('Cadastrar renda (simulada ou confirmada)')
    pontosCriticos++
  }

  // Faixa MCMV
  if (faixaCalculada) {
    checks.push({ icone: '✅', texto: `Renda enquadra na Faixa ${faixaCalculada} MCMV` })
    if (cliente.faixa_mcmv && cliente.faixa_mcmv !== faixaCalculada) {
      checks.push({ icone: '⚠️', texto: `Cadastrada como Faixa ${cliente.faixa_mcmv}, mas renda indica Faixa ${faixaCalculada}` })
      acoes.push(`Ajustar faixa cadastrada para Faixa ${faixaCalculada}`)
      pontosNegativos++
    }
  } else if (rendaUsada > 0) {
    checks.push({ icone: '❌', texto: `Renda ${fmtMoeda(rendaUsada)} acima do teto MCMV (R$ 8.000)` })
    acoes.push('Renda fora do programa — encaminhar para financiamento tradicional')
    pontosCriticos++
  }

  // Lote
  if (cliente.lote_id) {
    checks.push({ icone: '✅', texto: 'Lote vinculado' })
  } else {
    checks.push({ icone: '⚠️', texto: 'Sem lote vinculado' })
    acoes.push('Vincular lote disponível')
    pontosNegativos++
  }

  // Impedimentos (críticos vs recuperáveis)
  const impAtivos = impedimentos.filter(i => i.ativo)
  if (impAtivos.length === 0) {
    checks.push({ icone: '✅', texto: 'Sem impedimentos ativos' })
  } else {
    const cadmut = impAtivos.find(i => i.tipo === 'cadmut')
    const rendaInsuf = impAtivos.find(i => i.tipo === 'renda_insuficiente')

    if (cadmut) {
      checks.push({ icone: '🚫', texto: 'CADMUT — já foi proprietário (bloqueio definitivo)' })
      acoes.push('CADMUT é bloqueio definitivo do MCMV — descartar ou encaminhar para financiamento tradicional')
      pontosCriticos += 2
    }
    if (rendaInsuf) {
      checks.push({ icone: '🚫', texto: 'Renda insuficiente para a faixa' })
      acoes.push('Renda insuficiente — reavaliar composição familiar ou aguardar melhora')
      pontosCriticos++
    }

    impAtivos.filter(i => !['cadmut','renda_insuficiente'].includes(i.tipo)).forEach(i => {
      const label = IMPEDIMENTO_LABEL[i.tipo] || i.tipo
      checks.push({ icone: '❌', texto: `Impedimento: ${label}` })
      pontosNegativos++
      if (i.tipo === 'score_baixo') acoes.push('Score baixo — aguardar 3-6 meses ou tentar correspondente alternativo')
      else if (i.tipo === 'nome_sujo') acoes.push('Nome sujo — orientar negociação e quitação das pendências')
      else if (i.tipo === 'fgts_bloqueado') acoes.push('FGTS bloqueado — verificar motivo no app FGTS / Caixa')
    })
  }

  // Documentos
  const docsRecusados = docs.filter(d => d.status === 'recusado')
  const docsPendentes = docs.filter(d => d.status === 'pendente')
  const docsVencidos = docs.filter(d => d.status === 'vencido')

  if (docsRecusados.length) {
    checks.push({ icone: '🚫', texto: `${docsRecusados.length} documento(s) recusado(s)` })
    acoes.push(`Resolver docs recusados: ${docsRecusados.map(d => DOC_LABEL[d.tipo] || d.tipo).join(', ')}`)
    pontosCriticos++
  }
  if (docsVencidos.length) {
    checks.push({ icone: '❌', texto: `${docsVencidos.length} documento(s) vencido(s)` })
    acoes.push(`Renovar docs vencidos: ${docsVencidos.map(d => DOC_LABEL[d.tipo] || d.tipo).join(', ')}`)
    pontosNegativos++
  }
  if (docsPendentes.length) {
    checks.push({ icone: '⚠️', texto: `${docsPendentes.length} documento(s) pendente(s)` })
    acoes.push(`Cobrar docs pendentes: ${docsPendentes.map(d => DOC_LABEL[d.tipo] || d.tipo).slice(0,3).join(', ')}${docsPendentes.length > 3 ? '...' : ''}`)
    pontosNegativos++
  }
  if (!docsPendentes.length && !docsRecusados.length && !docsVencidos.length && docs.length) {
    checks.push({ icone: '✅', texto: 'Todos os documentos OK' })
  }

  // Cliente parado
  const dias = diasDesde(cliente.ultima_atualizacao)
  if (dias !== null && dias >= 7) {
    checks.push({ icone: '⚠️', texto: `${dias} dias sem atualização` })
    acoes.push(`Família parada há ${dias} dias — ligar / mandar WhatsApp`)
    pontosNegativos++
  }

  // === SCORE FINAL ===
  let status, statusLabel, statusCor
  if (pontosCriticos > 0) {
    status = 'bloqueado'
    statusLabel = 'BLOQUEADO'
    statusCor = 'vermelho'
  } else if (pontosNegativos >= 2) {
    status = 'apto_ressalva'
    statusLabel = 'APTO COM RESSALVA'
    statusCor = 'amarelo'
  } else {
    status = 'apto'
    statusLabel = 'APTO'
    statusCor = 'verde'
  }

  return {
    status,
    statusLabel,
    statusCor,
    faixaCalculada,
    subsidio,
    checks,
    acoes,
    pontosNegativos,
    pontosCriticos
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
