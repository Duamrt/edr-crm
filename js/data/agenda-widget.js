// EDR CRM — Widget Agenda (lê tracker_sync do EDR System)
// Cada usuária (Elyda, Iannaline) tem sua key no tracker_sync.
// Dados sincronizados com a agenda standalone em sistema.edreng.com.br/agenda*.html

(function() {
  const KEY_MAP = {
    elyda: { key: 'elyda-agenda-v1', url: 'https://sistema.edreng.com.br/agenda.html' },
    iannaline: { key: 'iannaline-agenda-v1', url: 'https://sistema.edreng.com.br/agenda-iannaline.html' }
  }

  function resolveAgendaKey() {
    const u = getUsuario()
    if (!u) return null
    const nome = (u.nome || u.email || '').toLowerCase()
    if (nome.includes('iannaline')) return KEY_MAP.iannaline
    if (nome.includes('elyda')) return KEY_MAP.elyda
    // fallback: cria key por user.id
    return { key: `user-${u.id}-agenda-v1`, url: null }
  }

  function ymd(d) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  function parseLocalDate(iso) {
    // 'YYYY-MM-DD' → Date local (sem UTC shift)
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d)
  }

  async function fetchEventos(key) {
    try {
      const rows = await sbGet('tracker_sync', `?key=eq.${key}&select=data`)
      if (!rows.length) return []
      return rows[0].data?.eventos || []
    } catch (e) {
      console.warn('[agenda-widget] fetch falhou:', e.message)
      return []
    }
  }

  async function saveEventos(key, eventos) {
    try {
      // upsert (POST com on_conflict=key)
      const r = await fetch(`${SUPABASE_URL}/rest/v1/tracker_sync?on_conflict=key`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + (getToken() || SUPABASE_KEY),
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify({
          key,
          data: { eventos },
          updated_at: new Date().toISOString()
        })
      })
      if (!r.ok) throw new Error(`upsert: ${r.status}`)
      return true
    } catch (e) {
      console.error('[agenda-widget] save falhou:', e.message)
      return false
    }
  }

  function classifyByDay(eventos) {
    const hoje = ymd(new Date())
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
    const amanha = ymd(tomorrow)
    const semanaFim = new Date(); semanaFim.setDate(semanaFim.getDate() + 7)
    const semanaFimYmd = ymd(semanaFim)

    const buckets = { atrasado: [], hoje: [], amanha: [], semana: [] }

    for (const ev of eventos) {
      if (!ev.data) continue
      if (ev.concluido) continue
      if (ev.data < hoje) buckets.atrasado.push(ev)
      else if (ev.data === hoje) buckets.hoje.push(ev)
      else if (ev.data === amanha) buckets.amanha.push(ev)
      else if (ev.data <= semanaFimYmd) buckets.semana.push(ev)
    }

    const sortByHora = (a, b) => (a.hora || '99:99').localeCompare(b.hora || '99:99')
    buckets.hoje.sort(sortByHora)
    buckets.amanha.sort(sortByHora)
    buckets.atrasado.sort((a, b) => a.data.localeCompare(b.data))
    buckets.semana.sort((a, b) => (a.data + (a.hora || '')).localeCompare(b.data + (b.hora || '')))

    return buckets
  }

  function eventHTML(ev, opts = {}) {
    const prio = ev.prioridade || 'baixa'
    const cat = ev.categoria || 'trabalho'
    const titulo = escapeHtml(ev.titulo || '(sem título)')
    const hora = ev.hora || '--:--'
    const atrasado = opts.atrasado
    const dataLabel = opts.mostrarData
      ? parseLocalDate(ev.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
      : null

    return `
      <div class="ag-event">
        <div class="ag-prio ag-prio-${prio}"></div>
        <div class="ag-time">${dataLabel || hora}</div>
        <div class="ag-body">
          <div class="ag-title ${atrasado ? 'ag-title-late' : ''}">${atrasado ? '⚠ ' : ''}${titulo}</div>
          <div class="ag-meta">
            <span class="ag-tag ag-tag-${cat}">${cat}</span>
            ${ev.obs ? `<span class="ag-obs">${escapeHtml(ev.obs.slice(0, 40))}${ev.obs.length > 40 ? '…' : ''}</span>` : ''}
          </div>
        </div>
        <button class="ag-check" data-id="${ev.id}" title="Marcar concluído"></button>
      </div>
    `
  }

  function render(buckets, tab) {
    const list = buckets[tab] || []
    const wrap = document.getElementById('ag-list')
    if (!wrap) return

    if (!list.length) {
      wrap.innerHTML = `
        <div class="ag-empty">
          ${tab === 'hoje' ? '✨ Nada pra hoje — dia limpo!' :
            tab === 'amanha' ? 'Sem compromissos amanhã' :
            tab === 'semana' ? 'Sem nada nos próximos 7 dias' :
            'Nenhum atrasado'}
        </div>
      `
      return
    }

    const mostrarData = tab === 'semana' || tab === 'atrasado'
    wrap.innerHTML = list.slice(0, 6).map(ev => eventHTML(ev, {
      atrasado: tab === 'atrasado',
      mostrarData
    })).join('')
  }

  function updateCounts(buckets) {
    document.querySelectorAll('.ag-tab').forEach(t => {
      const k = t.dataset.tab
      const n = (buckets[k] || []).length
      const el = t.querySelector('.ag-count')
      if (el) el.textContent = n
      t.classList.toggle('ag-has', n > 0)
    })
  }

  function updateKPI(buckets) {
    const kpiVal = document.getElementById('kpi-agenda-val')
    const kpiSub = document.getElementById('kpi-agenda-sub')
    if (!kpiVal) return
    const hoje = buckets.hoje.length
    const atrasado = buckets.atrasado.length
    kpiVal.textContent = hoje
    kpiVal.classList.remove('skel')
    if (atrasado > 0) {
      kpiSub.textContent = `${atrasado} atrasado${atrasado > 1 ? 's' : ''}`
      kpiSub.style.color = 'var(--vermelho)'
    } else if (hoje === 0) {
      kpiSub.textContent = 'dia limpo'
      kpiSub.style.color = 'var(--success, #16a34a)'
    } else {
      kpiSub.textContent = `pra hoje`
      kpiSub.style.color = ''
    }
  }

  function updateBanner(buckets, userNome) {
    const banner = document.getElementById('ag-banner')
    if (!banner) return
    const h = new Date().getHours()
    const sd = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
    const nome = (userNome || '').split(' ')[0] || ''
    const hoje = buckets.hoje.length
    const atrasado = buckets.atrasado.length

    let msg = ''
    if (atrasado > 0) {
      const ev = buckets.atrasado[0]
      msg = `Você tem <b>${atrasado} compromisso${atrasado > 1 ? 's' : ''} atrasado${atrasado > 1 ? 's' : ''}</b>. Comece pelo: <i>${escapeHtml(ev.titulo)}</i>`
    } else if (hoje > 0) {
      msg = `Você tem <b>${hoje} compromisso${hoje > 1 ? 's' : ''} hoje</b>.`
    } else {
      msg = 'Sua agenda de hoje tá limpa. Bora pegar pendência da semana?'
    }

    banner.innerHTML = `
      <div class="ag-banner-ico">${atrasado > 0 ? '⚠️' : (h < 12 ? '☀️' : h < 18 ? '🌤️' : '🌙')}</div>
      <div class="ag-banner-txt">
        <strong>${sd}, ${escapeHtml(nome)}!</strong>
        ${msg}
      </div>
    `
    banner.style.display = 'flex'
  }

  async function marcarConcluido(id, key, eventos) {
    const ev = eventos.find(e => String(e.id) === String(id))
    if (!ev) return false
    ev.concluido = true
    const ok = await saveEventos(key, eventos)
    return ok
  }

  let _state = { key: null, url: null, eventos: [], buckets: null, tab: 'hoje' }

  async function carregar() {
    const ctx = resolveAgendaKey()
    if (!ctx) return
    _state.key = ctx.key
    _state.url = ctx.url

    // "Abrir completa" já aponta pra agenda.html interna (definido no HTML)

    const eventos = await fetchEventos(ctx.key)
    _state.eventos = eventos
    const buckets = classifyByDay(eventos)
    _state.buckets = buckets

    const u = getUsuario()
    updateBanner(buckets, u?.nome)
    updateKPI(buckets)
    updateCounts(buckets)

    // Tab default: se tem atrasado, abre nele; senão hoje
    if (buckets.atrasado.length > 0) {
      _state.tab = 'atrasado'
      document.querySelectorAll('.ag-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'atrasado'))
    } else {
      _state.tab = 'hoje'
    }

    render(buckets, _state.tab)
  }

  function bindEvents() {
    document.addEventListener('click', async (e) => {
      // Tab switch
      const tab = e.target.closest('.ag-tab')
      if (tab) {
        document.querySelectorAll('.ag-tab').forEach(t => t.classList.remove('active'))
        tab.classList.add('active')
        _state.tab = tab.dataset.tab
        render(_state.buckets, _state.tab)
        return
      }
      // Check (concluir)
      const check = e.target.closest('.ag-check')
      if (check) {
        const id = check.dataset.id
        check.disabled = true
        const ok = await marcarConcluido(id, _state.key, _state.eventos)
        if (ok) carregar()
        else check.disabled = false
        return
      }
      // Quick-add (robusto contra clique em filhos do botão)
      const addBtn = e.target.closest('#ag-add-btn')
      if (addBtn) {
        e.preventDefault()
        const input = document.getElementById('ag-add-input')
        const titulo = (input?.value || '').trim()
        if (!titulo) { input?.focus(); return }
        addBtn.disabled = true
        const novo = {
          id: Date.now(),
          titulo,
          data: ymd(new Date()),
          hora: '',
          categoria: 'trabalho',
          prioridade: 'baixa',
          obs: '',
          concluido: false
        }
        _state.eventos.unshift(novo)
        const ok = await saveEventos(_state.key, _state.eventos)
        if (ok) {
          input.value = ''
          await carregar()
        }
        addBtn.disabled = false
      }
    })

    // Enter no input
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.id === 'ag-add-input') {
        document.getElementById('ag-add-btn').click()
      }
    })
  }

  // boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { bindEvents(); carregar() })
  } else {
    bindEvents(); carregar()
  }

  // expor
  window.AgendaWidget = { carregar, resolveAgendaKey }
})()
