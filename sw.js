/* 長野 林道カルテマップ Service Worker — アプリシェル＋地図タイルのオフラインキャッシュ */
const CACHE = "rindo-map-v1";
const SHELL = [
  "./", "./index.html", "./manifest.json", "./icon.svg",
  "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js",
  "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css"
];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Overpass API はネットワーク優先・キャッシュしない（鮮度優先）
  if (/overpass-api\.de/.test(url.host)) return;

  // 地図タイル(GSI) / MapLibre CDN / グリフ: キャッシュ優先＋ランタイム追加（オフライン用）
  const runtime = /cyberjapandata\.gsi\.go\.jp/.test(url.host)
    || /demotiles\.maplibre\.org/.test(url.host)
    || /unpkg\.com/.test(url.host);
  if (runtime) {
    e.respondWith(caches.open(CACHE).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === "opaque")) c.put(req, res.clone());
        return res;
      } catch (_) {
        return hit || Response.error();
      }
    }));
    return;
  }

  // アプリシェル(同一オリジン): キャッシュ優先→ネットワーク→index.htmlフォールバック
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && res.ok && url.origin === location.origin) {
        const cl = res.clone();
        caches.open(CACHE).then(c => c.put(req, cl));
      }
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});
