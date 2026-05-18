// EDR CRM — Página Agenda (calendário + painel lateral)
// Mesma key tracker_sync que a agenda standalone do EDR System.
// Elyda → elyda-agenda-v1 · Iannaline → iannaline-agenda-v1

(function() {
  if (!authGuard()) throw new Error('not auth')
  document.documentElement.style.visibility = ''

  const u = getUsuario()
  const elUsr = document.getElementById('sidebar-usuario')
  if (elUsr) elUsr.textContent = u?.nome || u?.email || ''

  // Título personalizado
  const tituloEl = document.getElementById('ap-titulo-user')
  if (tituloEl && u?.nome) {
    const primeiro = u.nome.trim().split(/\s+/)[0]
    tituloEl.textContent = `Agenda da ${primeiro}`
  }

  // Versão rodapé
  const versaoEl = document.getElementById('crm-versao-footer')
  if (versaoEl) versaoEl.textContent = 'v' + new Date().toISOString().slice(2,10).replace(/-/g,'') + '1200'

  // ─── Key mapping ───────────────────────────────────────
  function resolveKey() {
    const nome = (u?.nome || u?.email || '').toLowerCase()
    if (nome.includes('iannaline')) return 'iannaline-agenda-v1'
    if (nome.includes('elyda')) return 'elyda-agenda-v1'
    return `user-${u.id}-agenda-v1`
  }
  const KEY = resolveKey()

  // ─── Estado ─────────────────────────────────────────────
  const _state = {
    eventos: [],
    mesAtual: new Date().getMonth(),
    anoAtual: new Date().getFullYear(),
    diaSelecionado: ymd(new Date())
  }

  // ─── Helpers data ───────────────────────────────────────
  function ymd(d) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  function parseLocalDate(iso) {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  function diaDaSemana(iso) {
    return parseLocalDate(iso).toLocaleDateString('pt-BR', { weekday: 'long' })
  }
  function dataExtenso(iso) {
    const d = parseLocalDate(iso)
    return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  }

  // ─── I/O tracker_sync ───────────────────────────────────
  async function fetchEventos() {
    try {
      const rows = await sbGet('tracker_sync', `?key=eq.${KEY}&select=data`)
      _state.eventos = rows[0]?.data?.eventos || []
    } catch (e) {
      console.warn('[agenda] fetch falhou:', e.message)
      _state.eventos = []
    }
  }

  async function saveEventos() {
    showSaving(true)
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/tracker_sync?on_conflict=key`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + (getToken() || SUPABASE_KEY),
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify({
          key: KEY,
          data: { eventos: _state.eventos },
          updated_at: new Date().toISOString()
        })
      })
      if (!r.ok) throw new Error('upsert: ' + r.status)
    } catch (e) {
      console.error('[agenda] save falhou:', e.message)
      alert('Falha ao salvar: ' + e.message)
    } finally {
      setTimeout(() => showSaving(false), 400)
    }
  }

  function showSaving(on) {
    const el = document.getElementById('ap-saving')
    if (el) el.classList.toggle('show', on)
  }

  // ─── Calendário ─────────────────────────────────────────
  function renderCalendario() {
    const grid = document.getElementById('ap-grid')
    const titulo = document.getElementById('ap-titulo-mes')
    if (!grid || !titulo) return

    const date = new Date(_state.anoAtual, _state.mesAtual, 1)
    titulo.textContent = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

    // dia da semana do dia 1 (0=Dom)
    const primeiroDiaSem = date.getDay()
    const ultimoDia = new Date(_state.anoAtual, _state.mesAtual + 1, 0).getDate()
    const ultimoDiaMesAnt = new Date(_state.anoAtual, _state.mesAtual, 0).getDate()
    const hojeYmd = ymd(new Date())

    // Index eventos por dia
    const porDia = {}
    for (const ev of _state.eventos) {
      if (!ev.data) continue
      ;(porDia[ev.data] ||= []).push(ev)
    }

    let html = ''
    // Dias do mês anterior (preenchimento)
    for (let i = primeiroDiaSem - 1; i >= 0; i--) {
      const d = ultimoDiaMesAnt - i
      const mesPrev = _state.mesAtual === 0 ? 11 : _state.mesAtual - 1
      const anoPrev = _state.mesAtual === 0 ? _state.anoAtual - 1 : _state.anoAtual
      const iso = `${anoPrev}-${String(mesPrev+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
      html += `<div class="ap-dia outro" data-data="${iso}"><span class="num">${d}</span></div>`
    }
    // Dias do mês atual
    for (let d = 1; d <= ultimoDia; d++) {
      const iso = `${_state.anoAtual}-${String(_state.mesAtual+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
      const evs = porDia[iso] || []
      const classes = ['ap-dia']
      if (iso === hojeYmd) classes.push('hoje')
      if (iso === _state.diaSelecionado) classes.push('selected')
      const dots = evs.slice(0, 6).map(e => `<div class="dot ${e.categoria||'trabalho'}"></div>`).join('')
      html += `<div class="${classes.join(' ')}" data-data="${iso}"><span class="num">${d}</span><div class="dots">${dots}</div></div>`
    }
    // Preenchimento mês seguinte (até completar 6 semanas = 42 células)
    const totalCells = primeiroDiaSem + ultimoDia
    const proxCells = (7 - (totalCells % 7)) % 7
    for (let d = 1; d <= proxCells; d++) {
      const mesNext = _state.mesAtual === 11 ? 0 : _state.mesAtual + 1
      const anoNext = _state.mesAtual === 11 ? _state.anoAtual + 1 : _state.anoAtual
      const iso = `${anoNext}-${String(mesNext+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
      html += `<div class="ap-dia outro" data-data="${iso}"><span class="num">${d}</span></div>`
    }
    grid.innerHTML = html
  }

  // ─── Painel lateral ─────────────────────────────────────
  function renderDia() {
    const lista = document.getElementById('ap-dia-lista')
    const titulo = document.getElementById('ap-dia-titulo')
    if (!lista || !titulo) return

    titulo.textContent = dataExtenso(_state.diaSelecionado)

    const evs = _state.eventos.filter(e => e.data === _state.diaSelecionado)
    evs.sort((a, b) => (a.hora || '99:99').localeCompare(b.hora || '99:99'))

    if (!evs.length) {
      lista.innerHTML = `<div class="ap-empty">Sem compromissos. Use o form abaixo pra adicionar.</div>`
      return
    }

    lista.innerHTML = evs.map(ev => `
      <div class="ap-event ${ev.concluido ? 'done' : ''}" data-id="${ev.id}">
        <div class="ap-prio ap-prio-${ev.prioridade || 'baixa'}"></div>
        <div class="ap-time">${ev.hora || '--:--'}</div>
        <div class="ap-body">
          <div class="ap-title">${escapeHtml(ev.titulo || '')}</div>
          <div class="ap-meta">
            <span class="ap-tag ap-tag-${ev.categoria || 'trabalho'}">${ev.categoria || 'trabalho'}</span>
          </div>
          ${ev.obs ? `<div class="ap-obs">${escapeHtml(ev.obs)}</div>` : ''}
        </div>
        <div class="ap-actions">
          <button class="ap-btn-ico check" data-act="toggle" data-id="${ev.id}" title="${ev.concluido ? 'Reabrir' : 'Concluir'}">${ev.concluido ? '✓' : '○'}</button>
          <button class="ap-btn-ico del" data-act="del" data-id="${ev.id}" title="Excluir">🗑</button>
        </div>
      </div>
    `).join('')
  }

  function renderProximos() {
    const wrap = document.getElementById('ap-proximos')
    if (!wrap) return

    const hoje = ymd(new Date())
    const fim = new Date(); fim.setDate(fim.getDate() + 7)
    const fimYmd = ymd(fim)

    const evs = _state.eventos
      .filter(e => e.data > hoje && e.data <= fimYmd && !e.concluido)
      .sort((a, b) => (a.data + (a.hora||'')).localeCompare(b.data + (b.hora||'')))
      .slice(0, 6)

    if (!evs.length) {
      wrap.innerHTML = `<div class="ap-empty">Nada nos próximos 7 dias</div>`
      return
    }

    wrap.innerHTML = evs.map(ev => {
      const dataLabel = parseLocalDate(ev.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
      return `
        <div class="ap-event" data-id="${ev.id}">
          <div class="ap-prio ap-prio-${ev.prioridade || 'baixa'}"></div>
          <div class="ap-time">${dataLabel}</div>
          <div class="ap-body">
            <div class="ap-title">${escapeHtml(ev.titulo || '')}</div>
            <div class="ap-meta">
              <span class="ap-tag ap-tag-${ev.categoria || 'trabalho'}">${ev.categoria || 'trabalho'}</span>
              <span style="font-family:'JetBrains Mono';font-size:11px;color:var(--text-tertiary)">${ev.hora || ''}</span>
            </div>
          </div>
        </div>
      `
    }).join('')
  }

  function renderContadores() {
    const hoje = ymd(new Date())
    const fimSemana = new Date(); fimSemana.setDate(fimSemana.getDate() + 7)
    const fimSemanaYmd = ymd(fimSemana)
    const mesAtual = String(_state.mesAtual+1).padStart(2,'0')
    const prefixoMes = `${_state.anoAtual}-${mesAtual}-`

    const cHoje = _state.eventos.filter(e => e.data === hoje && !e.concluido).length
    const cSem = _state.eventos.filter(e => e.data >= hoje && e.data <= fimSemanaYmd && !e.concluido).length
    const cMes = _state.eventos.filter(e => e.data?.startsWith(prefixoMes) && !e.concluido).length

    document.getElementById('ap-cnt-hoje').textContent = cHoje
    document.getElementById('ap-cnt-sem').textContent = cSem
    document.getElementById('ap-cnt-mes').textContent = cMes
  }

  function renderAll() {
    renderCalendario()
    renderDia()
    renderProximos()
    renderContadores()
  }

  // ─── Bind ───────────────────────────────────────────────
  function setDiaForm(iso) {
    const f = document.getElementById('ap-f-data')
    if (f) f.value = iso
  }

  document.getElementById('ap-mes-prev').addEventListener('click', () => {
    _state.mesAtual--
    if (_state.mesAtual < 0) { _state.mesAtual = 11; _state.anoAtual-- }
    renderCalendario()
  })
  document.getElementById('ap-mes-next').addEventListener('click', () => {
    _state.mesAtual++
    if (_state.mesAtual > 11) { _state.mesAtual = 0; _state.anoAtual++ }
    renderCalendario()
  })
  document.getElementById('ap-btn-hoje').addEventListener('click', () => {
    const now = new Date()
    _state.mesAtual = now.getMonth()
    _state.anoAtual = now.getFullYear()
    _state.diaSelecionado = ymd(now)
    setDiaForm(_state.diaSelecionado)
    renderAll()
  })

  document.getElementById('ap-grid').addEventListener('click', (e) => {
    const cel = e.target.closest('.ap-dia')
    if (!cel) return
    const iso = cel.dataset.data
    if (!iso) return
    _state.diaSelecionado = iso
    // se clicou em outro mês, navega
    const [y, m] = iso.split('-').map(Number)
    if (y !== _state.anoAtual || m - 1 !== _state.mesAtual) {
      _state.anoAtual = y
      _state.mesAtual = m - 1
    }
    setDiaForm(iso)
    renderCalendario()
    renderDia()
  })

  document.getElementById('ap-dia-lista').addEventListener('click', async (e) => {
    const btn = e.target.closest('.ap-btn-ico')
    if (!btn) return
    const id = btn.dataset.id
    const act = btn.dataset.act
    const ev = _state.eventos.find(x => String(x.id) === String(id))
    if (!ev) return

    btn.disabled = true
    if (act === 'toggle') {
      ev.concluido = !ev.concluido
    } else if (act === 'del') {
      if (!confirm('Excluir esse compromisso?')) { btn.disabled = false; return }
      _state.eventos = _state.eventos.filter(x => String(x.id) !== String(id))
    }
    await saveEventos()
    renderAll()
  })

  document.getElementById('ap-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const tit = document.getElementById('ap-f-titulo').value.trim()
    if (!tit) return
    const novo = {
      id: Date.now(),
      titulo: tit,
      data: document.getElementById('ap-f-data').value || ymd(new Date()),
      hora: document.getElementById('ap-f-hora').value || '',
      categoria: document.getElementById('ap-f-cat').value,
      prioridade: document.getElementById('ap-f-prio').value,
      obs: document.getElementById('ap-f-obs').value.trim(),
      concluido: false
    }
    const btn = document.getElementById('ap-btn-add')
    btn.disabled = true; btn.textContent = 'Salvando…'
    _state.eventos.unshift(novo)
    await saveEventos()
    _state.diaSelecionado = novo.data
    const [y, m] = novo.data.split('-').map(Number)
    _state.anoAtual = y; _state.mesAtual = m - 1
    renderAll()
    document.getElementById('ap-f-titulo').value = ''
    document.getElementById('ap-f-obs').value = ''
    btn.disabled = false; btn.textContent = '+ Adicionar'
  })

  // ─── Boot ───────────────────────────────────────────────
  (async function boot() {
    setDiaForm(_state.diaSelecionado)
    await fetchEventos()
    renderAll()
  })()
})()
