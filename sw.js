/* 長野 林道カルテマップ Service Worker — アプリシェル＋地図タイルのオフラインキャッシュ */
const CACHE = "rindo-map-v3";
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

  // 地図タイル(GSI) / MapLibre CDN(JS/CSS) / グリフ: ネットワーク優先（常に最新を取得）
  //   ・オフライン/取得失敗時のみキャッシュへフォールバック（地図を見られる状態を維持）
  //   ・MapLibre本体(JS/CSS)をキャッシュ優先にすると、初回に不完全なレスポンスが
  //     キャッシュされた場合にレイアウト崩れ等が固定化されてしまうため、鮮度を優先する
  const runtime = /cyberjapandata\.gsi\.go\.jp/.test(url.host)
    || /demotiles\.maplibre\.org/.test(url.host)
    || /unpkg\.com/.test(url.host);
  if (runtime) {
    e.respondWith(fetch(req).then(res => {
      if (res && (res.ok || res.type === "opaque")) {
        const cl = res.clone();
        caches.open(CACHE).then(c => c.put(req, cl));
      }
      return res;
    }).catch(() => caches.open(CACHE).then(c => c.match(req))));
    return;
  }

  // アプリシェル(同一オリジン): ネットワーク優先（更新を即反映）→ 失敗時キャッシュ→index.htmlフォールバック（オフライン）
  e.respondWith(
    fetch(req).then(res => {
      if (res && res.ok && url.origin === location.origin) {
        const cl = res.clone();
        caches.open(CACHE).then(c => c.put(req, cl));
      }
      return res;
    }).catch(() => caches.match(req).then(hit => hit || caches.match("./index.html")))
  );
});
