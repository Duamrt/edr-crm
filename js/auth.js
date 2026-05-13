// EDR CRM — Autenticação
const SESSION_KEY = 'edr_crm_session'

let _usuario = null

// FOUC prevention — chamado antes de qualquer render em páginas protegidas
function authGuard() {
  const s = sessionGet()
  if (!s) {
    window.location.replace('index.html')
    return false
  }
  setToken(s.token)
  _usuario = s.usuario
  return true
}

function sessionGet() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)) } catch { return null }
}
function sessionSet(token, usuario, refresh_token = null) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token, usuario, refresh_token }))
}
function sessionClear() {
  localStorage.removeItem(SESSION_KEY)
  _token = null
  _usuario = null
}

function getUsuario() { return _usuario }

async function refreshSession() {
  const s = sessionGet()
  if (!s?.refresh_token) { sessionClear(); window.location.replace('index.html'); return false }
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: s.refresh_token })
    })
    if (!r.ok) { sessionClear(); window.location.replace('index.html'); return false }
    const data = await r.json()
    setToken(data.access_token)
    sessionSet(data.access_token, s.usuario, data.refresh_token)
    return true
  } catch { return false }
}

async function login(email, senha) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: senha })
  })
  if (!r.ok) {
    const e = await r.json()
    throw new Error(e.error_description || 'Login inválido')
  }
  const data = await r.json()
  setToken(data.access_token)

  // Buscar perfil CRM
  let perfil = null
  try {
    const rows = await sbGet('crm_profiles', `?id=eq.${data.user.id}&select=*`)
    perfil = rows[0] || { id: data.user.id, nome: data.user.email, role: 'operador' }
  } catch {
    perfil = { id: data.user.id, nome: data.user.email, role: 'operador' }
  }

  sessionSet(data.access_token, { ...data.user, ...perfil }, data.refresh_token)
  return perfil
}

async function logout() {
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + getToken() }
    })
  } catch {}
  sessionClear()
  window.location.replace('index.html')
}
