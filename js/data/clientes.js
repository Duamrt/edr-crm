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

// Cadastrar família nova + criar checklist documental padrão MCMV + pasta no Drive
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

  // Checklist padrão: 10 docs MCMV + criar pasta no Drive (em paralelo)
  await Promise.all([
    ...MCMV_DOCS_TODOS.map(tipo =>
      sbPost('crm_documentos', { cliente_id: clienteId, tipo, status: 'pendente' })
    ),
    criarPastaDriveDoCliente(clienteId).catch(err => {
      console.warn('Pasta Drive não criada (não bloqueia cadastro):', err.message)
    })
  ])

  return clienteId
}

// Cria pasta no Shared Drive via Edge Function (idempotente — pode chamar de novo sem duplicar)
async function criarPastaDriveDoCliente(clienteId) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/criar-pasta-drive`, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + getToken(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ cliente_id: clienteId })
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || `Drive API ${r.status}`)
  return data  // { folder_id, folder_url, created }
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
window.criarPastaDriveDoCliente = criarPastaDriveDoCliente
