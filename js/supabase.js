// EDR CRM — Config Supabase (EDR System project)
const SUPABASE_URL = 'https://mepzoxoahpwcvvlymlfh.supabase.co'
const SUPABASE_KEY = 'sb_publishable_Z9E8KLU8ZIMcWjD-bMG5gg_eM585qWq'

let _token = null

function _headers(extra = {}) {
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + (_token || SUPABASE_KEY),
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    ...extra
  }
}

// Retry on 401 (token expirado → refreshSession → nova tentativa)
async function _retry401(fn) {
  let r = await fn()
  if (r.status === 401 && typeof refreshSession === 'function') {
    const ok = await refreshSession()
    if (ok) r = await fn()
  }
  return r
}

// REST helpers
async function sbGet(table, params = '') {
  const r = await _retry401(() => fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, { headers: _headers() }))
  if (!r.ok) throw new Error(`GET ${table}: ${r.status}`)
  return r.json()
}

async function sbPost(table, body) {
  const r = await _retry401(() => fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: _headers(),
    body: JSON.stringify(body)
  }))
  if (!r.ok) { const e = await r.text(); throw new Error(`POST ${table}: ${r.status} ${e}`) }
  return r.json()
}

async function sbPatch(table, id, body) {
  const r = await _retry401(() => fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: _headers(),
    body: JSON.stringify(body)
  }))
  if (!r.ok) { const e = await r.text(); throw new Error(`PATCH ${table}: ${r.status} ${e}`) }
  return r.json()
}

async function sbDelete(table, id) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'DELETE',
    headers: _headers()
  })
  if (!r.ok) throw new Error(`DELETE ${table}: ${r.status}`)
  return true
}

// RPC
async function sbRpc(fn, body = {}) {
  const r = await _retry401(() => fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: _headers(),
    body: JSON.stringify(body)
  }))
  if (!r.ok) { const e = await r.text(); throw new Error(`RPC ${fn}: ${r.status} ${e}`) }
  const text = await r.text()
  return text ? JSON.parse(text) : null
}

// Exportar token (usado pelo auth.js)
function setToken(t) { _token = t }
function getToken() { return _token }
