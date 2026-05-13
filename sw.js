const VERSION = '1778688065'
const CACHE = 'edr-crm-v' + VERSION

// Somente assets estáticos com cache-buster — HTML nunca entra no precache
const ASSETS = [
  'css/style.css?cb=' + VERSION,
  'js/supabase.js?cb=' + VERSION,
  'js/auth.js?cb=' + VERSION,
  'js/utils.js?cb=' + VERSION
]

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
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
  const isHtml = url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname === ''

  if (isHtml) {
    // HTML: network-first — sempre busca versão fresca; cache só como fallback offline
    e.respondWith(
      fetch(e.request)
        .then(response => {
          const clone = response.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
          return response
        })
        .catch(() => caches.match(e.request))
    )
    return
  }

  // JS/CSS/imagens: cache-first (já têm ?cb= para invalidar na próxima versão)
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request))
  )
})
