// שומר את קבצי האפליקציה כדי שתיפתח גם בלי אינטרנט. מידע מ-AniList לא נשמר כאן.
const CACHE = "anime-tracker-v70";
const SHELL = ["./", "index.html", "he-names.js", "manifest.webmanifest", "icon-192.png", "icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // קודם רשת (כדי לקבל גרסאות חדשות), ואם אין אינטרנט - מהמטמון
  e.respondWith(
    fetch(e.request.url, { cache: "no-cache" }).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request).then(r => r || caches.match("index.html")))
  );
});
