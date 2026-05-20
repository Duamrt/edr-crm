import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, prefer',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400'
};

// Rótulos/cabeçalhos que NUNCA são nome de pessoa
const TOKENS_NAO_NOME = /REP[UÚ]BLICA|FEDERATIVA|BRASIL|CARTEIRA|IDENTIDADE|REGISTRO|GERAL|FILIA|\bM[AÃ]E\b|\bPAI\b|NATURALIDADE|NASCIMENTO|\bDATA\b|\bCPF\b|\bRG\b|\bDOC\b|ORIGEM|ASSINATURA|DIRETOR|SECRETARI|SEGURAN|VALIDADE|EXPEDI|HABILITA|MINIST[EÉ]RIO|INSTITUTO|\bVIA\b|DECRETO|OBSERVA|FOLHA|TERMO|MATR[IÍ]CULA/;

const SO_LETRAS = /[A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÜÇÑ]/g;

// Remove ruído de OCR (dígitos, pontuação) mantendo só letras e espaços
function limparNome(s: string): string {
  return s.replace(/[^A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÜÇÑ\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Heurística: a linha parece um nome de pessoa?
function pareceNome(linha: string | undefined): boolean {
  if (!linha || TOKENS_NAO_NOME.test(linha)) return false;
  const semEspaco = linha.replace(/\s/g, '');
  if (!semEspaco.length) return false;
  const letras = (linha.match(SO_LETRAS) || []).length;
  if (letras / semEspaco.length < 0.7) return false; // muito ruído = não é nome
  const limpo = limparNome(linha);
  const palavras = limpo.split(' ').filter(p => p.length >= 2);
  return limpo.length >= 6 && palavras.length >= 2;
}

function parseDocumento(textoOriginal: string) {
  const texto = textoOriginal.replace(/\r/g, '').toUpperCase();
  const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);

  const cpfMatch = texto.match(/(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})/);
  const cpf = cpfMatch ? `${cpfMatch[1]}.${cpfMatch[2]}.${cpfMatch[3]}-${cpfMatch[4]}` : null;

  const dataMatches = [...texto.matchAll(/(\d{2})[\/.\-](\d{2})[\/.\-](\d{4})/g)];
  const hoje = new Date();
  const candidatos = dataMatches.map(m => {
    const dia = parseInt(m[1]), mes = parseInt(m[2]), ano = parseInt(m[3]);
    if (dia < 1 || dia > 31 || mes < 1 || mes > 12 || ano < 1920 || ano > hoje.getFullYear()) return null;
    const dt = new Date(ano, mes - 1, dia);
    const idade = (hoje.getTime() - dt.getTime()) / (365.25 * 86400000);
    return { idade, iso: `${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}` };
  }).filter(Boolean) as { idade: number; iso: string }[];
  const nasc = candidatos.find(c => c.idade >= 18 && c.idade <= 90) || candidatos[0];
  const data_nascimento = nasc ? nasc.iso : null;

  // Nome — 3 camadas de tolerância (OCR de RG/CPF é ruidoso)
  let nome: string | null = null;

  // 1) Via rótulo NOME/NAME — inline ou linha seguinte
  for (let i = 0; i < linhas.length && !nome; i++) {
    const l = linhas[i];
    if ((/\bNOME\b|\bNAME\b/.test(l)) && !/\bM[AÃ]E\b|\bPAI\b|FILIA/.test(l)) {
      const inline = l.replace(/^.*\bNOME[\s:]*/, '').replace(/^.*\bNAME[\s:]*/, '').trim();
      if (pareceNome(inline)) { nome = limparNome(inline); break; }
      if (pareceNome(linhas[i + 1])) { nome = limparNome(linhas[i + 1]); break; }
    }
  }

  // 2) Fallback — primeira linha "cara de nome" ANTES da filiação (titular vem antes de mãe/pai)
  if (!nome) {
    for (const l of linhas) {
      if (/FILIA|\bM[AÃ]E\b|\bPAI\b/.test(l)) break;
      if (pareceNome(l)) { nome = limparNome(l); break; }
    }
  }

  // 3) Último recurso — maior linha "cara de nome" do documento todo
  if (!nome) {
    const cands = linhas.filter(pareceNome).sort((a, b) => b.length - a.length);
    if (cands.length) nome = limparNome(cands[0]);
  }

  const rgMatch = texto.match(/\bRG[\s:NO\.°º]*([\d\.X-]{6,15})/i) || texto.match(/REGISTRO[\s:NO\.°º]*([\d\.X-]{6,15})/i);
  const rg = rgMatch ? rgMatch[1].trim() : null;

  return { nome, cpf, rg, data_nascimento };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    const { image_base64, _diag } = body;

    const OCR_KEY = Deno.env.get('OCR_SPACE_KEY');
    if (!OCR_KEY) {
      return new Response(JSON.stringify({ error: 'OCR_SPACE_KEY não configurado' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (_diag) {
      return new Response(JSON.stringify({
        diag: true,
        provider: 'ocr.space',
        key_prefix: OCR_KEY.slice(0, 5),
        key_length: OCR_KEY.length,
        ready: true
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!image_base64 || typeof image_base64 !== 'string') {
      return new Response(JSON.stringify({ error: 'image_base64 é obrigatório' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const sizeBytes = (image_base64.length * 3) / 4;
    if (sizeBytes > 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'Imagem maior que 1MB. Reduza qualidade ou resolução.' }), { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const formData = new FormData();
    formData.append('base64Image', `data:image/jpeg;base64,${image_base64}`);
    formData.append('language', 'por');
    formData.append('OCREngine', '2');
    formData.append('detectOrientation', 'true');
    formData.append('scale', 'true');
    formData.append('isTable', 'false');

    const ocrRes = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { 'apikey': OCR_KEY },
      body: formData
    });

    const ocrData = await ocrRes.json();

    if (!ocrRes.ok || ocrData.IsErroredOnProcessing) {
      console.error('[ocr-doc] OCR.space error', ocrRes.status, ocrData);
      const errMsg = Array.isArray(ocrData.ErrorMessage) ? ocrData.ErrorMessage.join('; ') : (ocrData.ErrorMessage || 'Erro OCR');
      return new Response(JSON.stringify({ error: 'Erro OCR.space', detail: errMsg, ocr_exit_code: ocrData.OCRExitCode }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const fullText = ocrData.ParsedResults?.[0]?.ParsedText || '';
    if (!fullText.trim()) {
      return new Response(JSON.stringify({ ok: false, message: 'Nenhum texto detectado. Tente foto mais nítida.', nome: null, cpf: null, rg: null, data_nascimento: null }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const parsed = parseDocumento(fullText);
    // _raw_text só quando pedido explicitamente (diagnóstico de extração de nome)
    const resp = body.incluir_texto ? { ok: true, ...parsed, _raw_text: fullText } : { ok: true, ...parsed };
    return new Response(JSON.stringify(resp), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[ocr-doc] error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
