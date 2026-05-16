// EDR CRM — Dashboard data layer (v2 — com pendências detalhadas + ações)
// Consome RPC get_crm_dashboard_summary() e renderiza com bloco de pendências por família.
// Auto-refresh 3min, expand inline, nome dinâmico, mensagem padrão pra clipboard, "Cobrei agora".

(function() {
  if (!authGuard()) throw new Error('not auth')
  document.documentElement.style.visibility = ''

  const u = getUsuario()
  const elUsr = document.getElementById('sidebar-usuario')
  if (elUsr) elUsr.textContent = u?.nome || u?.email || ''

  let _dados = null
  let _expandido = false
  let _ultimaSync = null
  const REFRESH_MS = 3 * 60 * 1000

  const LABEL_ETAPA_CURTO = {
    triagem: 'Triagem',
    documentacao: 'Documentação',
    correspondente: 'Correspondente',
    aprovado: 'Aprovado',
    prefeitura: 'Prefeitura',
    assinatura: 'Assinatura'
  }

  // ─── Helpers ─────────────────────────────────────────────────────
  function iniciais(nome) {
    if (!nome) return '··'
    const partes = nome.trim().split(/\s+/)
    if (partes.length === 1) return partes[0].slice(0,2).toUpperCase()
    return (partes[0][0] + partes[partes.length-1][0]).toUpperCase()
  }

  function saudacao(h) {
    if (h < 12) return 'Bom dia'
    if (h < 18) return 'Boa tarde'
    return 'Boa noite'
  }

  function dataExtenso(d) {
    return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
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

  function labelDoc(d) {
    if (!d) return ''
    if (d.descricao) return d.descricao
    return DOC_LABEL[d.tipo] || d.tipo
  }

  function labelImp(i) {
    if (!i) return ''
    return IMPEDIMENTO_LABEL[i.tipo] || i.descricao || i.tipo
  }

  function primeiroNome(nomeCompleto) {
    if (!nomeCompleto) return ''
    return nomeCompleto.trim().split(/\s+/)[0]
  }

  function capitalizar(s) {
    if (!s) return s
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
  }

  // Gera mensagem padrão de cobrança baseada no estado da família
  function gerarMensagemPadrao(f) {
    const nome = capitalizar(primeiroNome(f.nome))
    const tudoOk = (f.docs_faltando?.length || 0) === 0 &&
                   (f.docs_recusados?.length || 0) === 0 &&
                   (f.docs_vencidos?.length || 0) === 0 &&
                   (f.impedimentos?.length || 0) === 0

    let corpo = ''

    if (tudoOk) {
      // Família sem pendências de doc — provavelmente travada na etapa (corresp, prefeitura, etc)
      const etapa = LABEL_ETAPA_CURTO[f.status_kanban] || f.status_kanban
      corpo = `Oi ${nome}, tudo bem? Aqui é da EDR. Tô passando pra acompanhar o andamento do seu processo MCMV (atualmente em *${etapa}*). Tem alguma novidade aí da sua parte? Já faz ${f.dias_parado} dia${f.dias_parado === 1 ? '' : 's'} sem movimento.`
    } else {
      corpo = `Oi ${nome}, tudo bem? Aqui é da EDR. Tô passando pra avançar com sua casa pelo MCMV. Pra darmos o próximo passo, precisamos do seguinte:\n`

      if (f.docs_faltando?.length) {
        const itens = f.docs_faltando.map(d => `• ${labelDoc(d)}`).join('\n')
        corpo += `\n📄 *Faltando entregar:*\n${itens}\n`
      }
      if (f.docs_recusados?.length) {
        const itens = f.docs_recusados.map(d => `• ${labelDoc(d)} (precisa refazer)`).join('\n')
        corpo += `\n🚫 *Recusado anteriormente:*\n${itens}\n`
      }
      if (f.docs_vencidos?.length) {
        const itens = f.docs_vencidos.map(d => `• ${labelDoc(d)}`).join('\n')
        corpo += `\n⏰ *Vencido (renovar):*\n${itens}\n`
      }
      if (f.impedimentos?.length) {
        const itens = f.impedimentos.map(i => `• ${labelImp(i)}`).join('\n')
        corpo += `\n⚠️ *Pendência:*\n${itens}\n`
      }

      corpo += `\nConsegue me mandar/resolver até amanhã? Qualquer dúvida me chama!`
    }

    return corpo
  }

  // ─── Renderers ──────────────────────────────────────────────────
  function renderHero(briefing) {
    const agora = new Date()
    const sau = saudacao(agora.getHours())
    const nome = briefing.usuario_nome || u?.nome || u?.email || 'usuário'
    document.getElementById('hero-greeting').innerHTML = `${sau}, ${escapeHtml(nome)} 🌿`

    const dia = dataExtenso(agora)
    const cobrar = briefing.cobrar_hoje_total
    const tarefasHoje = briefing.tarefas_hoje
    let partes = [`Hoje é ${dia}.`]
    if (cobrar > 0) partes.push(`Você tem <b>${cobrar} ${cobrar === 1 ? 'família' : 'famílias'}</b> precisando de ação`)
    else partes.push(`Nenhuma família urgente`)
    if (tarefasHoje > 0) partes.push(`e <b>${tarefasHoje} ${tarefasHoje === 1 ? 'tarefa' : 'tarefas'}</b> vencendo hoje.`)
    else partes[partes.length-1] += '.'
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
    elBadge.innerHTML = reds > 0
      ? `<span class="badge-fire">${reds} ${reds === 1 ? 'crítica' : 'críticas'}</span>`
      : `<span class="badge-attn">${yellows} atenção</span>`
    elSub.textContent = `${total} ${total === 1 ? 'família' : 'famílias'} — ordenadas por etapa + gravidade`

    const exibir = _expandido ? lista : lista.slice(0, 3)
    elLista.innerHTML = exibir.map(f => renderFamCard(f)).join('')

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

  function renderFamCard(f) {
    const stage = LABEL_ETAPA_CURTO[f.status_kanban] || f.status_kanban
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

    // Pendências
    const faltando = f.docs_faltando || []
    const recusados = f.docs_recusados || []
    const vencidos = f.docs_vencidos || []
    const imps = f.impedimentos || []
    const tudoOk = !faltando.length && !recusados.length && !vencidos.length && !imps.length

    const linhasPend = []
    if (faltando.length) {
      const txt = faltando.slice(0, 5).map(d => `<b>${escapeHtml(labelDoc(d))}</b>`).join(' · ')
      const resto = faltando.length > 5 ? ` <span style="opacity:.7">+${faltando.length - 5} outros</span>` : ''
      linhasPend.push(`<div class="pend-row"><span class="pend-label y">FALTA</span><span class="pend-items">${txt}${resto}</span></div>`)
    }
    if (recusados.length) {
      const txt = recusados.slice(0, 5).map(d => `<b>${escapeHtml(labelDoc(d))}</b>`).join(' · ')
      linhasPend.push(`<div class="pend-row"><span class="pend-label r">RECUSADO</span><span class="pend-items">${txt}</span></div>`)
    }
    if (vencidos.length) {
      const txt = vencidos.slice(0, 5).map(d => `<b>${escapeHtml(labelDoc(d))}</b>`).join(' · ')
      linhasPend.push(`<div class="pend-row"><span class="pend-label y">VENCIDO</span><span class="pend-items">${txt}</span></div>`)
    }
    if (imps.length) {
      const txt = imps.slice(0, 3).map(i => `<b>${escapeHtml(labelImp(i))}</b>`).join(' · ')
      linhasPend.push(`<div class="pend-row"><span class="pend-label b">BLOQUEIO</span><span class="pend-items">${txt}</span></div>`)
    }

    const pendBloco = tudoOk
      ? `<div class="fam-tudo-ok">✓ Sem pendências de doc — provavelmente travado na etapa <b>${stage}</b>. Cobrar andamento.</div>`
      : `<div class="fam-pendencias">${linhasPend.join('')}</div>`

    const id = escapeHtml(f.id)
    return `
      <div class="fam-card" data-fam-id="${id}">
        <div class="fam-head">
          <div class="fam-avatar">${iniciais(f.nome)}</div>
          <div>
            <a class="fam-name-link" href="ficha.html?id=${id}">${escapeHtml(f.nome)}</a>
            <div class="fam-meta">${escapeHtml(meta)}</div>
          </div>
          <span class="fam-tag ${f.status_kanban}">${stage}</span>
          <span class="fam-days ${diasClass}">${diasLabel}</span>
        </div>

        ${pendBloco}

        <div class="fam-actions">
          <button class="fam-act whats" data-act="whats" data-fam-id="${id}" title="Abre o WhatsApp com a mensagem já pronta">💬 Abrir Whats</button>
          <button class="fam-act primary" data-act="copiar" data-fam-id="${id}" title="Copia a mensagem pro clipboard">📋 Copiar</button>
          <button class="fam-act success" data-act="cobrei" data-fam-id="${id}" title="Registra cobrança no histórico e tira da lista por 3 dias">✓ Cobrei agora</button>
          <a class="fam-act" href="ficha.html?id=${id}">📄 Ver ficha</a>
        </div>
      </div>
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

  // ─── Toast flash ────────────────────────────────────────────────
  function flashToast(texto) {
    const t = document.createElement('div')
    t.className = 'toast-flash'
    t.textContent = texto
    document.body.appendChild(t)
    setTimeout(() => t.remove(), 2400)
  }

  // ─── Ações ──────────────────────────────────────────────────────
  // Normaliza CRLF → LF (Whats Desktop trata CRLF como parágrafo único)
  function normalizarQuebrasLinha(s) {
    return (s || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  }

  // Sanitiza telefone pra wa.me: só dígitos, com DDI 55 BR
  function telefoneParaWhats(tel) {
    if (!tel) return null
    let d = String(tel).replace(/\D/g, '')
    if (d.length < 10) return null
    // Se já tem 12-13 dígitos (DDI incluso), usa direto. Senão, adiciona 55.
    if (d.length === 10 || d.length === 11) d = '55' + d
    return d
  }

  async function copiarMensagem(famId, btnEl) {
    const f = (_dados?.cobrar_hoje?.lista || []).find(x => x.id === famId)
    if (!f) return
    const msg = normalizarQuebrasLinha(gerarMensagemPadrao(f))
    try {
      await navigator.clipboard.writeText(msg)
      flashToast(`📋 Mensagem da ${primeiroNome(f.nome)} copiada — cola no Whats`)
    } catch (err) {
      // Fallback pra contextos sem clipboard API (http antigo)
      const ta = document.createElement('textarea')
      ta.value = msg
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch {}
      ta.remove()
      flashToast('📋 Mensagem copiada')
    }
  }

  // Abre WhatsApp Web/App com mensagem já preenchida (zero copy-paste)
  function abrirWhatsApp(famId, btnEl) {
    const f = (_dados?.cobrar_hoje?.lista || []).find(x => x.id === famId)
    if (!f) return
    const tel = telefoneParaWhats(f.telefone)
    if (!tel) {
      flashToast('❌ Telefone inválido — verifique a ficha da família')
      return
    }
    const msg = normalizarQuebrasLinha(gerarMensagemPadrao(f))
    const url = `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function registrarCobranca(famId, btnEl) {
    if (!famId) return
    btnEl.disabled = true
    const txtOrig = btnEl.textContent
    btnEl.textContent = '⏳ Registrando...'
    try {
      const res = await sbRpc('crm_registrar_cobranca', { p_cliente_id: famId, p_canal: 'whatsapp' })
      if (!res?.ok) throw new Error('Falha ao registrar')
      // Remove o card otimisticamente (volta no próximo refresh)
      const card = document.querySelector(`.fam-card[data-fam-id="${famId}"]`)
      if (card) {
        card.style.opacity = '.4'
        card.style.pointerEvents = 'none'
      }
      flashToast('✓ Cobrança registrada — família sai da lista por enquanto')
      // Atualiza dados depois de 1s pra dar feedback visual
      setTimeout(() => dashboardCarregar(), 1000)
    } catch (err) {
      btnEl.disabled = false
      btnEl.textContent = txtOrig
      console.error(err)
      flashToast('❌ Erro ao registrar: ' + (err.message || 'tente novamente'))
    }
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

  // Delegação de clicks na lista de famílias
  document.addEventListener('click', e => {
    const tgt = e.target.closest('[data-act]')
    if (tgt) {
      e.preventDefault()
      const act = tgt.dataset.act
      const famId = tgt.dataset.famId
      if (act === 'copiar') return copiarMensagem(famId, tgt)
      if (act === 'whats') return abrirWhatsApp(famId, tgt)
      if (act === 'cobrei') return registrarCobranca(famId, tgt)
    }
    if (e.target && e.target.id === 'cobrar-toggle') {
      e.preventDefault()
      toggleExpandir()
    }
  })

  dashboardCarregar()
  setInterval(dashboardCarregar, REFRESH_MS)
  setInterval(renderRefreshInfo, 30 * 1000)
})()
