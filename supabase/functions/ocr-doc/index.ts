import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, prefer',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400'
};

// Modelos Groq com visão (cascata: tenta o 1º, cai pro 2º em rate limit/erro)
const GROQ_VISION_MODELS = [
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct'
];

const PROMPT_VISAO = `Você recebe a imagem de um documento de identidade brasileiro (RG, CNH ou CPF). Extraia os dados do TITULAR do documento.
Responda APENAS com um objeto JSON, sem nenhum texto antes ou depois, exatamente neste formato:
{"nome": string|null, "cpf": string|null, "data_nascimento": string|null}
Regras:
- "nome": nome completo do titular (a pessoa dona do documento). NUNCA use os nomes da filiação (pai e mãe).
- "cpf": no formato 000.000.000-00, ou null se não aparecer no documento.
- "data_nascimento": no formato AAAA-MM-DD (a data de NASCIMENTO, nunca a de expedição/emissão), ou null.
- Se algum campo estiver ilegível ou ausente, use null. Nunca invente dados.`;

async function callGroqVision(key: string, model: string, image_base64: string) {
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: PROMPT_VISAO },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image_base64}` } }
        ]
      }]
    })
  });
  const data = await resp.json();
  return { ok: resp.ok, status: resp.status, data };
}

// Normaliza o JSON vindo da IA pro formato que o front espera
function normalizarIA(obj: Record<string, unknown>) {
  let nome: string | null = null;
  if (obj.nome) {
    nome = String(obj.nome).replace(/[^A-Za-zÀ-ÿ\s'\-]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
    if (nome.split(' ').filter(w => w.length >= 2).length < 2 || nome.length < 6) nome = null;
  }
  let cpf: string | null = null;
  if (obj.cpf) {
    const d = String(obj.cpf).replace(/\D/g, '');
    if (d.length === 11) cpf = `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  }
  let data_nascimento: string | null = null;
  if (obj.data_nascimento) {
    const s = String(obj.data_nascimento).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) data_nascimento = `${m[1]}-${m[2]}-${m[3]}`;
    else { m = s.match(/(\d{2})[\/.\-](\d{2})[\/.\-](\d{4})/); if (m) data_nascimento = `${m[3]}-${m[2]}-${m[1]}`; }
  }
  return { nome, cpf, rg: null, data_nascimento };
}

// ── Fallback OCR.space + regex (caso a visão falhe) ────────────────
const TOKENS_NAO_NOME = /REP[UÚ]BLICA|FEDERATIVA|BRASIL|NACIONAL|TERRIT[OÓ]RIO|V[AÁ]LIDA|CARTEIRA|IDENTIDADE|REGISTRO|GERAL|FILIA|\bM[AÃ]E\b|\bPAI\b|NATURALIDADE|NASCIMENTO|\bDATA\b|\bCPF\b|\bRG\b|\bDOC\b|ORIGEM|ASSINATURA|DIRETOR|SECRETARI|SEGURAN|VALIDADE|EXPEDI|HABILITA|MINIST[EÉ]RIO|INSTITUTO|\bVIA\b|DECRETO|OBSERVA|FOLHA|TERMO|MATR[IÍ]CULA/;
const SO_LETRAS = /[A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÜÇÑ]/g;
function limparNome(s: string): string {
  return s.replace(/[<>]+/g, ' ').replace(/[^A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÜÇÑ\s]/g, ' ').replace(/\s+/g, ' ').trim()
    .split(' ').filter(w => w.length >= 2).join(' ');
}
function pareceNome(linha: string | undefined): boolean {
  if (!linha || TOKENS_NAO_NOME.test(linha)) return false;
  const semEspaco = linha.replace(/\s/g, '');
  if (!semEspaco.length) return false;
  if ((linha.match(SO_LETRAS) || []).length / semEspaco.length < 0.6) return false;
  const limpo = limparNome(linha);
  return limpo.length >= 6 && limpo.split(' ').filter(p => p.length >= 2).length >= 2;
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
    const idade = (hoje.getTime() - new Date(ano, mes - 1, dia).getTime()) / (365.25 * 86400000);
    return { idade, iso: `${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}` };
  }).filter(Boolean) as { idade: number; iso: string }[];
  const nasc = candidatos.find(c => c.idade >= 18 && c.idade <= 90) || candidatos[0];
  let nome: string | null = null;
  for (let i = 0; i < linhas.length && !nome; i++) {
    const l = linhas[i];
    if ((/\bNOME\b|\bNAME\b/.test(l)) && !/\bM[AÃ]E\b|\bPAI\b|FILIA/.test(l)) {
      const inline = l.replace(/^.*\bNOME[\s:]*/, '').replace(/^.*\bNAME[\s:]*/, '').trim();
      if (pareceNome(inline)) { nome = limparNome(inline); break; }
      if (pareceNome(linhas[i + 1])) { nome = limparNome(linhas[i + 1]); break; }
    }
  }
  return { nome, cpf, rg: null, data_nascimento: nasc ? nasc.iso : null };
}

async function fallbackOcrSpace(image_base64: string, OCR_KEY: string) {
  const formData = new FormData();
  formData.append('base64Image', `data:image/jpeg;base64,${image_base64}`);
  formData.append('language', 'por');
  formData.append('OCREngine', '2');
  formData.append('detectOrientation', 'true');
  formData.append('scale', 'true');
  const ocrRes = await fetch('https://api.ocr.space/parse/image', { method: 'POST', headers: { 'apikey': OCR_KEY }, body: formData });
  const ocrData = await ocrRes.json();
  const fullText = ocrData.ParsedResults?.[0]?.ParsedText || '';
  if (!fullText.trim()) return null;
  return { ...parseDocumento(fullText), _raw_text: fullText };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const body = await req.json();
    const { image_base64 } = body;
    if (!image_base64 || typeof image_base64 !== 'string') {
      return new Response(JSON.stringify({ error: 'image_base64 é obrigatório' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if ((image_base64.length * 3) / 4 > 4 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'Imagem maior que 4MB. Reduza a resolução.' }), { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const GROQ_KEY = Deno.env.get('GROQ_API_KEY');
    const OCR_KEY = Deno.env.get('OCR_SPACE_KEY');

    // 1) Tenta IA com visão (Groq)
    if (GROQ_KEY) {
      for (const model of GROQ_VISION_MODELS) {
        try {
          const { ok, status, data } = await callGroqVision(GROQ_KEY, model, image_base64);
          if (!ok) { console.error(`[ocr-doc] groq ${model} ${status}:`, JSON.stringify(data).slice(0, 300)); if (status === 429 || status === 503) continue; else break; }
          const content = (data?.choices?.[0]?.message?.content || '') as string;
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const obj = JSON.parse(jsonMatch[0]);
            const norm = normalizarIA(obj);
            if (norm.nome || norm.cpf || norm.data_nascimento) {
              return new Response(JSON.stringify({ ok: true, ...norm, _via: 'groq-vision', _model: model }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
          }
        } catch (e) { console.error(`[ocr-doc] groq ${model} exception:`, String(e)); }
      }
    }

    // 2) Fallback: OCR.space + regex
    if (OCR_KEY) {
      const r = await fallbackOcrSpace(image_base64, OCR_KEY);
      if (r) return new Response(JSON.stringify({ ok: true, ...r, _via: 'ocr.space' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ ok: false, message: 'Não consegui ler o documento. Tente uma foto mais nítida.', nome: null, cpf: null, rg: null, data_nascimento: null }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[ocr-doc] error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
