const CACHE_NAME = 'spendwise-cache-v1'
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/logo.svg',
  '/manifest.json',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('Pre-caching non-fatal warning:', err)
      })
    })
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key)
          }
        })
      )
    })
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  // Only handle GET requests and skip chrome-extension or external cross-origin APIs
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)

  // Don't intercept Google Drive or external API requests
  if (url.origin !== self.location.origin) return

  // Network-first strategy with cache fallback for HTML pages and app assets
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache)
          })
        }
        return networkResponse
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse
          // Fallback to index.html for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('/')
          }
          return new Response('Network error and no offline cache available.', {
            status: 503,
            statusText: 'Service Unavailable',
          })
        })
      })
  )
})
