import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ETAPA_LABEL: Record<string, string> = {
  triagem: 'Triagem',
  documentacao: 'Documentação',
  correspondente: 'Com Correspondente',
  aprovado: 'Aprovado/Ajustes',
  prefeitura: 'Prefeitura/Projetos',
  assinatura: 'Assinatura',
  concluido: 'Concluído',
  perdido: 'Perdido',
};

// Cascata de modelos Groq — fallback automático em rate limit
const GROQ_MODELS = [
  'llama-3.3-70b-versatile',  // melhor qualidade pt-br, 30 req/min
  'llama-3.1-8b-instant',     // mais rápido, menor, alta cota
  'gemma2-9b-it'              // último fallback
];

async function callGroq(key: string, model: string, prompt: string) {
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 500
    })
  });
  const data = await resp.json();
  return { ok: resp.ok, status: resp.status, data };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { nome, status_kanban, docs_pendentes = [], docs_recusados = [], impedimentos = [], dias_parado = 0 } = await req.json();

    const GROQ_KEY = Deno.env.get('GROQ_API_KEY');
    if (!GROQ_KEY) {
      return new Response(JSON.stringify({ error: 'GROQ_API_KEY not configured no servidor' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Whitelist de status (mitigação prompt injection)
    const etapaSegura = ETAPA_LABEL[status_kanban as string] || 'Em andamento';

    const contexto: string[] = [];
    if ((docs_recusados as string[]).length) contexto.push(`Documentos RECUSADOS (precisam reenvio): ${(docs_recusados as string[]).slice(0, 5).join(', ')}`);
    if ((docs_pendentes as string[]).length) contexto.push(`Documentos ainda pendentes: ${(docs_pendentes as string[]).slice(0, 5).join(', ')}`);
    if ((impedimentos as string[]).length) contexto.push(`Impedimentos em análise: ${(impedimentos as string[]).slice(0, 3).join(', ')}`);
    if ((dias_parado as number) > 5) contexto.push(`Processo parado há ${dias_parado} dias`);

    // Sanitizar nome (apenas letras, espaços, acentos, hífen, apóstrofo)
    const nomeSanit = String(nome || '').replace(/[^\p{L} '\-]/gu, '').trim().substring(0, 80) || 'cliente';

    const prompt = `Você é Elyda, consultora MCMV da EDR Engenharia em Jupi-PE. Escreva uma mensagem de WhatsApp personalizada para o cliente chamado ${nomeSanit}.

Etapa atual: ${etapaSegura}
${contexto.length ? contexto.join('\n') : 'Processo em andamento normalmente.'}

Regras:
- Use o nome do cliente
- Máximo 3 parágrafos curtos (é WhatsApp, não e-mail)
- Tom: próximo, acolhedor, profissional
- Se tiver documento recusado: peça reenvio gentilmente sem alarmar
- Se tiver impedimento: diga que está trabalhando para resolver com tranquilidade
- Termine com chamada para ação clara (ligar, enviar doc, passar na sede)
- Máximo 2-3 emojis
- Assine como "Elyda | EDR Engenharia"
- NÃO invente valores, datas ou números

Escreva somente a mensagem, sem prefácio ou comentários.`;

    let lastError: { status: number; data: unknown } | null = null;

    for (const model of GROQ_MODELS) {
      const { ok, status, data } = await callGroq(GROQ_KEY, model, prompt);

      if (ok) {
        const mensagem = ((data as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content as string)?.trim();
        if (mensagem) {
          return new Response(JSON.stringify({ mensagem, model, provider: 'groq' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      lastError = { status, data };
      console.error(`Groq ${model} error ${status}:`, JSON.stringify(data));

      // Fallback em 429 (rate limit) e 503 (overload)
      if (status !== 429 && status !== 503) break;
    }

    return new Response(JSON.stringify({
      error: `Groq API error ${lastError?.status}`,
      detail: lastError?.data
    }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
