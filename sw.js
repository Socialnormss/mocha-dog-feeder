const CACHE = 'dog-feeder-v4';
const ASSETS = ['./index.html', './style.css', './nutrition.html', './manifest.json', './icon.png', './firebase-config.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // ลบ cache เก่าทั้งหมด
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  // Firebase CDN และ external scripts → ไม่ cache, โหลดจากเน็ตเสมอ
  if (e.request.url.includes('gstatic.com') || e.request.url.includes('googleapis.com')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // ไฟล์ app (.html, .js, .json) → network-first (ได้ไฟล์ใหม่เสมอ, fallback cache เมื่อออฟไลน์)
  if (e.request.url.match(/\.(html|js|json)$/)) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // รูปและไฟล์อื่น → cache-first
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
