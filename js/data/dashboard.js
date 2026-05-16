// EDR CRM — Dashboard data layer
// Consome RPC get_crm_dashboard_summary() e renderiza tudo.
// Auto-refresh 3min, expand inline da lista, nome dinâmico do usuário logado.

(function() {
  if (!authGuard()) throw new Error('not auth')
  document.documentElement.style.visibility = ''

  const u = getUsuario()
  const elUsr = document.getElementById('sidebar-usuario')
  if (elUsr) elUsr.textContent = u?.nome || u?.email || ''

  let _dados = null
  let _expandido = false
  let _ultimaSync = null
  const REFRESH_MS = 3 * 60 * 1000  // 3 minutos

  const LABEL_ETAPA = {
    triagem: 'Triagem',
    documentacao: 'Documentação',
    correspondente: 'Correspondente',
    aprovado: 'Aprovado',
    prefeitura: 'Prefeitura',
    assinatura: 'Assinatura',
    concluido: 'Concluído',
    perdido: 'Perdido'
  }

  // ─── Helpers ─────────────────────────────────────────────────────
  function iniciais(nome) {
    if (!nome) return '··'
    const partes = nome.trim().split(/\s+/)
    if (partes.length === 1) return partes[0].slice(0,2).toUpperCase()
    return (partes[0][0] + partes[partes.length-1][0]).toUpperCase()
  }

  function saudacao(hora) {
    if (hora < 12) return 'Bom dia'
    if (hora < 18) return 'Boa tarde'
    return 'Boa noite'
  }

  function dataExtenso(d) {
    return d.toLocaleDateString('pt-BR', {
      weekday: 'long', day: 'numeric', month: 'long'
    })
  }

  function tempoDecorrido(ms) {
    const seg = Math.floor((Date.now() - ms) / 1000)
    if (seg < 60) return 'agora há pouco'
    const min = Math.floor(seg / 60)
    if (min === 1) return 'há 1 min'
    if (min < 60) return `há ${min} min`
    return 'há mais de 1h'
  }

  function escapeHtml(s) {
    if (s == null) return ''
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]))
  }

  // ─── Renderers ──────────────────────────────────────────────────
  function renderHero(briefing) {
    const agora = new Date()
    const sau = saudacao(agora.getHours())
    const nome = briefing.usuario_nome || u?.nome || u?.email || 'usuário'
    document.getElementById('hero-greeting').innerHTML =
      `${sau}, ${escapeHtml(nome)} 🌿`

    const dia = dataExtenso(agora)
    const cobrar = briefing.cobrar_hoje_total
    const tarefasHoje = briefing.tarefas_hoje

    let partes = [`Hoje é ${dia}.`]
    if (cobrar > 0) {
      partes.push(`Você tem <b>${cobrar} ${cobrar === 1 ? 'família' : 'famílias'}</b> precisando de ação`)
    } else {
      partes.push(`Nenhuma família urgente`)
    }
    if (tarefasHoje > 0) {
      partes.push(`e <b>${tarefasHoje} ${tarefasHoje === 1 ? 'tarefa' : 'tarefas'}</b> vencendo hoje.`)
    } else {
      partes[partes.length-1] += '.'
    }
    document.getElementById('hero-sub').innerHTML = partes.join(' ')
  }

  function renderKpis(k) {
    const el = document.getElementById('kpis')
    const urgentClass = k.cobrar_hoje > 0 ? 'urgent' : ''
    const lotesAttn = (k.josue_reservados / k.josue_total) >= 0.75 ? 'attn' : ''
    el.innerHTML = `
      <div class="kpi ${urgentClass}">
        <div class="kpi-label">Cobrar hoje</div>
        <div class="kpi-value">${k.cobrar_hoje}</div>
        <div class="kpi-sub">${k.cobrar_hoje === 0 ? 'tudo em dia' : 'famílias críticas'}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Em movimento</div>
        <div class="kpi-value">${k.em_movimento}</div>
        <div class="kpi-sub">famílias ativas</div>
      </div>
      <div class="kpi ${lotesAttn}">
        <div class="kpi-label">Lotes Josué</div>
        <div class="kpi-value">${k.josue_reservados}<span class="frac">/${k.josue_total}</span></div>
        <div class="kpi-sub">${k.josue_total - k.josue_reservados} livres</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Concluídos no mês</div>
        <div class="kpi-value">${k.concluidos_mes}</div>
        <div class="kpi-sub">desde dia 1</div>
      </div>
    `
  }

  function renderCobrarHoje(cobrar) {
    const lista = cobrar.lista || []
    const total = cobrar.total || 0
    const elLista = document.getElementById('cobrar-lista')
    const elBadge = document.getElementById('cobrar-badge')
    const elSub = document.getElementById('cobrar-sub')
    const elFoot = document.getElementById('cobrar-foot')
    const elFootInfo = document.getElementById('cobrar-foot-info')
    const elToggle = document.getElementById('cobrar-toggle')

    if (total === 0) {
      elBadge.innerHTML = ''
      elSub.textContent = 'Tudo em dia — nenhuma família passou do SLA.'
      elLista.innerHTML = `<div class="empty-state"><span class="icon">✅</span>Nada pra cobrar hoje. Aproveita pra adiantar as próximas etapas.</div>`
      elFoot.style.display = 'none'
      return
    }

    const reds = lista.filter(f => f.gravidade === 'red').length
    const yellows = lista.filter(f => f.gravidade === 'yellow').length
    const badgeHtml = reds > 0
      ? `<span class="badge-fire">${reds} ${reds === 1 ? 'crítica' : 'críticas'}</span>`
      : `<span class="badge-attn">${yellows} atenção</span>`
    elBadge.innerHTML = badgeHtml
    elSub.textContent = `${total} ${total === 1 ? 'família' : 'famílias'} ordenadas por gravidade`

    const exibir = _expandido ? lista : lista.slice(0, 3)
    elLista.innerHTML = exibir.map(f => renderFamRow(f)).join('')

    if (total > 3) {
      elFoot.style.display = 'flex'
      const restantes = total - 3
      elFootInfo.textContent = _expandido
        ? `Mostrando todas as ${total}`
        : `Mostrando 3 de ${total}`
      elToggle.textContent = _expandido
        ? 'Mostrar só top 3 ↑'
        : `Expandir lista completa ↓ (+${restantes})`
    } else {
      elFoot.style.display = 'none'
    }
  }

  function renderFamRow(f) {
    const stage = LABEL_ETAPA[f.status_kanban] || f.status_kanban
    const lote = f.lote_numero
      ? `Lote ${f.lote_numero}${f.lote_quadra && f.lote_quadra !== 'Avulso' ? ' Q.' + f.lote_quadra : ' (avulso)'}`
      : 'Sem lote'
    const faixa = f.faixa_mcmv ? `Faixa ${f.faixa_mcmv}` : 'Sem faixa'
    const meta = [
      f.telefone ? fmtTel(f.telefone) : '—',
      faixa,
      lote
    ].join(' · ')
    const diasClass = f.gravidade === 'red' ? '' : 'warn'
    const diasLabel = f.dias_parado === 0 ? 'hoje' : `${f.dias_parado}d parado`
    return `
      <a class="fam-row" href="ficha.html?id=${escapeHtml(f.id)}">
        <div class="fam-avatar">${iniciais(f.nome)}</div>
        <div>
          <div class="fam-name">${escapeHtml(f.nome)}</div>
          <div class="fam-meta">${escapeHtml(meta)}</div>
        </div>
        <span class="fam-tag ${f.status_kanban}">${stage}</span>
        <span class="fam-days ${diasClass}">${diasLabel}</span>
      </a>
    `
  }

  function renderQuebrado(q) {
    const el = document.getElementById('quebrado-lista')
    const linha = (icoClass, ico, label, count) => {
      const zero = count === 0 ? 'zero' : ''
      return `<div class="broken-row">
        <span class="broken-label"><span class="broken-icon ${icoClass}">${ico}</span> ${label}</span>
        <span class="broken-count ${zero}">${count}</span>
      </div>`
    }
    el.innerHTML = [
      linha('bi-r', '!', 'Docs recusados', q.docs_recusados),
      linha('bi-y', '⏰', 'Docs vencidos', q.docs_vencidos),
      linha('bi-r', '🛑', 'Impedimentos', q.impedimentos_ativos),
      linha('bi-r', '📅', 'Tarefas vencidas', q.tarefas_vencidas),
      linha('bi-y', '📅', 'Tarefas hoje', q.tarefas_hoje),
      linha('bi-g', '📅', 'Tarefas amanhã', q.tarefas_amanha)
    ].join('')
  }

  function renderFunil(f) {
    const ordem = ['triagem','documentacao','correspondente','aprovado','prefeitura','assinatura']
    const labels = { triagem: 'Triagem', documentacao: 'Doc', correspondente: 'Corresp', aprovado: 'Aprov', prefeitura: 'Pref', assinatura: 'Assin' }
    const k = _dados?.kpis
    const concluidosMes = k?.concluidos_mes ?? 0
    const fns = ordem.map(et => `
      <a class="fn" href="kanban.html#${et}">
        <div class="fn-label">${labels[et]}</div>
        <div class="fn-value">${f?.[et] ?? 0}</div>
      </a>
    `).join('') + `
      <a class="fn" href="clientes.html?status=concluido">
        <div class="fn-label">Concl mês</div>
        <div class="fn-value">${concluidosMes}</div>
      </a>
    `
    document.getElementById('funil').innerHTML = fns
  }

  function renderRefreshInfo() {
    const el = document.getElementById('last-refresh')
    if (!el || !_ultimaSync) return
    el.textContent = `Atualizado ${tempoDecorrido(_ultimaSync)}`
  }

  // ─── Loader ─────────────────────────────────────────────────────
  async function dashboardCarregar() {
    try {
      const data = await sbRpc('get_crm_dashboard_summary')
      if (!data) throw new Error('Resposta vazia do servidor')
      _dados = data
      _ultimaSync = Date.now()

      renderHero(data.briefing)
      renderKpis(data.kpis)
      renderCobrarHoje(data.cobrar_hoje)
      renderQuebrado(data.quebrado)
      renderFunil(data.funil)
      renderRefreshInfo()
    } catch (err) {
      console.error('Dashboard erro:', err)
      const el = document.getElementById('hero-sub')
      if (el) el.innerHTML = `<span style="color:var(--vermelho)">⚠️ Erro ao carregar: ${escapeHtml(err.message)}. <a href="#" onclick="dashboardCarregar();return false">Tentar de novo</a></span>`
    }
  }

  function toggleExpandir() {
    _expandido = !_expandido
    if (_dados) renderCobrarHoje(_dados.cobrar_hoje)
  }

  // ─── Init ────────────────────────────────────────────────────────
  window.dashboardCarregar = dashboardCarregar
  window.toggleExpandir = toggleExpandir

  // Toggle do expandir
  document.addEventListener('click', e => {
    if (e.target && e.target.id === 'cobrar-toggle') {
      e.preventDefault()
      toggleExpandir()
    }
  })

  // Carrega inicial
  dashboardCarregar()

  // Auto-refresh 3min
  setInterval(dashboardCarregar, REFRESH_MS)

  // Atualiza "há X min" a cada 30s
  setInterval(renderRefreshInfo, 30 * 1000)
})()
