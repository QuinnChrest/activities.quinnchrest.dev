// Minimal service worker: makes the app installable and usable offline once visited.
// - Navigations & activities.json: network-first (fresh data after each weekly sync), cache fallback.
// - Everything else same-origin (hashed assets, icons): cache-first.
// Map tiles / fonts from other origins are left to the browser.
const CACHE = 'motion-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

const put = (req, res) => {
  if (res.ok) {
    const copy = res.clone()
    caches.open(CACHE).then((c) => c.put(req, copy))
  }
  return res
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  const networkFirst = req.mode === 'navigate' || url.pathname.endsWith('.json')
  if (networkFirst) {
    event.respondWith(
      fetch(req)
        .then((res) => put(req, res))
        .catch(() => caches.match(req).then((hit) => hit ?? caches.match('./'))),
    )
    return
  }
  event.respondWith(caches.match(req).then((hit) => hit ?? fetch(req).then((res) => put(req, res))))
})
