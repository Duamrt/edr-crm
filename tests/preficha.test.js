// Testes — Pré-ficha WhatsApp (js/preficha.js)
// Roda sem framework: node tests/preficha.test.js
//
// Cobre: as 3 conversas aprovadas na demo (Marluce, José Ricardo, Cleide),
// entrada vazia/malformada, texto com HTML malicioso, cidades aprovadas,
// telefone escrito na conversa e conteúdo do resumo para Observações.

const fs = require('fs')
const path = require('path')
const vm = require('vm')

// Carrega utils.js + preficha.js num contexto isolado (mesmo stub do triagem-renda.test.js)
const noop = () => {}
const elStub = new Proxy({}, {
  get: (_, p) => (p === 'style' || p === 'dataset' || p === 'classList')
    ? new Proxy({}, { get: () => noop, set: () => true })
    : (typeof p === 'string' && ['textContent','innerHTML','value','id'].includes(p) ? '' : noop)
})
const ctx = {
  console, setTimeout, clearTimeout, Date, Math, JSON,
  window: { addEventListener: noop, location: { href: '' } },
  document: {
    addEventListener: noop, querySelector: () => null, querySelectorAll: () => [],
    getElementById: () => null, createElement: () => elStub, body: elStub
  },
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop }
}
vm.createContext(ctx)
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'utils.js'), 'utf8'), ctx)
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'preficha.js'), 'utf8'), ctx)

const organizar = s => vm.runInContext('prefichaOrganizar(' + JSON.stringify(s) + ')', ctx)
const resumo = s => vm.runInContext('prefichaMontarResumo(prefichaOrganizar(' + JSON.stringify(s) + '))', ctx)
const CIDADES = vm.runInContext('PREFICHA_CIDADES', ctx)

let passou = 0, falhou = 0
function t(nome, fn) {
  try { fn(); console.log(`  ✅ ${nome}`); passou++ }
  catch (e) { console.log(`  ❌ ${nome}\n     ${e.message}`); falhou++ }
}
function eq(atual, esperado, msg) {
  const a = JSON.stringify(atual), e = JSON.stringify(esperado)
  if (a !== e) throw new Error(`${msg || ''} esperado ${e}, veio ${a}`)
}
function ok(v, msg) { if (!v) throw new Error(msg || 'esperado truthy') }
function notOk(v, msg) { if (v) throw new Error(msg || 'esperado falsy') }

// ── Conversas aprovadas na demo (2026-08-04) ─────────────────────────────
const CONVERSA_MARLUCE = `[14:02] Elyda: Boa tarde, dona Marluce! Aqui é a Elyda da EDR Engenharia
[14:15] Marluce: boa tarde
[14:15] Marluce: oi
[14:16] Elyda: Consegui olhar seu cadastro aqui. Falta o comprovante de renda do seu esposo ainda
[14:18] Marluce: pois é ele trabalha por conta propria nao tem carteira assinada
[14:19] Elyda: Sem problema! Nesse caso a gente usa extrato bancário dos últimos 3 meses
[14:20] Marluce: ah entendi. consigo pegar no banco sabado
[14:21] Elyda: Perfeito. E o comprovante de residência tambem ta faltando
[14:22] Marluce: esse eu tenho, a conta de luz serve?
[14:22] Elyda: Serve sim, pode mandar aqui mesmo
[14:23] Marluce: ta bom vou mandar hj a noite
[14:30] Elyda: Combinado! Qualquer coisa me chama`

const CONVERSA_JOSE = `[09:41] José Ricardo: bom dia
[09:41] José Ricardo: elyda voce viu meu processo?
[09:52] Elyda: Bom dia seu José! Vi sim. Olha, saiu a análise do correspondente
[09:53] Elyda: Infelizmente apareceu uma restrição no seu nome, Serasa
[09:55] José Ricardo: nossa mas eu paguei aquela divida ano passado
[09:56] Elyda: Pode ser que ainda não tenha dado baixa. O senhor tem o comprovante de pagamento?
[09:58] José Ricardo: tenho sim guardei
[09:59] Elyda: Ótimo, manda pra mim que eu levo pro correspondente pedir revisão
[10:01] José Ricardo: e vai demorar muito?
[10:03] Elyda: Costuma levar uns 15 dias pra atualizar. Mas vamos tentando
[10:04] José Ricardo: ta certo. mando amanha que hj to no trabalho`

const CONVERSA_CLEIDE = `[18:30] Cleide: oi elyda boa noite, tudo bem?
[18:45] Elyda: Boa noite Cleide! Tudo sim e você?
[18:46] Cleide: to boa. oh eu queria saber uma coisa
[18:46] Cleide: minha irma falou que existe um cadastro que ajuda, o cadunico
[18:47] Cleide: eu tenho mas ta desatualizado de 2022
[18:49] Elyda: Ah, isso é importante sim! Precisa atualizar no CRAS
[18:50] Elyda: Com o CadÚnico em dia você pode se enquadrar na Faixa 1, que tem subsídio maior
[18:51] Cleide: serio? e como faço
[18:52] Elyda: Vai no CRAS de Jupi com RG, CPF e comprovante de residência. Pode ir sem agendar
[18:53] Cleide: vou la na segunda entao
[18:53] Cleide: obrigada viu
[18:54] Elyda: Disponha! Depois me avisa que atualizou pra eu seguir aqui`

console.log('\n=== Conversa 1 — Marluce (documentos com situação) ===')
{
  const r = organizar(CONVERSA_MARLUCE)
  t('cliente = Marluce', () => eq(r.cliente, 'Marluce'))
  t('telefone não inventado (null)', () => eq(r.telefone, null))
  t('cidade não inventada (null)', () => eq(r.cidade, null))
  t('etapa sugerida = documentacao (chave real do kanban)', () => eq(r.etapa.key, 'documentacao'))
  t('etapa com rótulo oficial KANBAN_LABEL', () => eq(r.etapa.rot, 'Documentação'))
  t('etapa auditável: termo "comprovante"', () => eq(r.etapa.termo, 'comprovante'))
  t('3 documentos detectados', () => eq(r.docs.length, 3))
  t('comp_renda → Recebido / a enviar', () =>
    eq(r.docs.find(d => d.tipo === 'comp_renda').situacao, 'Recebido / a enviar'))
  t('comp_residencia → Recebido / a enviar', () =>
    eq(r.docs.find(d => d.tipo === 'comp_residencia').situacao, 'Recebido / a enviar'))
  t('ctps → Não se aplica (esposo sem carteira assinada)', () =>
    eq(r.docs.find(d => d.tipo === 'ctps').situacao, 'Não se aplica'))
  t('doc usa rótulo oficial DOC_LABEL', () =>
    eq(r.docs.find(d => d.tipo === 'comp_renda').rot, 'Comprovante de renda'))
  t('doc aponta a linha de evidência', () =>
    ok(r.docs.find(d => d.tipo === 'ctps').linha.includes('nao tem carteira assinada')))
  t('sem impedimentos', () => eq(r.impedimentos.length, 0))
  t('próxima ação da Marluce → responsável Família', () => eq(r.acao.responsavel, 'Família'))
  t('autor da ação = Marluce', () => eq(r.acao.autor, 'Marluce'))
  t('prazo = hoje (lido da linha da ação)', () => {
    eq(r.prazo.valor, 'hoje'); eq(r.prazo.fonte, 'linha da próxima ação')
  })
  t('evidência = linha original', () => ok(r.acao.linha.includes('[14:23] Marluce:')))
}

console.log('\n=== Conversa 2 — José Ricardo (impedimento Serasa) ===')
{
  const r = organizar(CONVERSA_JOSE)
  t('cliente = José Ricardo (nome composto)', () => eq(r.cliente, 'José Ricardo'))
  t('etapa = correspondente, termo auditável', () => {
    eq(r.etapa.key, 'correspondente'); eq(r.etapa.termo, 'correspondente')
  })
  t('nenhum documento do vocabulário citado', () => eq(r.docs.length, 0))
  t('impedimento nome_sujo detectado', () => eq(r.impedimentos[0].tipo, 'nome_sujo'))
  t('impedimento com rótulo oficial IMPEDIMENTO_LABEL', () =>
    eq(r.impedimentos[0].rot, 'Nome sujo (Serasa/SPC)'))
  t('impedimento aponta linha de evidência (Serasa)', () =>
    ok(r.impedimentos[0].linha.toLowerCase().includes('serasa')))
  t('prazo = amanhã (linha da ação, não "hoje" da mesma linha)', () =>
    eq(r.prazo.valor, 'amanhã'))
  t('responsável = Família (José Ricardo)', () => eq(r.acao.responsavel, 'Família'))
}

console.log('\n=== Conversa 3 — Cleide (cidade + CadÚnico) ===')
{
  const r = organizar(CONVERSA_CLEIDE)
  t('cliente = Cleide', () => eq(r.cliente, 'Cleide'))
  t('cidade = Jupi (aprovada)', () => eq(r.cidade, 'Jupi'))
  t('cadunico detectado → Recebido / a enviar', () =>
    eq(r.docs.find(d => d.tipo === 'cadunico').situacao, 'Recebido / a enviar'))
  t('rg_cpf_titular detectado via "cpf"', () =>
    ok(r.docs.some(d => d.tipo === 'rg_cpf_titular')))
  t('sem impedimentos → nenhum falso alerta', () => eq(r.impedimentos.length, 0))
  t('responsável = Equipe EDR (última frase de compromisso é da Elyda)', () =>
    eq(r.acao.responsavel, 'Equipe EDR'))
  t('prazo = segunda-feira (fallback conversa)', () => {
    eq(r.prazo.valor, 'segunda-feira'); eq(r.prazo.fonte, 'conversa')
  })
}

console.log('\n=== Entrada vazia / malformada (não pode quebrar) ===')
{
  t('string vazia → null', () => eq(organizar(''), null))
  t('só espaços/linhas → null', () => eq(organizar('   \n  \n '), null))
  t('null → null', () => eq(vm.runInContext('prefichaOrganizar(null)', ctx), null))
  t('undefined → null', () => eq(vm.runInContext('prefichaOrganizar(undefined)', ctx), null))
  const r = organizar('oi tudo bem\nsem padrao de whatsapp nenhum aqui')
  t('texto sem padrão: não quebra e conta mensagens', () => eq(r.totalMensagens, 2))
  t('texto sem padrão: cliente null (não inventa)', () => eq(r.cliente, null))
  t('texto sem padrão: etapa null', () => eq(r.etapa, null))
  t('texto sem padrão: sem docs', () => eq(r.docs.length, 0))
  t('resumo de null → string vazia', () =>
    eq(vm.runInContext('prefichaMontarResumo(null)', ctx), ''))
  t('resumo de texto malformado → gera string sem quebrar', () =>
    ok(resumo('qualquer coisa').includes('[PRÉ-FICHA WHATSAPP — CONFERIR]')))
}

console.log('\n=== Texto malicioso (núcleo não interpreta HTML) ===')
{
  const malicioso = '[10:00] <img src=x onerror=alert(1)>: preciso levar meu cpf\n[10:01] Elyda: pode mandar'
  const r = organizar(malicioso)
  t('não quebra com HTML colado', () => ok(r))
  t('tag HTML não vira cliente (regex exige nome com maiúscula)', () => eq(r.cliente, null))
  t('cpf ainda é detectado como documento', () =>
    ok(r.docs.some(d => d.tipo === 'rg_cpf_titular')))
  t('resumo carrega o texto como texto puro (vai pra textarea, nunca innerHTML)', () =>
    ok(resumo(malicioso).length > 0))
}

console.log('\n=== Cidades aprovadas (decisão 2026-08-04) ===')
{
  t('exatamente 4 cidades: jupi, garanhuns, lajedo, jucati', () =>
    eq(Object.keys(CIDADES).sort(), ['garanhuns','jucati','jupi','lajedo']))
  t('Calçado NÃO detecta (removida)', () =>
    eq(organizar('[10:00] Ana: moro em calçado').cidade, null))
  t('São Bento do Una NÃO detecta (removida)', () =>
    eq(organizar('[10:00] Ana: moro em sao bento do una').cidade, null))
  t('Garanhuns detecta', () =>
    eq(organizar('[10:00] Ana: moro em garanhuns').cidade, 'Garanhuns'))
  t('Lajedo detecta', () =>
    eq(organizar('[10:00] Ana: sou de lajedo').cidade, 'Lajedo'))
  t('Jucati detecta', () =>
    eq(organizar('[10:00] Ana: aqui em jucati').cidade, 'Jucati'))
}

console.log('\n=== Linhas coladas com marcador de lista (bug do print 2026-08-04) ===')
{
  // Reproduz o caso real: conversa colada com "• " na frente das linhas
  const comBullets = [
    '• [14:02] Elyda: Boa tarde, dona Marluce! Aqui é a Elyda da EDR Engenharia',
    '• [14:16] Elyda: Falta o comprovante de renda do seu esposo ainda',
    '• [14:23] Marluce: ta bom vou mandar hj a noite'
  ].join('\n')
  const r = organizar(comBullets)
  t('autor não vira "• [14" — responsável = Família — Marluce', () => {
    eq(r.acao.autor, 'Marluce')
    eq(r.acao.responsavel, 'Família')
  })
  t('próxima ação limpa (sem "23]" na frente)', () =>
    eq(r.acao.texto, 'ta bom vou mandar hj a noite'))
  t('cliente detectado mesmo com bullet', () => eq(r.cliente, 'Marluce'))
  t('resumo mostra "Responsável sugerido: Família — Marluce" completo', () =>
    ok(resumo(comBullets).includes('Responsável sugerido: Família — Marluce')))
  t('marcadores variados (-, *, >) também são normalizados', () => {
    const r2 = organizar('- [10:00] Ana: vou mandar o cpf amanha\n> [10:01] Elyda: pode mandar')
    eq(r2.cliente, 'Ana')
    eq(r2.acao ? r2.acao.autor : null, 'Elyda')
  })
}

console.log('\n=== Telefone escrito na conversa ===')
{
  t('detecta (87) 98888-7766', () =>
    eq(organizar('[10:00] Ana Maria: meu numero e (87) 98888-7766').telefone, '(87) 98888-7766'))
  t('detecta 87988887766 colado', () =>
    ok(organizar('[10:00] Ana Maria: chama no 87988887766').telefone))
  t('não inventa telefone de horários/datas', () =>
    eq(organizar('[10:00] Ana: em 15 dias volto, ano 2022 foi ruim').telefone, null))
}

console.log('\n=== Resumo para Observações — padrão fixo aprovado (2026-08-04) ===')
{
  const s = resumo(CONVERSA_MARLUCE)
  t('cabeçalho exato do padrão', () => ok(s.startsWith('[PRÉ-FICHA WHATSAPP — CONFERIR]\n\n')))
  t('etapa sem justificativa técnica (só o rótulo)', () => {
    ok(s.includes('Etapa sugerida: Documentação'))
    notOk(s.includes('porque a conversa menciona'))
  })
  t('documentos em bullets, um por linha', () => {
    ok(s.includes('Documentos:\n• Comprovante de renda — Recebido / a enviar'))
    ok(s.includes('• Carteira de trabalho — Não se aplica'))
  })
  t('impedimentos em linha única quando não há alerta', () =>
    ok(s.includes('Impedimentos: Nenhum sinal de alerta')))
  t('próxima ação, prazo e responsável no bloco operacional', () => {
    ok(s.includes('Próxima ação: ta bom vou mandar hj a noite'))
    ok(s.includes('Prazo: hoje'))
    ok(s.includes('Responsável sugerido: Família — Marluce'))
  })
  t('evidências agrupadas no fim, uma por linha', () => {
    const secao = s.split('Evidências da conversa:')[1]
    ok(secao, 'seção de evidências existe')
    ok(secao.includes('• [14:16] Elyda:'))
    ok(secao.includes('• [14:18] Marluce:'))
    ok(secao.includes('• [14:23] Marluce: ta bom vou mandar hj a noite'))
  })
  t('evidências em ordem cronológica (14:16 → 14:18 → 14:21 → 14:23)', () => {
    const secao = s.split('Evidências da conversa:')[1]
    const pos = h => secao.indexOf('• [' + h + ']')
    ok(pos('14:16') !== -1 && pos('14:18') !== -1 && pos('14:21') !== -1 && pos('14:23') !== -1,
      'todas as 4 evidências presentes')
    ok(pos('14:16') < pos('14:18'), '14:16 antes de 14:18')
    ok(pos('14:18') < pos('14:21'), '14:18 antes de 14:21 (era o bug)')
    ok(pos('14:21') < pos('14:23'), '14:21 antes de 14:23')
  })
  t('sem ruído técnico (Mensagens lidas / Gerado sem IA / fonte do prazo)', () => {
    notOk(s.includes('Mensagens lidas'))
    notOk(s.includes('Gerado sem IA'))
    notOk(s.includes('lido da linha'))
  })
  t('seções separadas por linha em branco', () => {
    ok(s.includes('Não se aplica\n\nImpedimentos:'), 'blank entre docs e bloco operacional')
    ok(s.includes('Família — Marluce\n\nEvidências da conversa:'), 'blank antes das evidências')
  })

  const s2 = resumo(CONVERSA_JOSE)
  t('impedimento listado na linha Impedimentos', () =>
    ok(s2.includes('Impedimentos: Nome sujo (Serasa/SPC)')))
  t('evidência do impedimento preservada na seção final', () =>
    ok(s2.split('Evidências da conversa:')[1].toLowerCase().includes('serasa')))
  t('sem documentos → bullet "nenhum documento citado"', () =>
    ok(s2.includes('Documentos:\n• nenhum documento citado')))

  const s3 = resumo(CONVERSA_CLEIDE)
  t('cidade citada aparece quando detectada', () => ok(s3.includes('Cidade citada: Jupi')))
  t('evidências deduplicadas (1 linha sustenta 3 docs → aparece 1 vez)', () => {
    const secao = s3.split('Evidências da conversa:')[1]
    eq((secao.match(/Vai no CRAS de Jupi/g) || []).length, 1)
  })
}

console.log('\n=== Transferência — decisão humana vence (prefichaTransferencia) ===')
{
  const transferir = (conversa, campos, flags) => vm.runInContext(
    `prefichaTransferencia(prefichaOrganizar(${JSON.stringify(conversa)}), ${JSON.stringify(campos)}, ${JSON.stringify(flags)})`, ctx)
  const vazio = { nome: '', telefone: '', status: 'triagem', observacoes: '' }

  // Caminho 1 — SEM escolha manual: pré-ficha sugere Documentação → preenche
  t('sem escolha manual: status preenchido com documentacao', () => {
    const r = transferir(CONVERSA_MARLUCE, vazio, { statusManual: false, statusAplicadoPelaPreficha: false })
    eq(r.set.status, 'documentacao')
    ok(r.statusAplicadoPelaPreficha, 'flag de aplicado deve subir')
    ok(r.feitos.includes('Status → Documentação'))
  })

  // Caminho 2 — Elyda escolheu Triagem manualmente: pré-ficha sugere Documentação → NÃO muda
  t('escolha manual de Triagem: status NÃO é sobrescrito', () => {
    const r = transferir(CONVERSA_MARLUCE, vazio, { statusManual: true, statusAplicadoPelaPreficha: false })
    eq(r.set.status, undefined, 'set.status:')
    notOk(r.statusAplicadoPelaPreficha, 'não pode marcar como aplicado')
    notOk(r.feitos.some(f => f.startsWith('Status')), 'feitos não pode listar Status')
  })

  // Caminho 3 — segunda transferência não reaplica decisão já aplicada
  t('segunda transferência: não reaplica status já aplicado pela pré-ficha', () => {
    const r = transferir(CONVERSA_MARLUCE, { ...vazio, status: 'triagem' },
      { statusManual: false, statusAplicadoPelaPreficha: true })
    eq(r.set.status, undefined, 'set.status:')
    ok(r.statusAplicadoPelaPreficha, 'flag permanece')
  })

  // Escolha manual depois da primeira aplicação também é respeitada
  t('manual + já aplicado: status intocado', () => {
    const r = transferir(CONVERSA_MARLUCE, { ...vazio, status: 'perdido' },
      { statusManual: true, statusAplicadoPelaPreficha: true })
    eq(r.set.status, undefined)
  })

  // Nome/telefone mantêm regra existente: só se vazios
  t('nome preenchido não é sobrescrito', () => {
    const r = transferir(CONVERSA_MARLUCE, { ...vazio, nome: 'Outro Nome' },
      { statusManual: false, statusAplicadoPelaPreficha: false })
    eq(r.set.nome, undefined)
  })
  t('nome vazio é preenchido', () => {
    const r = transferir(CONVERSA_MARLUCE, vazio, { statusManual: false, statusAplicadoPelaPreficha: false })
    eq(r.set.nome, 'Marluce')
  })
  t('telefone só se vazio', () => {
    const conversaTel = '[10:00] Ana Maria: chama no (87) 98888-7766, vou mandar amanha'
    const cheio = transferir(conversaTel, { ...vazio, telefone: '(87) 91111-1111' },
      { statusManual: false, statusAplicadoPelaPreficha: false })
    eq(cheio.set.telefone, undefined)
    const vazioTel = transferir(conversaTel, vazio, { statusManual: false, statusAplicadoPelaPreficha: false })
    eq(vazioTel.set.telefone, '(87) 98888-7766')
  })

  // Observações: dedup por conteúdo
  t('observações não duplicam o mesmo resumo', () => {
    const primeira = transferir(CONVERSA_MARLUCE, vazio, { statusManual: false, statusAplicadoPelaPreficha: false })
    const segunda = transferir(CONVERSA_MARLUCE, { ...vazio, observacoes: primeira.set.observacoes },
      { statusManual: false, statusAplicadoPelaPreficha: true })
    eq(segunda.set.observacoes, undefined)
  })

  // Borda: sugestão IGUAL ao status exibido ainda conta como aplicação (trava reaplicação)
  t('sugestão Triagem sobre status Triagem: select não muda, mas flag sobe', () => {
    const conversaTriagem = '[18:47] Cleide: preciso atualizar o cadunico no cras\n[18:48] Elyda: vou te orientar'
    const r = transferir(conversaTriagem, vazio, { statusManual: false, statusAplicadoPelaPreficha: false })
    eq(r.set.status, undefined, 'select não precisa mudar:')
    ok(r.statusAplicadoPelaPreficha, 'flag deve subir mesmo sem mudança visual')
    notOk(r.feitos.some(f => f.startsWith('Status')), 'feitos não lista Status sem mudança')
  })
  t('após Triagem→Triagem, segunda conversa com Documentação NÃO sobrescreve', () => {
    const conversaTriagem = '[18:47] Cleide: preciso atualizar o cadunico no cras'
    const primeira = transferir(conversaTriagem, vazio, { statusManual: false, statusAplicadoPelaPreficha: false })
    const segunda = transferir(CONVERSA_MARLUCE, vazio,
      { statusManual: false, statusAplicadoPelaPreficha: primeira.statusAplicadoPelaPreficha })
    eq(segunda.set.status, undefined, 'status continua Triagem:')
    ok(segunda.statusAplicadoPelaPreficha, 'flag permanece travada')
  })

  // Robustez
  t('r null → nada a fazer, flags preservadas', () => {
    const r = vm.runInContext(`prefichaTransferencia(null, ${JSON.stringify(vazio)}, {statusManual:false, statusAplicadoPelaPreficha:true})`, ctx)
    eq(r.feitos.length, 0)
    ok(r.statusAplicadoPelaPreficha)
  })
  t('flags ausentes (undefined) → trata como não-manual', () => {
    const r = vm.runInContext(`prefichaTransferencia(prefichaOrganizar(${JSON.stringify(CONVERSA_MARLUCE)}), ${JSON.stringify(vazio)}, undefined)`, ctx)
    eq(r.set.status, 'documentacao')
  })
}

console.log(`\n${'='.repeat(50)}`)
console.log(`RESULTADO: ${passou} passaram, ${falhou} falharam`)
process.exit(falhou ? 1 : 0)
