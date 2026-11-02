// שומר את קבצי האפליקציה ואת תמונות הפוסטרים, כדי שהכול ייפתח מהר (גם בלי אינטרנט).
// מידע מ-AniList (פרקים, ציונים) לא נשמר כאן - הוא תמיד מגיע עדכני.
const CACHE = "anime-tracker-v78";
const IMG_CACHE = "anime-images-v1";   // תמונות לא משתנות, אז נשמרות גם בין גרסאות
const FONT_CACHE = "anime-fonts-v1";
const SHELL = ["./", "index.html", "he-names.js?v=78", "manifest.webmanifest", "icon-192.png", "icon-512.png"];
const KEEP = [CACHE, IMG_CACHE, FONT_CACHE];
const IMG_MAX = 800;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => !KEEP.includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

let trimTimer = null;
function trimImages(){
  clearTimeout(trimTimer);
  trimTimer = setTimeout(async () => {
    const c = await caches.open(IMG_CACHE); const keys = await c.keys();
    for (let i = 0; i < keys.length - IMG_MAX; i++) await c.delete(keys[i]);
  }, 5000);
}
// קודם מהמטמון (מיידי), ואם אין - מהרשת ושומרים. התמונה עצמה לא משתנה, אז האיכות זהה.
// מבקשים את הקובץ במצב CORS כדי שלא יישמר כ"אטום" (שתופס הרבה מקום בטלפון). אם השרת לא מאפשר - מביאים רגיל ולא שומרים.
function cacheFirst(req, cacheName, trim){
  return caches.open(cacheName).then(c => c.match(req.url).then(hit => hit || fetch(req.url, { mode: "cors", credentials: "omit" }).then(r => {
    if (r && r.ok) { c.put(req.url, r.clone()); if (trim) trimImages(); }
    return r;
  }).catch(() => fetch(req))));
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // פוסטרים ובאנרים מ-AniList
  if (/(^|\.)anilist\.co$/.test(url.hostname) && url.hostname !== "graphql.anilist.co" && /\.(jpe?g|png|webp|gif)$/i.test(url.pathname)) {
    e.respondWith(cacheFirst(req, IMG_CACHE, true)); return;
  }
  // גופנים
  if (url.hostname === "fonts.gstatic.com" || url.hostname === "fonts.googleapis.com") {
    e.respondWith(cacheFirst(req, FONT_CACHE, false)); return;
  }
  if (url.origin !== location.origin) return;
  // בדיקת גרסה - תמיד מהרשת
  if (url.pathname.endsWith("version.json")) return;
  // קודם רשת (כדי לקבל גרסאות חדשות). אם הרשת איטית מ-3 שניות או אין אינטרנט - מהמטמון, והעדכון ימשיך ברקע
  const net = fetch(req.url, { cache: "no-cache" }).then(r => {
    const copy = r.clone();
    caches.open(CACHE).then(c => c.put(req, copy));
    return r;
  });
  const fromCache = () => caches.match(req).then(r => r || caches.match("index.html"));
  e.respondWith(new Promise(resolve => {
    let done = false;
    const t = setTimeout(() => fromCache().then(r => { if (!done && r) { done = true; resolve(r); } }), 3000);
    net.then(r => { if (!done) { done = true; clearTimeout(t); resolve(r); } })
       .catch(() => fromCache().then(r => { if (!done) { done = true; clearTimeout(t); resolve(r || Response.error()); } }));
  }));
});
