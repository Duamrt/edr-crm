const VERSION = '1778683548'
const CACHE = 'edr-crm-v' + VERSION

const ASSETS = [
  'index.html',
  'clientes.html',
  'familia.html',
  'ficha.html',
  'kanban.html',
  'lotes.html',
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
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request))
  )
})
