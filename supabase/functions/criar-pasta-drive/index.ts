import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Shared Drive ID — "EDR CRM - MCMV" no Workspace edreng.com.br
const SHARED_DRIVE_ID = '0AC0tXNkyaIXyUk9PVA';

// Gera JWT assinado RS256 a partir do JSON da Service Account (sem dependência externa)
async function getAccessToken(saKey: { client_email: string; private_key: string }) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: saKey.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const b64url = (obj: unknown) => btoa(JSON.stringify(obj))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const unsigned = `${b64url(header)}.${b64url(claim)}`;

  // Importa private key (PEM PKCS8) pra Web Crypto API
  const pem = saKey.private_key.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const pemBytes = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    pemBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(unsigned)
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const jwt = `${unsigned}.${sigB64}`;

  // Troca JWT por access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) throw new Error(`Token error: ${JSON.stringify(tokenData)}`);
  return tokenData.access_token as string;
}

// Sanitiza nome de pasta — remove caracteres problemáticos pro Drive
function sanitizeFolderName(s: string) {
  return s.replace(/[\/\\:*?"<>|]/g, '').trim().substring(0, 80);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Auth do usuário chamador
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

    const { cliente_id } = await req.json();
    if (!cliente_id) {
      return new Response(JSON.stringify({ error: 'cliente_id é obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Busca dados do cliente
    const { data: cliente, error: cErr } = await supabase
      .from('crm_clientes')
      .select('id, nome, cpf, drive_folder_id')
      .eq('id', cliente_id)
      .single();
    if (cErr || !cliente) {
      return new Response(JSON.stringify({ error: 'Cliente não encontrado', detail: cErr }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Idempotência: se já tem pasta, retorna a existente
    if (cliente.drive_folder_id) {
      return new Response(JSON.stringify({
        folder_id: cliente.drive_folder_id,
        folder_url: `https://drive.google.com/drive/folders/${cliente.drive_folder_id}`,
        created: false
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Carrega Service Account
    const saKeyRaw = Deno.env.get('GOOGLE_SA_KEY');
    if (!saKeyRaw) {
      return new Response(JSON.stringify({ error: 'GOOGLE_SA_KEY não configurado' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const saKey = JSON.parse(saKeyRaw);

    // Gera access token
    const accessToken = await getAccessToken(saKey);

    // Cria pasta no Shared Drive
    const folderName = sanitizeFolderName(`${cliente.cpf} - ${cliente.nome}`);
    const driveRes = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [SHARED_DRIVE_ID]
      })
    });
    const folder = await driveRes.json();
    if (!driveRes.ok) {
      console.error('Drive API error:', folder);
      return new Response(JSON.stringify({ error: 'Erro Drive API', detail: folder }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Salva folder_id no cliente
    await supabase
      .from('crm_clientes')
      .update({ drive_folder_id: folder.id })
      .eq('id', cliente_id);

    return new Response(JSON.stringify({
      folder_id: folder.id,
      folder_url: `https://drive.google.com/drive/folders/${folder.id}`,
      folder_name: folderName,
      created: true
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
