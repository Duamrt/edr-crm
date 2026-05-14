// EDR CRM — Data layer: clientes
// Centraliza mutações em crm_clientes + auditoria automática em crm_historico
// Toda função aqui é "patch/post + histórico" atômico do ponto de vista da UI

// Mover cliente entre colunas do kanban (com auditoria automática)
async function moverStatusKanban(clienteId, novoStatus) {
  await sbPatch('crm_clientes', clienteId, { status_kanban: novoStatus })
  await sbPost('crm_historico', {
    cliente_id: clienteId,
    descricao: `Status alterado para: ${KANBAN_LABEL[novoStatus] || novoStatus}`,
    tipo: 'sistema'
  })
}

// Cadastrar família nova + criar checklist documental padrão MCMV
// Reusa MCMV_DOCS_TODOS de utils.js (evita lista duplicada hardcoded)
async function criarFamiliaComChecklist(dados) {
  const rows = await sbPost('crm_clientes', dados)
  const clienteId = Array.isArray(rows) ? rows[0]?.id : rows?.id
  if (!clienteId) throw new Error('Família criada mas sem ID retornado')

  await sbPost('crm_historico', {
    cliente_id: clienteId,
    descricao: 'Família cadastrada no sistema',
    tipo: 'sistema'
  })

  // Checklist padrão: 10 docs MCMV
  await Promise.all(MCMV_DOCS_TODOS.map(tipo =>
    sbPost('crm_documentos', { cliente_id: clienteId, tipo, status: 'pendente' })
  ))

  return clienteId
}

// Atualizar dados do cliente (PATCH + histórico)
async function atualizarCliente(clienteId, dados) {
  await sbPatch('crm_clientes', clienteId, dados)
  await sbPost('crm_historico', {
    cliente_id: clienteId,
    descricao: 'Cadastro atualizado',
    tipo: 'acao'
  })
}

// Expor globalmente (compatível com scripts inline sem ES modules)
window.moverStatusKanban = moverStatusKanban
window.criarFamiliaComChecklist = criarFamiliaComChecklist
window.atualizarCliente = atualizarCliente
