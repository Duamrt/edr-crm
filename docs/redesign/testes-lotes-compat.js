// Testes da regra de compatibilidade — Lotes
// Le familiasCompativeis() do proprio lotes.html e roda em contexto isolado,
// como os testes de gravacao. Assim o teste acompanha o codigo: se alguem
// mudar a regra na tela, isto quebra junto.
//
//   node docs/redesign/testes-lotes-compat.js

const fs = require('fs')
const vm = require('vm')
const path = require('path')

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'lotes.html'), 'utf8')

// Guarda de nome: se alguem renomear SUGERIVEIS de volta para ATIVAS, o
// comentario que explica por que `pausada` fica de fora se perde junto.
const usaSugeriveis = /const SUGERIVEIS = \['procurando', 'em_analise'\]/.test(html)

const m = /function familiasCompativeis\(oport\) \{[\s\S]*?\n    \}/.exec(html)
if (!m) {
  console.error('FALHOU: nao achei familiasCompativeis() em lotes.html')
  process.exit(1)
}

// OPORT_SUGERE vive FORA da funcao (é usada tambem pelo texto do card),
// entao precisa vir junto — senao a funcao quebra por referencia ausente.
const mSug = /const OPORT_SUGERE = \[[^\]]*\]/.exec(html)
if (!mSug) {
  console.error('FALHOU: nao achei OPORT_SUGERE em lotes.html')
  process.exit(1)
}

const sandbox = { _procuras: [] }
vm.createContext(sandbox)
vm.runInContext(mSug[0] + '\n' + m[0] + '\nthis.familiasCompativeis = familiasCompativeis', sandbox)
const { familiasCompativeis } = sandbox

let ok = 0, falhou = 0
function checa(nome, cond, extra) {
  if (cond) { ok++; console.log('  PASSOU  ' + nome) }
  else { falhou++; console.log('  FALHOU  ' + nome + (extra ? '  -> ' + extra : '')) }
}
function fila(...ps) { sandbox._procuras = ps }
function p(over) {
  return Object.assign({
    cliente_id: 'c1', cidade: 'Jupi', valor_maximo: 50000,
    situacao: 'procurando', crm_clientes: { nome: 'FAMILIA X' }
  }, over)
}
const nomes = r => r.map(x => x.crm_clientes.nome)

console.log('\n' + '='.repeat(54))
console.log('COMPATIBILIDADE — Lotes')
console.log('='.repeat(54))

console.log('\n1. CIDADE')
fila(p({ cidade: 'Jupi' }), p({ cidade: 'Garanhuns', crm_clientes: { nome: 'OUTRA' } }))
let r = familiasCompativeis({ situacao:'disponivel', cidade: 'Jupi', valor: 40000 })
checa('so entra quem e da mesma cidade', r.length === 1 && nomes(r)[0] === 'FAMILIA X')

r = familiasCompativeis({ situacao:'disponivel', cidade: 'Lajedo', valor: 40000 })
checa('cidade sem ninguem devolve vazio', r.length === 0)

fila(p({}))
checa('oportunidade sem cidade devolve vazio', familiasCompativeis({ situacao:'disponivel', valor: 1 }).length === 0)
checa('oportunidade nula nao explode', familiasCompativeis(null).length === 0)

console.log('\n2. VALOR')
fila(p({ valor_maximo: 50000 }))
checa('valor abaixo do teto entra',
  familiasCompativeis({ situacao:'disponivel', cidade: 'Jupi', valor: 40000 }).length === 1)
checa('valor IGUAL ao teto entra (limite inclusivo)',
  familiasCompativeis({ situacao:'disponivel', cidade: 'Jupi', valor: 50000 }).length === 1)
checa('valor acima do teto NAO entra',
  familiasCompativeis({ situacao:'disponivel', cidade: 'Jupi', valor: 50001 }).length === 0)

fila(p({ valor_maximo: null }))
checa('familia SEM teto informado entra (nao punir quem nao preencheu)',
  familiasCompativeis({ situacao:'disponivel', cidade: 'Jupi', valor: 999999 }).length === 1)

fila(p({ valor_maximo: 30000 }))
checa('oportunidade SEM valor entra (nada a comparar)',
  familiasCompativeis({ situacao:'disponivel', cidade: 'Jupi', valor: null }).length === 1)

fila(p({ valor_maximo: '10000' }))
checa('compara como NUMERO, nao string',
  familiasCompativeis({ situacao:'disponivel', cidade: 'Jupi', valor: '9000' }).length === 1,
  'se comparasse texto, "9000" > "10000" e daria 0')

console.log('\n3. SITUACAO')
fila(
  p({ situacao: 'procurando',  crm_clientes: { nome: 'PROCURANDO' } }),
  p({ situacao: 'em_analise',  crm_clientes: { nome: 'EM ANALISE' } }),
  p({ situacao: 'pausada',     crm_clientes: { nome: 'PAUSADA' } }),
  p({ situacao: 'atendida',    crm_clientes: { nome: 'ATENDIDA' } }),
  p({ situacao: 'desistiu',    crm_clientes: { nome: 'DESISTIU' } })
)
r = familiasCompativeis({ situacao:'disponivel', cidade: 'Jupi', valor: 40000 })
checa('so ativas: procurando + em_analise', r.length === 2)
checa('quem DESISTIU nao e sugerido', !nomes(r).includes('DESISTIU'))
checa('quem JA FOI ATENDIDA nao e sugerida', !nomes(r).includes('ATENDIDA'))
checa('PAUSADA nao e sugerida', !nomes(r).includes('PAUSADA'))

console.log('\n4. NAO ESCREVE NADA')
fila(p({}), p({ cidade: 'Lajedo' }))
const antes = JSON.stringify(sandbox._procuras)
familiasCompativeis({ situacao:'disponivel', cidade: 'Jupi', valor: 40000 })
checa('nao altera _procuras (sem efeito colateral)',
  JSON.stringify(sandbox._procuras) === antes)

console.log('\n5. NOME DA REGRA')
checa('constante chama SUGERIVEIS (nao ATIVAS)', usaSugeriveis,
  'pausada e ativa no banco mas nao sugerivel — o nome precisa dizer isso')

console.log('\n6. CORTE DA LISTA VISUAL (MAX 5 NOMES)')
// A regra devolve TODAS; quem corta e o desenho. Aqui garanto as duas
// coisas: a contagem completa continua disponivel, e o corte existe no
// codigo da tela com o "+ N" — sem isso o card viraria um paragrafo.
fila(...Array.from({ length: 12 }, (_, i) =>
  p({ cliente_id: 'c' + i, crm_clientes: { nome: 'FAMILIA ' + (i + 1) } })))
r = familiasCompativeis({ situacao:'disponivel', cidade: 'Jupi', valor: 40000 })
checa('a regra devolve TODAS as compativeis (corte e so visual)', r.length === 12)
checa('tela corta em 5 nomes', /const MAX_NOMES = 5\b/.test(html))
checa('tela mostra "+ N outras" quando sobra', /outras famílias compatíveis/.test(html))
checa('contagem TOTAL continua no titulo (nada escondido)',
  /compat\.length \+ ' famílias compatíveis:'/.test(html))

console.log('\n7. SITUACAO DA OPORTUNIDADE')
// Um lote ja fechado nao pode continuar apontando familias — a pessoa
// ligaria para alguem sobre um lote que nao existe mais.
fila(p({ cidade: 'Jupi', valor_maximo: 60000 }))
const oport = s => ({ situacao: s, cidade: 'Jupi', valor: 40000 })

checa('DISPONIVEL sugere', familiasCompativeis(oport('disponivel')).length === 1)
checa('FECHADA nao sugere ninguem', familiasCompativeis(oport('fechada')).length === 0)
checa('PERDIDA nao sugere ninguem', familiasCompativeis(oport('perdida')).length === 0)
// Decisao PENDENTE de Duam — reservada nao e encerrada, pode voltar ao
// mercado. Sem sugestao por ora; este teste trava o comportamento atual
// para que uma mudanca seja deliberada, nao acidental.
checa('RESERVADA nao sugere (decisao pendente, nao regra fechada)',
  familiasCompativeis(oport('reservada')).length === 0)
checa('situacao ausente nao sugere (nao assumir disponivel)',
  familiasCompativeis({ cidade: 'Jupi', valor: 40000 }).length === 0)
checa('so disponivel na constante', /const OPORT_SUGERE = \['disponivel'\]/.test(html))
checa('texto vazio NAO afirma que a cidade nao tem familia',
  !/Nenhuma família da fila combina com esta cidade/.test(html) &&
  /Nenhuma família compatível no momento/.test(html),
  'pode haver familia na cidade cujo teto nao comporta o valor')
checa('encerrada tem texto proprio, nao "nenhuma compativel"',
  /sugestões não se aplicam/.test(html))

console.log('\n8. CENARIO REAL DO TESTE DE 29/07')
fila(p({ cidade: 'Jupi', valor_maximo: 45000, crm_clientes: { nome: 'RAYLANE NATHIELE DE SOUZA ARAUJO' } }))
r = familiasCompativeis({ situacao:'disponivel', cidade: 'Jupi', valor: 40000 })
checa('Raylane aparece para a oportunidade de Jupi',
  r.length === 1 && nomes(r)[0].startsWith('RAYLANE'))

console.log('\n' + '='.repeat(54))
console.log('RESULTADO: ' + ok + ' passaram, ' + falhou + ' falharam')
console.log('='.repeat(54))
console.log('\nNAO COBERTO: o desenho na tela (renderOportunidades) — isso')
console.log('exige navegador. Aqui so a regra de quem combina com quem.\n')
process.exit(falhou ? 1 : 0)
