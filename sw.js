const VERSION = '1779127150'
const CACHE = 'edr-crm-v' + VERSION

// Assets pré-cacheados na instalação do SW
const ASSETS = [
  'css/tokens.css?cb=' + VERSION,
  'css/style.css?cb=' + VERSION,
  'js/supabase.js?cb=' + VERSION,
  'js/auth.js?cb=' + VERSION,
  'js/utils.js?cb=' + VERSION,
  'js/data/clientes.js?cb=' + VERSION,
  'js/data/documentos.js?cb=' + VERSION,
  'js/data/dashboard.js?cb=' + VERSION,
  'js/data/agenda-widget.js?cb=' + VERSION,
  'js/data/agenda-page.js?cb=' + VERSION,
  'favicon.svg'
  // mapa-lotes.jpg (282KB) removido do precache em 17/05/2026
  // Carrega via <link rel="preload"> em lotes.html (lazy) e fica em cache-first depois
]

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS).catch(err => {
        // Falha em algum asset não bloqueia a instalação (img pode estar 404)
        console.warn('SW precache parcial:', err)
      }))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  if (e.request.url.includes('supabase.co')) return  // API nunca em cache

  const url = new URL(e.request.url)
  if (url.pathname.startsWith('/mockups/')) return  // mockups visuais — sempre direto da network
  const isHtml = url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname === ''

  if (isHtml) {
    // HTML: network-first (sempre busca versão nova; cache só como fallback offline)
    // Evita que usuária fique presa em versão antiga após deploy.
    e.respondWith(
      fetch(e.request)
        .then(response => {
          if (response && response.status === 200 && !response.redirected && response.type === 'basic') {
            const clone = response.clone()
            caches.open(CACHE).then(cache => cache.put(e.request, clone))
          }
          return response
        })
        .catch(() => caches.match(e.request))
    )
    return
  }

  // JS/CSS/imagens: cache-first
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request))
  )
})
