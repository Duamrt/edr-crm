/* ============================================================
   Testes locais — gravação de Lotes (procura e oportunidade)
   Rodar: node docs/redesign/testes-lotes-gravacao.js

   COBRE: validação, montagem de payload e tradução de erro.
   Tudo com STUB — nenhuma chamada real ao Supabase, nenhum
   registro criado em lugar nenhum.

   NÃO COBRE: que o sbPost real funciona. Isso só um cadastro de
   verdade prova, e depende de autorização de Duam.

   Nota: o código é lido do próprio lotes.html (não copiado para
   cá) e executado com o módulo `vm`, em contexto isolado. Assim o
   teste acompanha a implementação — se alguém mudar a tela e
   quebrar algo, o teste quebra junto.
   ============================================================ */

const fs = require('fs')
const vm = require('vm')
const path = require('path')

const ARQUIVO = path.join(__dirname, '../../lotes.html')
const html = fs.readFileSync(ARQUIVO, 'utf8')

// Pega só os blocos <script> inline da tela.
const codigo = (html.match(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g) || [])
  .map(s => s.replace(/<\/?script[^>]*>/g, ''))
  .join('\n')
  // Remove a inicialização: queremos as declarações, não a tela rodando.
  .replace(/if \(!authGuard\(\)\)[^\n]*\n/, '')
  .replace(/document\.documentElement[^\n]*\n/g, '')
  .replace(/^\s*(montarSelectsCidade|carregarClientes|carregar)\(\)\s*$/gm, '')

// ── DOM mínimo: só o que as funções tocam ────────────────────────
const _campos = {}
function campo(id) {
  if (!_campos[id]) {
    _campos[id] = { value: '', disabled: false, title: '', textContent: '',
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, appendChild() {}, options: [{ textContent: '' }],
      replaceChildren() {} }
  }
  return _campos[id]
}

let _toasts = []
let _sbPostChamadas = []
let _sbPostErro = null

const sandbox = {
  document: {
    getElementById: campo,
    addEventListener() {},
    createElement: () => ({ classList: { add() {} }, appendChild() {}, style: {} }),
    body: { style: {}, appendChild() {} }
  },
  window: {},
  console: { error() {}, warn() {}, log() {} },  // silencia logs esperados
  setTimeout: () => {},
  Number, JSON, Math, Date, String, Array, Object, Boolean, Promise, Error, RegExp,
  toast: (msg, tipo) => _toasts.push({ msg, tipo }),
  showLoading() {}, hideLoading() {},
  authGuard: () => true,
  getUsuario: () => ({ nome: 'teste' }),
  logout() {},
  sbGet: async () => [],
  sbPost: async (tabela, body) => {
    _sbPostChamadas.push({ tabela, body })
    if (_sbPostErro) throw _sbPostErro
    return { id: 'id-fake', ...body }
  }
}
vm.createContext(sandbox)
vm.runInContext(codigo, sandbox, { filename: 'lotes.html:<script>' })

// ── Infra de teste ───────────────────────────────────────────────
let ok = 0, falhou = 0
function checa(nome, condicao, detalhe) {
  if (condicao) { ok++; console.log('  PASSOU  ' + nome) }
  else { falhou++; console.log('  FALHOU  ' + nome + (detalhe ? '  -> ' + detalhe : '')) }
}
function set(campos) {
  Object.keys(_campos).forEach(k => { _campos[k].value = '' })
  Object.entries(campos).forEach(([id, v]) => { campo(id).value = v })
}
function reset() { _toasts = []; _sbPostChamadas = []; _sbPostErro = null }

const {
  validarProcura, validarOportunidade, fraseFaltando,
  payloadProcura, payloadOportunidade, erroLegivel,
  salvarProcura, salvarOportunidade
} = sandbox

// ── 1. VALIDAÇÃO ─────────────────────────────────────────────────
console.log('\n1. VALIDACAO')

set({})
checa('procura vazia acusa familia e cidade',
  JSON.stringify(validarProcura()) === JSON.stringify(['a família', 'a cidade']))

set({ 'mp-cliente': 'uuid-1' })
checa('procura so com familia acusa cidade',
  JSON.stringify(validarProcura()) === JSON.stringify(['a cidade']))

set({ 'mp-cliente': 'uuid-1', 'mp-cidade': 'Garanhuns' })
checa('procura completa nao acusa nada', validarProcura().length === 0)

set({ 'mp-cliente': '   ', 'mp-cidade': 'Jupi' })
checa('espaco em branco nao conta como preenchido',
  JSON.stringify(validarProcura()) === JSON.stringify(['a família']))

set({})
checa('oportunidade vazia acusa descricao e cidade',
  JSON.stringify(validarOportunidade()) === JSON.stringify(['a descrição', 'a cidade']))

set({ 'mo-descricao': 'Lote na Rua X', 'mo-cidade': 'Lajedo' })
checa('oportunidade completa nao acusa nada', validarOportunidade().length === 0)

checa('frase de 1 campo', fraseFaltando(['a cidade']) === 'Preencha a cidade.')
checa('frase de 2 campos',
  fraseFaltando(['a família', 'a cidade']) === 'Preencha a família e a cidade.')
checa('frase de 3 campos', fraseFaltando(['a', 'b', 'c']) === 'Preencha a, b e c.')

// ── 2. PAYLOAD ───────────────────────────────────────────────────
console.log('\n2. PAYLOAD')

set({ 'mp-cliente': 'uuid-1', 'mp-cidade': 'Garanhuns' })
let p = payloadProcura()
checa('regiao vazia vira null (nao string vazia)', p.regiao === null,
  'veio ' + JSON.stringify(p.regiao))
checa('numerico vazio vira null', p.valor_maximo === null && p.metragem_desejada === null)
checa('nao manda situacao (deixa o DEFAULT do banco valer)', !('situacao' in p))
checa('nao manda id nem created_at', !('id' in p) && !('created_at' in p))

set({ 'mp-cliente': 'uuid-1', 'mp-cidade': 'Jupi', 'mp-regiao': 'Centro',
      'mp-valor': '45000', 'mp-metragem': '200' })
p = payloadProcura()
checa('valor vira numero, nao string',
  p.valor_maximo === 45000 && typeof p.valor_maximo === 'number')
checa('regiao preenchida e mantida', p.regiao === 'Centro')

set({ 'mo-descricao': 'Lote Rua X', 'mo-cidade': 'Jucati' })
const o = payloadOportunidade()
checa('oportunidade sem regiao manda null', o.regiao === null)
checa('oportunidade nao manda situacao', !('situacao' in o))

// ── 3. TRADUÇÃO DE ERRO ──────────────────────────────────────────
console.log('\n3. TRADUCAO DE ERRO')

const e23505 = new Error('POST crm_procura_lote: 409 {"code":"23505","message":"duplicate key value violates unique constraint \\"crm_procura_uma_ativa_por_familia\\""}')
checa('23505 em procura -> "ja esta na fila"',
  erroLegivel(e23505, 'procura') === 'Esta família já está na fila.')
checa('23505 em oportunidade -> duplicado generico',
  erroLegivel(e23505, 'oportunidade') === 'Este registro já existe.')
checa('23514 (check) -> valor nao aceito',
  erroLegivel(new Error('POST x: 400 {"code":"23514"}')).includes('não é aceito'))
checa('23502 (not null) -> campo obrigatorio',
  erroLegivel(new Error('POST x: 400 {"code":"23502"}')).includes('obrigatório'))
checa('23503 (FK) -> familia nao encontrada',
  erroLegivel(new Error('POST x: 409 {"code":"23503"}')).includes('não foi encontrada'))
checa('401 -> sessao expirada',
  erroLegivel(new Error('POST x: 401 ')).includes('sessão expirou'))
checa('erro desconhecido -> frase honesta, sem jargao',
  erroLegivel(new Error('POST x: 500 boom')) ===
  'Não foi possível salvar. Tente de novo; se continuar, avise o suporte.')
checa('nenhuma mensagem vaza codigo do Postgres',
  !/\d{5}|constraint|violates/.test(erroLegivel(e23505, 'procura')))

// ── 4. FLUXO COMPLETO (com stub) ─────────────────────────────────
;(async () => {
  console.log('\n4. FLUXO')

  reset(); set({})
  let r = await salvarProcura()
  checa('sem campo obrigatorio NAO chama sbPost', _sbPostChamadas.length === 0)
  checa('sem campo obrigatorio retorna false', r === false)
  checa('sem campo obrigatorio mostra aviso',
    _toasts.length === 1 && _toasts[0].tipo === 'error' && _toasts[0].msg.startsWith('Preencha'))

  reset(); set({ 'mp-cliente': 'uuid-1', 'mp-cidade': 'Garanhuns' })
  r = await salvarProcura()
  checa('sucesso chama sbPost 1 vez', _sbPostChamadas.length === 1)
  checa('sucesso usa a tabela certa', _sbPostChamadas[0]?.tabela === 'crm_procura_lote')
  checa('sucesso retorna true', r === true)
  checa('sucesso mostra confirmacao',
    _toasts.some(t => t.tipo === 'success' && t.msg === 'Procura registrada.'))

  reset(); set({ 'mp-cliente': 'uuid-1', 'mp-cidade': 'Garanhuns' })
  _sbPostErro = e23505
  r = await salvarProcura()
  checa('duplicidade retorna false', r === false)
  checa('duplicidade mostra "ja esta na fila"',
    _toasts.some(t => t.tipo === 'error' && t.msg === 'Esta família já está na fila.'))

  reset(); set({ 'mp-cliente': 'uuid-1', 'mp-cidade': 'Garanhuns' })
  _sbPostErro = new Error('POST crm_procura_lote: 500 boom')
  r = await salvarProcura()
  checa('erro generico retorna false', r === false)
  checa('erro generico nao expoe jargao',
    _toasts.some(t => t.msg.includes('avise o suporte')))

  // 🐛 Este teste afirmava o comportamento ERRADO: exigia disabled === false
  //    apos o erro. Isso validava o bug que o Codex achou — o `finally`
  //    reabilitava o botao "na mao", desfazendo GRAVACAO_IMPLEMENTADA=false.
  //    Com a trava ligada, o correto e o botao CONTINUAR bloqueado.
  checa('apos erro, botao segue BLOQUEADO (trava global vale)',
    campo('mp-salvar').disabled === true,
    'veio disabled=' + campo('mp-salvar').disabled)

  reset(); set({ 'mo-descricao': 'Lote Rua X', 'mo-cidade': 'Jucati' })
  r = await salvarOportunidade()
  checa('oportunidade grava na tabela certa',
    _sbPostChamadas[0]?.tabela === 'crm_oportunidade_lote')
  checa('oportunidade retorna true', r === true)

  // ⚠️ O caminho de ERRO da oportunidade precisa do seu proprio caso.
  //    A correcao do `finally` foi aplicada nas DUAS funcoes, mas so a
  //    procura era exercitada — entao uma regressao em salvarOportunidade
  //    passaria despercebida. Ordem importa: reset() limpa _sbPostErro,
  //    entao armar o erro DEPOIS do reset, senao cai no caminho feliz.
  reset(); set({ 'mo-descricao': 'Lote Rua X', 'mo-cidade': 'Jucati' })
  _sbPostErro = new Error('POST crm_oportunidade_lote: 500 boom')
  r = await salvarOportunidade()
  checa('oportunidade com erro retorna false', r === false)
  checa('oportunidade com erro avisa sem jargao',
    _toasts.some(t => t.tipo === 'error' && t.msg.includes('avise o suporte')))
  checa('apos erro, botao da OPORTUNIDADE segue BLOQUEADO (trava global vale)',
    campo('mo-salvar').disabled === true,
    'veio disabled=' + campo('mo-salvar').disabled)
  checa('erro na oportunidade nao fecha o modal nem limpa o que foi digitado',
    campo('mo-descricao').value === 'Lote Rua X')

  // ── 5. TRAVA ───────────────────────────────────────────────────
  console.log('\n5. TRAVA DE SEGURANCA')
  // ⚠️ Verificar no ARQUIVO, não no sandbox: `const` declarado via
  //    vm.runInContext não vira propriedade do contexto, então ler
  //    `GRAVACAO_IMPLEMENTADA` aqui daria `undefined`. Com uma asserção
  //    frouxa (`!GRAVACAO_IMPLEMENTADA`) isso passaria mesmo se a trava
  //    estivesse LIGADA — o teste daria verde justo quando não devia.
  checa('GRAVACAO_IMPLEMENTADA continua false (lido do arquivo)',
    /const GRAVACAO_IMPLEMENTADA = false\b/.test(html))
  checa('nao existe GRAVACAO_IMPLEMENTADA = true em lugar nenhum',
    !/GRAVACAO_IMPLEMENTADA\s*=\s*true/.test(html))
  checa('nenhum listener liga os Salvar as funcoes de gravacao',
    !/mp-salvar'\)[\s\S]{0,80}addEventListener/.test(html) &&
    !/mo-salvar'\)[\s\S]{0,80}addEventListener/.test(html))

  console.log('\n' + '='.repeat(54))
  console.log('RESULTADO: ' + ok + ' passaram, ' + falhou + ' falharam')
  console.log('='.repeat(54))
  console.log('\nNAO COBERTO: sbPost real contra o Supabase. So um cadastro')
  console.log('de verdade prova, e depende de autorizacao de Duam.\n')
  process.exit(falhou ? 1 : 0)
})()
