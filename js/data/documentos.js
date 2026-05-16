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

// Atualizar vencimento de um doc (string vazia vira null pra Postgres aceitar)
async function atualizarVencimentoDoc(docId, dataVencimento) {
  await sbPatch('crm_documentos', docId, { data_vencimento: dataVencimento || null })
}

// Marcar lote de docs como N/A com 1 único evento histórico consolidado
// Retorna lista detalhada pra possibilitar undo: [{ id, tipo, status_anterior }]
async function aplicarNAEmLote(docs, clienteId) {
  if (!docs || !docs.length) return { qtd: 0, alterados: [] }
  // Captura status anterior antes de alterar (pra undo)
  const alterados = docs.map(d => ({ id: d.id, tipo: d.tipo, status_anterior: d.status || 'pendente' }))
  await Promise.all(docs.map(d =>
    sbPatch('crm_documentos', d.id, { status: 'nao_aplicavel' })
  ))
  const motivos = docs.map(d => DOC_LABEL[d.tipo] || d.tipo).join(', ')
  await sbPost('crm_historico', {
    cliente_id: clienteId,
    descricao: `🤖 Auditor marcou como N/A: ${motivos}`,
    tipo: 'sistema'
  })
  return { qtd: docs.length, alterados }
}

// Reverte N/A em lote — usado pelo Undo Toast
async function desfazerNAEmLote(alterados, clienteId) {
  if (!alterados || !alterados.length) return 0
  await Promise.all(alterados.map(d =>
    sbPatch('crm_documentos', d.id, { status: d.status_anterior })
  ))
  const motivos = alterados.map(d => DOC_LABEL[d.tipo] || d.tipo).join(', ')
  await sbPost('crm_historico', {
    cliente_id: clienteId,
    descricao: `↶ Desfeito (N/A revertido): ${motivos}`,
    tipo: 'sistema'
  })
  return alterados.length
}

window.atualizarStatusDoc = atualizarStatusDoc
window.atualizarVencimentoDoc = atualizarVencimentoDoc
window.aplicarNAEmLote = aplicarNAEmLote
window.desfazerNAEmLote = desfazerNAEmLote
