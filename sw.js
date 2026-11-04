// שומר את קבצי האפליקציה ואת תמונות הפוסטרים, כדי שהכול ייפתח מהר (גם בלי אינטרנט).
// מידע מ-AniList (פרקים, ציונים) לא נשמר כאן - הוא תמיד מגיע עדכני.
const CACHE = "anime-tracker-v112";
const IMG_CACHE = "anime-images-v1";   // תמונות לא משתנות, אז נשמרות גם בין גרסאות
const FONT_CACHE = "anime-fonts-v1";
const SHELL = ["./", "index.html", "he-names.js?v=112", "i18n-en.js?v=112", "manifest.webmanifest", "icon-192.png", "icon-512.png"];
const KEEP = [CACHE, IMG_CACHE, FONT_CACHE];
const IMG_MAX = 800;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => !KEEP.includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// התראה שהגיעה מהשרת (גם כשהאפליקציה סגורה)
self.addEventListener("push", e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "מעקב אנימה", {
    body: d.body || "", icon: "icon-192.png", badge: "icon-192.png", tag: d.tag || undefined, data: { id: d.id || null }, lang: "he", dir: "rtl", requireInteraction: true
  }));
});
// לחיצה על התראה: פותחים את האפליקציה ישר בעמוד של האנימה
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const id = e.notification.data && e.notification.data.id;
  const url = new URL(id ? "./?open=" + id : "./", self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => {
    for (const c of cs) { if (c.url.startsWith(self.registration.scope)) { if (id) c.postMessage({ open: id }); return c.focus(); } }
    return clients.openWindow(url);
  }));
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
  // תמונות דמויות מ-MyAnimeList
  if (url.hostname === "cdn.myanimelist.net" && /\.(jpe?g|png|webp|gif)$/i.test(url.pathname)) {
    e.respondWith(cacheFirst(req, IMG_CACHE, true)); return;
  }
  // גופנים
  if (url.hostname === "fonts.gstatic.com" || url.hostname === "fonts.googleapis.com") {
    e.respondWith(cacheFirst(req, FONT_CACHE, false)); return;
  }
  if (url.origin !== location.origin) return;
  // בדיקת גרסה - תמיד מהרשת
  if (url.pathname.endsWith("version.json")) return;
  // כתובת עם ?v= (מעבר לגרסה חדשה) - קודם רשת, כדי לקבל בוודאות את הגרסה החדשה
  const fresh = () => fetch(req.url, { cache: "no-cache" }).then(r => {
    if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  });
  const fromCache = () => caches.match(req).then(r => r || (req.mode === "navigate" ? caches.match("index.html") : null));
  if (url.searchParams.has("v") && req.mode === "navigate") {
    e.respondWith(fresh().catch(() => fromCache().then(r => r || Response.error())));
    return;
  }
  // כל השאר: מיד מהמטמון (פתיחה מיידית גם ברשת איטית), ובמקביל מעדכנים מהרשת לפעם הבאה.
  // גרסה חדשה מזוהה ע"י version.json ונטענת אוטומטית.
  e.respondWith(fromCache().then(hit => {
    const upd = fresh();
    if (hit) { e.waitUntil(upd.catch(() => {})); return hit; }
    return upd.catch(() => Response.error());
  }));
});
