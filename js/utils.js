// EDR CRM — Utilitários
const CRM_VERSION = '1778663486'

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
  const d = new Date(v + 'T12:00:00')
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

// Faixa MCMV a partir da renda
function calcFaixaMcmv(renda) {
  if (!renda) return null
  if (renda <= 2640) return 1
  if (renda <= 4400) return 2
  if (renda <= 8000) return 3
  return null
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
