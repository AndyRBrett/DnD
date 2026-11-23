// Service worker: makes D&D Table Live installable from the home screen and
// opens the last copy of the app when the network drops. The table itself
// (Supabase, or the local server's /api/) is never cached: it's always live.
// The hosted build stamps VERSION, so each release gets a fresh cache.
const VERSION = "local";
const CACHE = "dnd-" + VERSION;
// Everything the page needs to start, at the exact URLs it asks for (the
// hosted build rewrites this list with each release's ?v= URLs), so the app
// opens offline after a single visit.
const SHELL = ["./", "index.html", "style.css", "theme.js", "app.js", "backend.js", "campaign.js", "config.js", "dice.js", "dice3d.js", "encounter.js", "rules.js", "scene-options.js", "manifest.json", "icons/icon-192.png", "fonts/barlow-400-latin.woff2", "fonts/barlow-500-latin.woff2", "fonts/barlow-600-latin.woff2", "fonts/barlow-700-latin.woff2", "fonts/barlow-condensed-600-latin.woff2", "fonts/barlow-condensed-700-latin.woff2"];

// The new release's shell is saved in full before it takes over (addAll
// fails the install if any file is missing, and the old one keeps running).
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE)
    .then(cache => cache.addAll(SHELL.map(url => new Request(url, { cache: "no-cache" }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith("dnd-") && key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

// Network first, so a new release shows up right away; the saved copy only
// when offline. Pages are saved under "./" (a table link opens the same app).
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.includes("/api/")) return;
  const key = request.mode === "navigate" ? "./" : request;
  event.respondWith(fetch(request, { cache: "no-cache" })
    .then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(key, copy));
      }
      return response;
    })
    .catch(() => caches.match(key).then(hit => hit || Promise.reject(new Error("offline")))));
});
