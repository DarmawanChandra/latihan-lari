/* ================================================================
   sw.js — supaya aplikasi tetap bisa dibuka tanpa internet

   Cara kerja:
   - Saat pertama dibuka (masih ada internet), file aplikasi disimpan
     ke cache di HP.
   - Setiap membuka halaman: coba ambil versi terbaru dari internet.
     Kalau tidak ada sinyal, atau 4 detik belum ada jawaban (sinyal
     lemah di luar rumah), pakai salinan di cache.
   Naikkan VERSI setiap ada perubahan file aplikasi.
   ================================================================ */
const VERSI = 'latihan-lari-v2';
const FILE = ['./', 'index.html', 'style.css', 'logika.js', 'app.js', 'manifest.webmanifest',
  'ikon.svg', 'ikon-192.png', 'ikon-512.png', 'vendor/leaflet.js', 'vendor/leaflet.css'];
// Gambar peta (OpenStreetMap) tidak disimpan di sini: diambil dari internet saat dibuka.
const BATAS_TUNGGU = 4000;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSI).then(c => c.addAll(FILE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  // Hapus cache versi lama
  e.waitUntil(
    caches.keys()
      .then(kunci => Promise.all(kunci.filter(k => k !== VERSI).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  // Hanya file aplikasi ini sendiri
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(ambil(req));
});

async function ambil(req) {
  const cache = await caches.open(VERSI);
  const dariInternet = fetch(req).then(res => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  dariInternet.catch(() => { /* ditangani di bawah */ });
  const tunggu = new Promise(selesai => setTimeout(selesai, BATAS_TUNGGU, null));
  try {
    const hasil = await Promise.race([dariInternet, tunggu]);
    if (hasil) return hasil;
  } catch (e) { /* tidak ada internet */ }
  const simpanan = await cache.match(req, { ignoreSearch: true }) ||
    (req.mode === 'navigate' ? await cache.match('index.html') : null);
  return simpanan || dariInternet; // belum ada salinan: tunggu internet saja
}
