// EDR CRM — Pendências: atalhos do card "O que tá quebrado" (dashboard → destino filtrado)
// FONTE ÚNICA (Opção A, decisão Duam 2026-08-04): os critérios de pendência moram no BANCO
// (view crm_vw_pendencias + RPC get_crm_pendencias). Este módulo NÃO reimplementa critério —
// só nomeia recortes, busca da RPC e monta título/lista na MESMA unidade do contador.
// Render 100% via createElement/textContent — nenhum dado do banco passa por innerHTML.
// Ver docs/redesign/11-QUEBRADO-ATALHOS.md (etapas, contrato, rollback).

// Recortes = mesmas chaves do bloco `quebrado` da get_crm_dashboard_summary
// (exceção nomeada: summary usa `impedimentos_ativos` para o recorte `impedimentos`)
const PENDENCIA_RECORTES = {
  docs_recusados:   { titulo: 'Documentos recusados', unidade: ['documento', 'documentos'] },
  docs_vencidos:    { titulo: 'Documentos vencidos',  unidade: ['documento', 'documentos'] },
  impedimentos:     { titulo: 'Impedimentos ativos',  unidade: ['impedimento', 'impedimentos'] },
  tarefas_vencidas: { titulo: 'Tarefas vencidas',     unidade: ['tarefa', 'tarefas'] },
  tarefas_hoje:     { titulo: 'Tarefas para hoje',    unidade: ['tarefa', 'tarefas'] },
  tarefas_amanha:   { titulo: 'Tarefas para amanhã',  unidade: ['tarefa', 'tarefas'] }
}

function pendenciaHref(recorte) {
  return PENDENCIA_RECORTES[recorte] ? 'clientes.html?pendencia=' + recorte : null
}

// Título na MESMA unidade do contador (pendências) + clientes distintos do MESMO conjunto
function pendenciaTitulo(recorte, itens) {
  const def = PENDENCIA_RECORTES[recorte]
  if (!def) return null
  const n = itens.length
  const clientes = new Set(itens.map(i => i.cliente_id)).size
  const unid = def.unidade[n === 1 ? 0 : 1]
  const cli = clientes === 1 ? '1 cliente' : clientes + ' clientes'
  return `${def.titulo} — ${n} ${unid} · ${cli}`
}

// Rótulo do item usando os vocabulários oficiais de utils.js
function pendenciaLabelItem(i) {
  if (i.recorte === 'impedimentos') {
    return (typeof IMPEDIMENTO_LABEL !== 'undefined' && IMPEDIMENTO_LABEL[i.item_tipo])
      || i.item_descricao || i.item_tipo
  }
  if (i.recorte === 'docs_recusados' || i.recorte === 'docs_vencidos') {
    return i.item_descricao
      || (typeof DOC_LABEL !== 'undefined' && DOC_LABEL[i.item_tipo])
      || i.item_tipo
  }
  return i.item_descricao || '(sem descrição)'
}

function pendenciaAgruparPorCliente(itens) {
  const mapa = new Map()
  itens.forEach(i => {
    if (!mapa.has(i.cliente_id)) {
      mapa.set(i.cliente_id, { cliente_id: i.cliente_id, cliente_nome: i.cliente_nome, itens: [] })
    }
    mapa.get(i.cliente_id).itens.push(i)
  })
  return [...mapa.values()]
}

// Busca do banco — única origem dos dados; nenhum filtro é refeito aqui
async function pendenciasCarregar(recorte) {
  if (!PENDENCIA_RECORTES[recorte]) throw new Error('Recorte desconhecido: ' + recorte)
  const r = await sbRpc('get_crm_pendencias', { p_recorte: recorte })
  return Array.isArray(r) ? r : []
}

// ── Modo pendências em clientes.html (DOM seguro, sem innerHTML) ─────────────
function _pEl(tag, cls, texto) {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (texto != null) n.textContent = texto
  return n
}

function _pLink(href, cls, texto) {
  const a = _pEl('a', cls, texto)
  a.href = href
  return a
}

function _pAviso(linhas) {
  const card = _pEl('div', 'card pend-aviso')
  linhas.forEach(l => {
    if (typeof l === 'string') card.appendChild(_pEl('div', null, l))
    else card.appendChild(l)
  })
  card.appendChild(_pLink('dashboard.html', null, '← Voltar ao dashboard'))
  return card
}

async function iniciarModoPendencias(recorte) {
  const alvo = document.getElementById('pend-view')
  if (!alvo) return
  document.querySelector('.filtros-bar')?.classList.add('hidden')
  document.getElementById('card-tabela')?.classList.add('hidden')
  document.getElementById('vazio')?.classList.add('hidden')
  alvo.classList.remove('hidden')

  const def = PENDENCIA_RECORTES[recorte]
  const topbar = document.querySelector('.topbar-title')
  if (!def) {
    alvo.replaceChildren(_pAviso(['Recorte de pendência desconhecido.']))
    return
  }
  if (topbar) topbar.textContent = def.titulo
  alvo.replaceChildren(_pEl('div', 'card pend-aviso', 'Carregando ' + def.titulo.toLowerCase() + '…'))

  showLoading()
  try {
    const itens = await pendenciasCarregar(recorte)
    const titulo = pendenciaTitulo(recorte, itens)
    if (topbar) topbar.textContent = titulo

    if (!itens.length) {
      alvo.replaceChildren(_pAviso([def.titulo + ': nenhuma pendência no momento.']))
      return
    }

    const frag = document.createDocumentFragment()
    const head = _pEl('div', 'pend-head')
    head.appendChild(_pEl('h2', 'pend-titulo', titulo))
    head.appendChild(_pLink('dashboard.html', 'btn btn-secondary btn-sm', '← Dashboard'))
    frag.appendChild(head)

    pendenciaAgruparPorCliente(itens).forEach(g => {
      const card = _pEl('div', 'card pend-grupo')
      const linha = _pEl('div', 'pend-cliente')
      linha.appendChild(_pLink('ficha.html?id=' + encodeURIComponent(g.cliente_id), 'pend-cliente-link', g.cliente_nome))
      const st = g.itens[0].status_kanban || ''
      linha.appendChild(_pEl('span', 'badge status-' + st,
        (typeof KANBAN_LABEL !== 'undefined' && KANBAN_LABEL[st]) || st))
      card.appendChild(linha)

      const ul = _pEl('ul', 'pend-itens')
      g.itens.forEach(i => {
        const li = _pEl('li', null, pendenciaLabelItem(i))
        if (i.data_ref) li.appendChild(_pEl('span', 'text-muted', ' · ' + fmtData(i.data_ref)))
        ul.appendChild(li)
      })
      card.appendChild(ul)
      card.appendChild(_pLink('ficha.html?id=' + encodeURIComponent(g.cliente_id), 'btn btn-secondary btn-sm', 'Ver ficha'))
      frag.appendChild(card)
    })
    alvo.replaceChildren(frag)
  } catch (err) {
    // Inclui o estado transitório da Etapa 1 (RPC ainda não criada no banco)
    alvo.replaceChildren(_pAviso([
      'Não consegui carregar as pendências.',
      _pEl('div', 'text-sm text-muted', traduzirErro(err))
    ]))
  } finally {
    hideLoading()
  }
}

if (typeof window !== 'undefined') {
  window.PENDENCIA_RECORTES = PENDENCIA_RECORTES
  window.pendenciaHref = pendenciaHref
  window.pendenciaTitulo = pendenciaTitulo
  window.pendenciasCarregar = pendenciasCarregar
  window.iniciarModoPendencias = iniciarModoPendencias
}
