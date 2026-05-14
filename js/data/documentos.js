// EDR CRM — Data layer: documentos
// Centraliza mutações em crm_documentos + auditoria automática em crm_historico

// Atualizar status de um doc (entregue/pendente/recusado/vencido/nao_aplicavel)
// Quando entregue, registra data_entrega; quando sai de entregue, limpa
async function atualizarStatusDoc(docId, clienteId, novoStatus) {
  const payload = {
    status: novoStatus,
    data_entrega: novoStatus === 'entregue' ? new Date().toISOString() : null
  }
  await sbPatch('crm_documentos', docId, payload)
  await sbPost('crm_historico', {
    cliente_id: clienteId,
    descricao: `Documento atualizado para: ${novoStatus}`,
    tipo: 'documento'
  })
}

// Atualizar vencimento de um doc
async function atualizarVencimentoDoc(docId, dataVencimento) {
  await sbPatch('crm_documentos', docId, { data_vencimento: dataVencimento })
}

// Marcar lote de docs como N/A com 1 único evento histórico consolidado
// (motivos = labels amigáveis pra audit trail)
async function aplicarNAEmLote(docs, clienteId) {
  if (!docs || !docs.length) return 0
  await Promise.all(docs.map(d =>
    sbPatch('crm_documentos', d.id, { status: 'nao_aplicavel' })
  ))
  const motivos = docs.map(d => DOC_LABEL[d.tipo] || d.tipo).join(', ')
  await sbPost('crm_historico', {
    cliente_id: clienteId,
    descricao: `🤖 Auditor marcou como N/A: ${motivos}`,
    tipo: 'sistema'
  })
  return docs.length
}

window.atualizarStatusDoc = atualizarStatusDoc
window.atualizarVencimentoDoc = atualizarVencimentoDoc
window.aplicarNAEmLote = aplicarNAEmLote
