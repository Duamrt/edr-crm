// EDR CRM — Pré-ficha de conferência: organiza conversa colada do WhatsApp
// Origem: demo aprovada "DEMO-CRM-conversa-vira-ficha" (2026-08-04).
// Contrato (ver docs/redesign/10-PREFICHA-WHATSAPP.md):
//   - SEM IA, SEM chamada de rede, SEM gravação automática — leitura por regra simples.
//   - Toda sugestão aponta a evidência (termo e/ou linha da conversa) que a gerou.
//   - Rótulos oficiais vêm de utils.js (DOC_LABEL, IMPEDIMENTO_LABEL, KANBAN_LABEL) — fonte única.
//   - Render só com createElement/textContent — conversa colada nunca passa por innerHTML.

// Termos de detecção (vocabulário aprovado na demo; chaves = tipos reais do CRM)
const PREFICHA_DOC_TERMOS = {
  comp_renda:      ['comprovante de renda','extrato banc','contracheque','holerite'],
  comp_residencia: ['comprovante de resid','conta de luz','conta de energia'],
  cadunico:        ['cadunico','cadúnico','cad unico'],
  ctps:            ['carteira assinada','carteira de trabalho','ctps'],
  certidao:        ['certidão de nasc','certidao de nasc','certidão de casa','certidao de casa'],
  fgts:            ['fgts'],
  rg_cpf_titular:  [' rg ','cpf']
}

const PREFICHA_IMP_TERMOS = {
  nome_sujo:      ['serasa','spc','nome sujo','restrição','restricao','negativado'],
  cadmut:         ['cadmut','já foi proprietário','ja foi proprietario'],
  score_baixo:    ['score baixo','score'],
  fgts_bloqueado: ['fgts bloqueado']
}

const PREFICHA_ETAPA_TERMOS = {
  correspondente: ['correspondente','análise do banco','analise do banco'],
  documentacao:   ['documento','comprovante','certidão','certidao'],
  triagem:        ['cadunico','cadúnico','cras','faixa']
}

// Cidades aprovadas para detecção (decisão Duam 2026-08-04): somente estas 4
const PREFICHA_CIDADES = { jupi: 'Jupi', garanhuns: 'Garanhuns', lajedo: 'Lajedo', jucati: 'Jucati' }

// Situações sugeridas de documento (rótulos aprovados na demo).
// ATENÇÃO: são sugestões de leitura, ≠ status do checklist crm_documentos
// (pendente/entregue/recusado/nao_aplicavel/vencido). A pré-ficha NÃO altera o checklist.
const PREFICHA_SITUACOES = ['Pendente', 'Recebido / a enviar', 'Recusado', 'Não se aplica']

const _PF_RE_ENVIO = /(vou mandar|vou levar|mando|consigo pegar|pode mandar|manda pra mim|vai no|vou la|vou lá)/
const _PF_RE_COMPROMISSO = /(vou|mando|consigo|levo|manda pra mim|vai no|vou la|vou lá|me avisa|pode mandar)/i
const _PF_PRAZOS = [
  ['amanha','amanhã'], ['amanhã','amanhã'], ['hj','hoje'], ['hoje','hoje'],
  ['sabado','sábado'], ['sábado','sábado'], ['segunda','segunda-feira'],
  ['terça','terça-feira'], ['terca','terça-feira'], ['15 dias','em ~15 dias']
]

function _pfLabel(mapa, chave) {
  return (mapa && mapa[chave]) || chave
}

// Situação sugerida: negação na linha da menção > recusa > compromisso de envio adiante > pendente
function _pfSituacaoDoc(lower, idx) {
  const l = lower[idx]
  if (/(nao tem|não tem|nao possui|não possui)/.test(l)) return 'Não se aplica'
  if (/(recusad|nao serve|não serve|vencid)/.test(l)) return 'Recusado'
  for (let i = idx; i < lower.length; i++)
    if (_PF_RE_ENVIO.test(lower[i])) return 'Recebido / a enviar'
  return 'Pendente'
}

function _pfDetectarDocs(linhas, lower) {
  const out = []
  const labels = typeof DOC_LABEL !== 'undefined' ? DOC_LABEL : null
  for (const [tipo, termos] of Object.entries(PREFICHA_DOC_TERMOS)) {
    for (let i = 0; i < lower.length; i++) {
      const termo = termos.find(t => lower[i].includes(t))
      if (termo) {
        out.push({
          tipo,
          rot: _pfLabel(labels, tipo),
          situacao: _pfSituacaoDoc(lower, i),
          termo: termo.trim(),
          linha: linhas[i].trim(),
          idx: i  // posição na conversa — usada pra ordenar evidências cronologicamente
        })
        break
      }
    }
  }
  return out
}

function _pfDetectarImpedimentos(linhas, lower) {
  const out = []
  const labels = typeof IMPEDIMENTO_LABEL !== 'undefined' ? IMPEDIMENTO_LABEL : null
  for (const [tipo, termos] of Object.entries(PREFICHA_IMP_TERMOS)) {
    for (let i = 0; i < lower.length; i++) {
      const termo = termos.find(t => lower[i].includes(t))
      if (termo) {
        out.push({ tipo, rot: _pfLabel(labels, tipo), termo, linha: linhas[i].trim(), idx: i })
        break
      }
    }
  }
  return out
}

// Núcleo puro (sem DOM): conversa colada → sugestões com evidência.
// Retorna null para entrada vazia; nunca lança para texto malformado.
function prefichaOrganizar(bruto) {
  if (bruto == null || !String(bruto).trim()) return null
  bruto = String(bruto)
  const txt = bruto.toLowerCase()
  // Normaliza cada linha: remove marcador de lista colado junto (•, -, *, >, –)
  // — conversa copiada de outro app às vezes chega com bullets, e o marcador
  // quebrava a separação autor:mensagem ("• [14" virava nome do autor)
  const linhas = bruto.split('\n')
    .map(l => l.replace(/^\s*[•·◦▪*>–—-]+\s*/, ''))
    .filter(l => l.trim())
  const lower = linhas.map(l => l.toLowerCase())

  // Cliente — primeiro nome (padrão "[hh:mm] Nome:") que não seja a operadora
  let cliente = null
  for (const l of linhas) {
    const m = l.match(/^\[?[\d:\s\]]*\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ]+(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ]+)?)\s*:/)
    if (m && !/elyda/i.test(m[1])) { cliente = m[1].trim(); break }
  }

  // Telefone — só se estiver escrito na conversa; nunca inventa
  const telM = bruto.match(/(?:\(?\d{2}\)?\s?)?9?\d{4}[-\s]?\d{4}/)
  const telefone = telM ? telM[0].trim() : null

  // Cidade — somente as aprovadas em PREFICHA_CIDADES
  let cidade = null
  for (const [k, v] of Object.entries(PREFICHA_CIDADES))
    if (txt.includes(k)) { cidade = v; break }

  const docs = _pfDetectarDocs(linhas, lower)
  const impedimentos = _pfDetectarImpedimentos(linhas, lower)

  // Etapa sugerida — guarda termo e linha que dispararam a regra (auditável)
  let etapa = null
  const kanbanLabels = typeof KANBAN_LABEL !== 'undefined' ? KANBAN_LABEL : null
  for (const [key, termos] of Object.entries(PREFICHA_ETAPA_TERMOS)) {
    const termo = termos.find(t => txt.includes(t))
    if (termo) {
      const i = lower.findIndex(l => l.includes(termo))
      etapa = { key, rot: _pfLabel(kanbanLabels, key), termo, linha: i >= 0 ? linhas[i].trim() : null }
      break
    }
  }

  // Próxima ação — última frase de compromisso, com autor e linha de origem
  let acao = null
  for (let i = linhas.length - 1; i >= 0; i--) {
    if (_PF_RE_COMPROMISSO.test(linhas[i])) {
      const linha = linhas[i].trim()
      const m = linha.match(/^\[?[\d:\s\]]*\s*([^:]{1,30}):\s*(.*)$/)
      const autor = m ? m[1].trim() : null
      acao = {
        texto: m ? m[2].trim() : linha,
        autor,
        responsavel: autor ? (/elyda/i.test(autor) ? 'Equipe EDR' : 'Família') : null,
        linha,
        idx: i
      }
      break
    }
  }

  // Prazo — procura primeiro na linha da próxima ação, depois na conversa inteira
  let prazo = null
  const bases = [
    { base: acao ? acao.linha.toLowerCase() : '', fonte: 'linha da próxima ação' },
    { base: txt, fonte: 'conversa' }
  ]
  for (const { base, fonte } of bases) {
    for (const [k, v] of _PF_PRAZOS)
      if (base.includes(k)) { prazo = { valor: v, termo: k, fonte }; break }
    if (prazo) break
  }

  return { totalMensagens: linhas.length, cliente, telefone, cidade, etapa, docs, impedimentos, acao, prazo }
}

// Resumo em texto para o campo Observações (campo real do cadastro).
// Padrão fixo aprovado pelo Duam (2026-08-04): cabeçalho + seções separadas por
// linha em branco, decisão operacional primeiro, evidências agrupadas no fim,
// SEM ruído técnico ("Mensagens lidas", "Gerado sem IA" etc).
// Vai por textarea/textContent — nunca por innerHTML.
function prefichaMontarResumo(r) {
  if (!r) return ''
  const corta = s => (s && s.length > 110 ? s.slice(0, 107) + '...' : s)
  const li = []
  li.push('[PRÉ-FICHA WHATSAPP — CONFERIR]')
  li.push('')
  li.push('Etapa sugerida: ' + (r.etapa ? r.etapa.rot : '—'))
  li.push('Documentos:')
  if (r.docs.length) r.docs.forEach(d => li.push(`• ${d.rot} — ${d.situacao}`))
  else li.push('• nenhum documento citado')
  li.push('')
  li.push('Impedimentos: ' + (r.impedimentos.length
    ? r.impedimentos.map(i => i.rot).join(', ')
    : 'Nenhum sinal de alerta'))
  if (r.cidade) li.push('Cidade citada: ' + r.cidade)
  li.push('Próxima ação: ' + (r.acao ? corta(r.acao.texto) : '—'))
  li.push('Prazo: ' + (r.prazo ? r.prazo.valor : '—'))
  li.push('Responsável sugerido: ' + (r.acao && r.acao.responsavel
    ? r.acao.responsavel + (r.acao.autor ? ' — ' + r.acao.autor : '')
    : '—'))

  // Evidências reais em ORDEM CRONOLÓGICA (posição da linha na conversa),
  // deduplicadas — uma linha que sustenta vários itens aparece uma vez
  const porLinha = new Map()
  const add = item => {
    if (!item || !item.linha) return
    const idx = typeof item.idx === 'number' ? item.idx : Infinity
    if (!porLinha.has(item.linha) || idx < porLinha.get(item.linha)) porLinha.set(item.linha, idx)
  }
  r.docs.forEach(add)
  r.impedimentos.forEach(add)
  if (r.acao) add(r.acao)
  const evidencias = [...porLinha.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([linha]) => corta(linha))
  if (evidencias.length) {
    li.push('')
    li.push('Evidências da conversa:')
    evidencias.forEach(e => li.push('• ' + e))
  }
  return li.join('\n')
}

// Decide o que a transferência pode preencher. Regra de precedência: DECISÃO HUMANA VENCE.
// - nome/telefone: só se o campo estiver vazio.
// - status (etapa): só se a operadora NUNCA mexeu no select (statusManual=false) e a
//   pré-ficha ainda não tiver aplicado antes (statusAplicadoPelaPreficha=false).
// - observações: anexa o resumo uma única vez (dedup por conteúdo).
// Função pura (sem DOM) para ser testável em node; familia.html só aplica o retorno.
// campos: { nome, telefone, status, observacoes } — valores atuais do formulário
// flags:  { statusManual, statusAplicadoPelaPreficha }
// Retorna { set: {nome?, telefone?, status?, observacoes?}, feitos: [..], statusAplicadoPelaPreficha }
function prefichaTransferencia(r, campos, flags) {
  const set = {}
  const feitos = []
  let statusAplicado = !!(flags && flags.statusAplicadoPelaPreficha)
  if (!r) return { set, feitos, statusAplicadoPelaPreficha: statusAplicado }

  if (r.cliente && !String(campos.nome || '').trim()) {
    set.nome = r.cliente
    feitos.push('Nome')
  }
  if (r.telefone && !String(campos.telefone || '').trim()) {
    set.telefone = r.telefone
    feitos.push('Telefone')
  }
  const manual = !!(flags && flags.statusManual)
  if (r.etapa && !manual && !statusAplicado) {
    // A primeira transferência ELEGÍVEL trava reaplicação futura, mesmo quando a
    // sugestão coincide com o status exibido (Triagem→Triagem) e o select não muda.
    statusAplicado = true
    if (campos.status !== r.etapa.key) {
      set.status = r.etapa.key
      feitos.push('Status → ' + r.etapa.rot)
    }
  }
  const resumo = prefichaMontarResumo(r)
  if (!String(campos.observacoes || '').includes(resumo)) {
    set.observacoes = (String(campos.observacoes || '').trim()
      ? String(campos.observacoes).trimEnd() + '\n\n'
      : '') + resumo
    feitos.push('Observações (resumo com evidências)')
  }
  return { set, feitos, statusAplicadoPelaPreficha: statusAplicado }
}

// ── Render DOM — createElement/textContent, nunca innerHTML ──────────────
function _pfEl(tag, cls, texto) {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (texto != null) n.textContent = texto
  return n
}

function _pfCampo(rotulo, filho) {
  const c = _pfEl('div', 'pf-campo')
  c.appendChild(_pfEl('div', 'pf-rot', rotulo))
  c.appendChild(filho)
  return c
}

// Reusa as classes .badge existentes do CRM (style.css) — zero CSS novo pros chips
const _PF_CHIP_CLASSE = {
  'Pendente': 'badge badge-yellow',
  'Recebido / a enviar': 'badge badge-green',
  'Recusado': 'badge badge-red',
  'Não se aplica': 'badge badge-gray'
}

function prefichaRenderizar(r, alvo) {
  alvo.replaceChildren()
  if (!r) {
    alvo.appendChild(_pfEl('div', 'pf-nao', 'Cole uma conversa primeiro.'))
    return
  }
  const ausente = t => _pfEl('div', 'pf-nao', t)
  const valor = (t, forte) => _pfEl('div', forte ? 'pf-val pf-forte' : 'pf-val', t)
  const mini = t => _pfEl('div', 'pf-mini', t)

  alvo.appendChild(_pfEl('div', 'pf-barra',
    `Pré-ficha sugerida a partir de ${r.totalMensagens} mensagens · nada foi salvo · confira cada campo`))

  alvo.appendChild(_pfCampo('Cliente',
    r.cliente ? valor(r.cliente, true) : ausente('não identificado na conversa')))
  alvo.appendChild(_pfCampo('Telefone / WhatsApp',
    r.telefone ? valor(r.telefone) : ausente('não identificado na conversa')))
  alvo.appendChild(_pfCampo('Cidade',
    r.cidade ? valor(r.cidade) : ausente('não identificada na conversa')))

  const etapaBox = _pfEl('div')
  if (r.etapa) {
    etapaBox.appendChild(valor(r.etapa.rot))
    etapaBox.appendChild(mini(`Sugerida porque a conversa menciona "${r.etapa.termo}". Regra simples — confira.`))
  } else {
    etapaBox.appendChild(ausente('não deu pra inferir'))
  }
  alvo.appendChild(_pfCampo('Etapa sugerida', etapaBox))

  const docsBox = _pfEl('div')
  if (r.docs.length) {
    r.docs.forEach(d => {
      const row = _pfEl('div', 'pf-docrow')
      const nome = _pfEl('span', 'pf-docnome', d.rot)
      nome.title = d.linha  // evidência da menção no hover
      row.appendChild(nome)
      row.appendChild(_pfEl('span', _PF_CHIP_CLASSE[d.situacao] || 'badge badge-gray', d.situacao))
      docsBox.appendChild(row)
    })
    docsBox.appendChild(mini('Situação sugerida pela conversa — confirme cada documento. Estados: ' + PREFICHA_SITUACOES.join(' · ')))
  } else {
    docsBox.appendChild(ausente('nenhum documento mencionado'))
  }
  alvo.appendChild(_pfCampo('Documentos — situação sugerida', docsBox))

  const impBox = _pfEl('div')
  if (r.impedimentos.length) {
    r.impedimentos.forEach(i => {
      const tag = _pfEl('span', 'badge badge-red', i.rot)
      tag.title = i.linha
      impBox.appendChild(tag)
      impBox.appendChild(mini(`termo "${i.termo}" — ${i.linha}`))
    })
  } else {
    impBox.appendChild(_pfEl('span', 'badge badge-green', 'nenhum sinal de alerta'))
  }
  alvo.appendChild(_pfCampo('Impedimentos detectados', impBox))

  alvo.appendChild(_pfCampo('Próxima ação',
    r.acao ? valor(r.acao.texto) : ausente('nada combinado explicitamente')))
  alvo.appendChild(_pfCampo('Responsável',
    (r.acao && r.acao.responsavel)
      ? valor(r.acao.responsavel + (r.acao.autor ? ' — ' + r.acao.autor : ''))
      : ausente('não identificado')))
  alvo.appendChild(_pfCampo('Prazo',
    r.prazo ? valor(r.prazo.valor, true) : ausente('sem prazo citado')))
  alvo.appendChild(_pfCampo('Mensagem de origem / evidência',
    r.acao ? _pfEl('div', 'pf-evid', r.acao.linha) : ausente('nenhuma mensagem de compromisso encontrada')))
}

// Expor global (padrão do projeto — scripts sem ES modules)
if (typeof window !== 'undefined') {
  window.prefichaOrganizar = prefichaOrganizar
  window.prefichaMontarResumo = prefichaMontarResumo
  window.prefichaTransferencia = prefichaTransferencia
  window.prefichaRenderizar = prefichaRenderizar
}
