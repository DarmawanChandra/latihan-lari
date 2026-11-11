/* ================================================================
   logika.js — hitungan aplikasi Latihan Lari (tanpa tampilan)

   Isi:
   1. PROGRAM   : 24 sesi (8 minggu x 3 hari). Lari diselingi jalan,
                  larinya makin panjang sampai 30 menit tanpa henti.
   2. Jam       : stopwatch yang bisa dijeda dan dilompati.
   3. GPS       : hitung jarak dari titik lokasi. Titik yang meleset,
                  loncat, atau cuma goyang dibuang.
   4. Ringkasan : total, per minggu, grafik, dan kalimat untuk suara.
   Bagian ini tidak menyentuh halaman, jadi bisa dites di laptop.
   ================================================================ */
'use strict';

const Lari = (function () {
  /* ---------- Teks ---------- */
  const NAMA = { pemanasan: 'Pemanasan', lari: 'Lari', jalan: 'Jalan', pendinginan: 'Pendinginan' };
  const NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  /* ---------- Batas GPS ---------- */
  const GPS_MAKS_MELESET = 35; // meter. Titik yang lebih meleset dibuang.
  const GPS_MAKS_LAJU = 9;     // meter/detik (sekitar 32 km/jam). Lebih cepat = titik loncat.
  const GPS_LANGKAH_MIN = 5;   // meter. Gerakan lebih kecil dianggap GPS goyang.
  const GPS_LANGKAH_MAKS = 25; // meter. Batas atas syarat gerakan saat GPS kurang tepat.
  const GPS_HILANG = 20000;    // milidetik tanpa titik baru = sinyal hilang
  const GPS_LONCAT_ULANG = 5;  // loncat 5x berturut-turut = patokan lama yang salah

  /* ================================================================
     ANGKA DAN WAKTU
     ================================================================ */
  function angka(x) { return typeof x === 'number' && isFinite(x) && x >= 0 ? x : 0; }
  function dua(n) { return (n < 10 ? '0' : '') + n; }

  // 75 -> "1:15", 3725 -> "1:02:05"
  function jamDigital(detik) {
    const d = Math.max(0, Math.floor(angka(detik)));
    const j = Math.floor(d / 3600), m = Math.floor((d % 3600) / 60), s = d % 60;
    return j > 0 ? j + ':' + dua(m) + ':' + dua(s) : m + ':' + dua(s);
  }

  // 90 -> "1 mnt 30 dtk"
  function durasiPendek(detik) {
    const d = Math.round(angka(detik));
    const m = Math.floor(d / 60), s = d % 60;
    if (m === 0) return s + ' dtk';
    return s === 0 ? m + ' mnt' : m + ' mnt ' + s + ' dtk';
  }

  // 90 -> "1 menit 30 detik" (untuk suara pemandu)
  function durasiUcap(detik) {
    const d = Math.round(angka(detik));
    const m = Math.floor(d / 60), s = d % 60;
    if (m === 0) return s + ' detik';
    return s === 0 ? m + ' menit' : m + ' menit ' + s + ' detik';
  }

  function totalMenit(detik) { return Math.round(angka(detik) / 60) + ' mnt'; }

  // 8100 -> "2 jam 15 mnt"
  function lamaTotal(detik) {
    const menit = Math.round(angka(detik) / 60);
    const j = Math.floor(menit / 60), m = menit % 60;
    if (j === 0) return m + ' mnt';
    return m === 0 ? j + ' jam' : j + ' jam ' + m + ' mnt';
  }

  // 1234 meter -> "1,23" (dibulatkan ke bawah, supaya 4,99 km tidak tertulis 5,00)
  function km(meter) {
    return (Math.floor(angka(meter) / 10) / 100).toFixed(2).replace('.', ',');
  }

  // Pace = berapa detik untuk 1 km. null kalau jaraknya masih terlalu pendek.
  function pace(detik, meter) {
    if (!(meter >= 50) || !(detik > 0)) return null;
    return detik / (meter / 1000);
  }

  // 445 -> "7:25"
  function paceTeks(detikPerKm) {
    if (!detikPerKm || !isFinite(detikPerKm)) return '–';
    const d = Math.round(detikPerKm);
    if (d >= 6000) return '–'; // lebih dari 100 menit per km: tidak masuk akal
    return Math.floor(d / 60) + ':' + dua(d % 60);
  }

  // "Selasa, 10 Nov · 18.05" (tahun ditulis kalau bukan tahun ini)
  function tanggalTeks(tgl, kini) {
    const tahun = tgl.getFullYear() !== kini.getFullYear() ? ' ' + tgl.getFullYear() : '';
    return NAMA_HARI[tgl.getDay()] + ', ' + tgl.getDate() + ' ' + BULAN_PENDEK[tgl.getMonth()] + tahun +
      ' · ' + dua(tgl.getHours()) + '.' + dua(tgl.getMinutes());
  }

  /* ================================================================
     PROGRAM 8 MINGGU
     Tiap sesi: pemanasan jalan 5 menit -> inti -> pendinginan jalan 5 menit
     ================================================================ */
  function bagian(jenis, menit) { return { jenis: jenis, detik: Math.round(menit * 60) }; }

  // n kali lari diselingi jalan. Sesudah lari terakhir tidak ada jalan,
  // karena langsung masuk pendinginan.
  function selang(n, menitLari, menitJalan) {
    const hasil = [];
    for (let i = 0; i < n; i++) {
      hasil.push(bagian('lari', menitLari));
      if (i < n - 1) hasil.push(bagian('jalan', menitJalan));
    }
    return hasil;
  }

  // Urutan bebas dalam menit: lari, jalan, lari, ...
  function urut(...menit) {
    return menit.map((m, i) => bagian(i % 2 === 0 ? 'lari' : 'jalan', m));
  }

  function jumlahDetik(daftar) { return daftar.reduce((s, b) => s + b.detik, 0); }

  // Kalimat singkat isi sesi, contoh "7× lari 1 mnt, jalan 2 mnt"
  function ringkasInti(inti) {
    if (inti.length === 1) return 'Lari ' + durasiPendek(inti[0].detik) + ' tanpa henti';
    const lari = inti.filter(b => b.jenis === 'lari');
    const jalan = inti.filter(b => b.jenis === 'jalan');
    const samaLari = lari.every(b => b.detik === lari[0].detik);
    const samaJalan = jalan.every(b => jalan.length && b.detik === jalan[0].detik);
    if (samaLari && samaJalan && lari.length > 1 && jalan.length > 0) {
      return lari.length + '× lari ' + durasiPendek(lari[0].detik) + ', jalan ' + durasiPendek(jalan[0].detik);
    }
    const teks = inti.map(b => b.jenis + ' ' + durasiPendek(b.detik)).join(' → ');
    return teks.charAt(0).toUpperCase() + teks.slice(1);
  }

  // Isi inti tiap sesi. Satu baris = satu minggu (hari 1, hari 2, hari 3).
  const ISI_PROGRAM = [
    [selang(7, 1, 2), selang(8, 1, 1.5), selang(6, 1.5, 2)],   // Minggu 1
    [selang(6, 2, 2), selang(6, 2, 1.5), selang(5, 3, 2)],     // Minggu 2
    [selang(5, 3, 1.5), selang(4, 4, 2), selang(4, 5, 2)],     // Minggu 3
    [selang(4, 5, 1.5), selang(3, 7, 2), selang(3, 8, 2)],     // Minggu 4
    [selang(3, 8, 1.5), selang(2, 12, 2), urut(15, 2, 10)],    // Minggu 5
    [urut(18, 2, 8), urut(20, 2, 6), urut(20)],                // Minggu 6
    [urut(22), urut(24), urut(25)],                            // Minggu 7
    [urut(27), urut(28), urut(30)]                             // Minggu 8
  ];

  const PROGRAM = [];
  ISI_PROGRAM.forEach((tigaHari, m) => {
    tigaHari.forEach((inti, h) => {
      const isi = [bagian('pemanasan', 5)].concat(inti, [bagian('pendinginan', 5)]);
      PROGRAM.push({
        id: 'm' + (m + 1) + 'h' + (h + 1),
        minggu: m + 1,
        hari: h + 1,
        judul: 'Minggu ' + (m + 1) + ' · Hari ' + (h + 1),
        ringkas: ringkasInti(inti),
        bagian: isi,
        totalDetik: jumlahDetik(isi),
        detikLari: jumlahDetik(inti.filter(b => b.jenis === 'lari'))
      });
    });
  });

  function cariSesi(id) { return PROGRAM.find(s => s.id === id) || null; }
  function sesiBerikut(selesai) { return PROGRAM.find(s => !(selesai && selesai[s.id])) || null; }

  /* ================================================================
     JAM (STOPWATCH)
     status: 'siap' -> 'aktif' <-> 'jeda' -> 'selesai'
     simpanan = milidetik aktif sebelum jeda terakhir
     lompat   = milidetik yang dilewati dengan tombol Lewati
     ================================================================ */
  function jamBaru() { return { status: 'siap', simpanan: 0, mulaiPada: 0, lompat: 0 }; }

  // Lama benar-benar latihan (tanpa jeda dan tanpa bagian yang dilewati)
  function waktuAktif(j, kini) {
    return j.simpanan + (j.status === 'aktif' ? Math.max(0, kini - j.mulaiPada) : 0);
  }

  // Posisi di urutan program (ikut bagian yang dilewati)
  function waktuProgram(j, kini) { return waktuAktif(j, kini) + j.lompat; }

  function jamMulai(j, kini) {
    if (j.status === 'siap' || j.status === 'jeda') { j.status = 'aktif'; j.mulaiPada = kini; }
    return j;
  }

  function jamJeda(j, kini) {
    if (j.status === 'aktif') { j.simpanan = waktuAktif(j, kini); j.mulaiPada = 0; j.status = 'jeda'; }
    return j;
  }

  function jamSelesai(j, kini) {
    jamJeda(j, kini);
    j.status = 'selesai';
    return j;
  }

  // Lompat ke titik tertentu di urutan program (milidetik)
  function jamLompatKe(j, kini, targetMs) {
    const sekarang = waktuProgram(j, kini);
    if (targetMs > sekarang) j.lompat += targetMs - sekarang;
    return j;
  }

  // Aplikasi tertutup tiba-tiba: lanjutkan dalam keadaan jeda,
  // dengan waktu sampai saat terakhir disimpan.
  function jamPulihkan(j, disimpanPada) {
    if (!j || typeof j !== 'object') return jamBaru();
    let simpanan = angka(j.simpanan);
    const lompat = angka(j.lompat);
    if (j.status === 'aktif') simpanan += Math.max(0, angka(disimpanPada) - angka(j.mulaiPada));
    return { status: simpanan > 0 || lompat > 0 ? 'jeda' : 'siap', simpanan: simpanan, mulaiPada: 0, lompat: lompat };
  }

  /* ================================================================
     URUTAN SESI
     ================================================================ */
  function garisWaktu(bagianSesi) {
    let t = 0;
    return bagianSesi.map(b => {
      const g = { jenis: b.jenis, detik: b.detik, awal: t, akhir: t + b.detik };
      t += b.detik;
      return g;
    });
  }

  // Sedang di bagian mana pada detik ke-sekian
  function posisi(garis, detik) {
    const total = garis.length ? garis[garis.length - 1].akhir : 0;
    const d = Math.max(0, detik);
    if (d >= total) return { indeks: garis.length, selesai: true, bagian: null, sisa: 0, sisaTotal: 0, kemajuan: 1 };
    let i = 0;
    while (d >= garis[i].akhir) i++;
    return {
      indeks: i, selesai: false, bagian: garis[i],
      sisa: garis[i].akhir - d, sisaTotal: total - d, kemajuan: d / total
    };
  }

  // "Lari ke-2 dari 7 · Berikutnya: jalan 2 mnt"
  function infoBerikut(garis, indeks) {
    const kini = garis[indeks];
    if (!kini) return '';
    let teks = '';
    const semuaLari = garis.filter(b => b.jenis === 'lari').length;
    if (kini.jenis === 'lari' && semuaLari > 1) {
      const ke = garis.slice(0, indeks + 1).filter(b => b.jenis === 'lari').length;
      teks = 'Lari ke-' + ke + ' dari ' + semuaLari + ' · ';
    }
    const lanjut = garis[indeks + 1];
    teks += lanjut ? 'Berikutnya: ' + NAMA[lanjut.jenis].toLowerCase() + ' ' + durasiPendek(lanjut.detik) : 'Bagian terakhir';
    return teks;
  }

  // Kalimat suara pemandu saat masuk bagian baru
  function ucapanBagian(garis, indeks) {
    const b = garis[indeks];
    if (!b) return '';
    const lama = durasiUcap(b.detik);
    if (b.jenis === 'pemanasan') return 'Pemanasan. Jalan santai ' + lama + '.';
    if (b.jenis === 'pendinginan') return 'Pendinginan. Jalan santai ' + lama + '.';
    if (b.jenis === 'jalan') return 'Jalan, ' + lama + '.';
    const adaSebelum = garis.slice(0, indeks).some(x => x.jenis === 'lari');
    const adaSesudah = garis.slice(indeks + 1).some(x => x.jenis === 'lari');
    return (adaSebelum && !adaSesudah ? 'Lari terakhir, ' : 'Lari, ') + lama + '.';
  }

  // Kalimat suara tiap 1 km
  function ucapanKm(nomorKm, detikPerKm) {
    const awal = nomorKm === 5 ? '5 kilometer. Target tercapai!' : nomorKm + ' kilometer.';
    return detikPerKm ? awal + ' Rata-rata ' + durasiUcap(Math.round(detikPerKm)) + ' per kilometer.' : awal;
  }

  /* ================================================================
     GPS
     ================================================================ */
  function jarakMeter(a, b) {
    const R = 6371008.8, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function rekamBaru() { return { terakhir: null, jarak: 0, loncat: 0 }; }

  // Tambah satu titik { lat, lon, meleset (meter), waktu (milidetik) }.
  // Hasil: 'patokan' | 'tambah' | 'kecil' | 'meleset' | 'loncat' | 'patokan-baru' | 'salah'
  function rekamTitik(r, t) {
    if (!t || !isFinite(t.lat) || !isFinite(t.lon) || !isFinite(t.waktu)) return 'salah';
    const meleset = isFinite(t.meleset) && t.meleset > 0 ? t.meleset : 0;
    if (meleset > GPS_MAKS_MELESET) return 'meleset';
    if (!r.terakhir) { r.terakhir = t; r.loncat = 0; return 'patokan'; }
    const d = jarakMeter(r.terakhir, t);
    const dt = (t.waktu - r.terakhir.waktu) / 1000;
    if (dt <= 0) return 'kecil';
    if (d / dt > GPS_MAKS_LAJU) {
      r.loncat++;
      if (r.loncat >= GPS_LONCAT_ULANG) { r.terakhir = t; r.loncat = 0; return 'patokan-baru'; }
      return 'loncat';
    }
    r.loncat = 0;
    const langkahMin = Math.min(GPS_LANGKAH_MAKS, Math.max(GPS_LANGKAH_MIN, meleset));
    if (d < langkahMin) return 'kecil';
    r.jarak += d;
    r.terakhir = t;
    return 'tambah';
  }

  // Tulisan dan warna lampu GPS di layar latihan
  function infoGps(g, kini) {
    if (g.status === 'mati') return { teks: 'GPS mati', warna: 'abu' };
    if (g.status === 'tidak-ada') return { teks: 'Tanpa GPS', warna: 'abu' };
    if (g.status === 'ditolak') return { teks: 'Lokasi tidak diizinkan', warna: 'abu' };
    if (g.status === 'mencari' || !g.terakhir) return { teks: 'Mencari GPS…', warna: 'kuning' };
    if (kini - g.terakhir > GPS_HILANG) return { teks: 'Sinyal GPS hilang', warna: 'kuning' };
    const m = Math.round(g.meleset);
    return g.status === 'bagus' ? { teks: 'GPS ±' + m + ' m', warna: 'hijau' } : { teks: 'GPS lemah ±' + m + ' m', warna: 'kuning' };
  }

  /* ================================================================
     RINGKASAN DAN GRAFIK
     ================================================================ */
  // Senin pukul 00.00 di minggu tanggal itu
  function awalMinggu(tgl) {
    const d = new Date(tgl.getTime());
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }

  // Total per minggu, dari yang paling lama sampai minggu ini
  function perMinggu(riwayat, kini, jumlah) {
    const mulai = awalMinggu(kini);
    const minggu = [];
    for (let i = jumlah - 1; i >= 0; i--) {
      const a = new Date(mulai.getTime());
      a.setDate(a.getDate() - 7 * i);
      minggu.push({ awal: a, detik: 0, meter: 0, kali: 0 });
    }
    riwayat.forEach(c => {
      const t = awalMinggu(new Date(c.tanggal)).getTime();
      const m = minggu.find(x => x.awal.getTime() === t);
      if (m) { m.detik += angka(c.detik); m.meter += angka(c.meter); m.kali++; }
    });
    return minggu;
  }

  function jumlahkan(riwayat) {
    return riwayat.reduce((s, c) => ({ kali: s.kali + 1, detik: s.detik + angka(c.detik), meter: s.meter + angka(c.meter) }),
      { kali: 0, detik: 0, meter: 0 });
  }

  // Grafik batang menit latihan per minggu (SVG)
  function grafikMinggu(minggu) {
    const L = 320, T = 170, atas = 24, bawah = 26;
    const tinggi = T - atas - bawah;
    const menit = minggu.map(m => m.detik / 60);
    const skala = Math.ceil(Math.max(30, ...menit) / 15) * 15;
    const slot = L / Math.max(1, minggu.length);
    const lebar = Math.min(26, slot * 0.6);
    const ini = minggu.length ? Math.round(menit[menit.length - 1]) : 0;
    let svg = '<svg class="grafik" viewBox="0 0 ' + L + ' ' + T + '" role="img" aria-label="Menit latihan per minggu, ' +
      minggu.length + ' minggu terakhir. Minggu ini ' + ini + ' menit.">';
    svg += '<line class="g-dasar" x1="0" y1="' + (T - bawah) + '" x2="' + L + '" y2="' + (T - bawah) + '"/>';
    minggu.forEach((m, i) => {
      const terakhir = i === minggu.length - 1;
      const x = i * slot + (slot - lebar) / 2;
      const tengah = (x + lebar / 2).toFixed(1);
      if (m.detik > 0) {
        const h = Math.max(3, menit[i] / skala * tinggi);
        const y = T - bawah - h;
        svg += '<rect class="g-batang' + (terakhir ? ' ini' : '') + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) +
          '" width="' + lebar.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="4"/>';
        svg += '<text class="g-angka" x="' + tengah + '" y="' + (y - 6).toFixed(1) + '" text-anchor="middle">' + Math.round(menit[i]) + '</text>';
      }
      const label = terakhir ? 'Ini' : m.awal.getDate() + '/' + (m.awal.getMonth() + 1);
      svg += '<text class="g-label' + (terakhir ? ' ini' : '') + '" x="' + tengah + '" y="' + (T - 8) + '" text-anchor="middle">' + label + '</text>';
    });
    return svg + '</svg>';
  }

  /* ================================================================
     DATA: bentuk awal, pemeriksaan, cadangan
     ================================================================ */
  function dataBaru() {
    return { selesai: {}, riwayat: [], pengaturan: { suara: true, bip: true, getar: true, gps: true } };
  }

  function catatanSah(c) {
    return !!c && typeof c === 'object' &&
      typeof c.id === 'string' && c.id !== '' &&
      typeof c.tanggal === 'string' && !isNaN(Date.parse(c.tanggal)) &&
      typeof c.detik === 'number' && isFinite(c.detik) && c.detik >= 0 &&
      (c.meter == null || (typeof c.meter === 'number' && isFinite(c.meter) && c.meter >= 0));
  }

  function rapikanCatatan(c) {
    const program = c.jenis === 'program' && !!cariSesi(c.sesi);
    return {
      id: c.id,
      tanggal: c.tanggal,
      jenis: program ? 'program' : 'bebas',
      sesi: program ? c.sesi : null,
      judul: typeof c.judul === 'string' && c.judul ? c.judul.slice(0, 80) : 'Lari',
      detik: Math.round(c.detik),
      meter: c.meter == null ? null : Math.round(c.meter),
      tuntas: !!c.tuntas,
      rasa: c.rasa === 'ringan' || c.rasa === 'pas' || c.rasa === 'berat' ? c.rasa : null,
      catatan: typeof c.catatan === 'string' ? c.catatan.slice(0, 500) : ''
    };
  }

  // Lengkapi data (dari HP atau dari file cadangan) supaya aplikasi tidak error
  function rapikanData(d) {
    const hasil = dataBaru();
    if (!d || typeof d !== 'object') return hasil;
    if (d.selesai && typeof d.selesai === 'object' && !Array.isArray(d.selesai)) {
      Object.keys(d.selesai).forEach(id => {
        if (cariSesi(id) && typeof d.selesai[id] === 'string') hasil.selesai[id] = d.selesai[id];
      });
    }
    if (Array.isArray(d.riwayat)) {
      const sudahAda = new Set();
      d.riwayat.forEach(c => {
        if (catatanSah(c) && !sudahAda.has(c.id)) { sudahAda.add(c.id); hasil.riwayat.push(rapikanCatatan(c)); }
      });
    }
    if (d.pengaturan && typeof d.pengaturan === 'object') {
      Object.keys(hasil.pengaturan).forEach(k => {
        if (typeof d.pengaturan[k] === 'boolean') hasil.pengaturan[k] = d.pengaturan[k];
      });
    }
    return hasil;
  }

  // Baca isi file cadangan. Hasilnya null kalau file tidak cocok.
  function bacaCadangan(teks) {
    let isi;
    try { isi = JSON.parse(teks); } catch (e) { return null; }
    const d = isi && isi.data ? isi.data : isi;
    if (!d || typeof d !== 'object' || !Array.isArray(d.riwayat) || !d.selesai || typeof d.selesai !== 'object') return null;
    return rapikanData(d);
  }

  // Simpanan latihan yang tertutup tiba-tiba: masih bisa dilanjutkan?
  function cuplikanSah(c, kini) {
    if (!c || typeof c !== 'object' || !c.jam || typeof c.jam !== 'object') return false;
    if (c.jenis !== 'program' && c.jenis !== 'bebas') return false;
    if (c.jenis === 'program' && !cariSesi(c.sesi)) return false;
    if (typeof c.disimpanPada !== 'number' || !isFinite(c.disimpanPada)) return false;
    const umur = kini - c.disimpanPada;
    return umur > -60000 && umur < 12 * 3600 * 1000; // lebih dari 12 jam: sudah basi
  }

  return {
    NAMA, PROGRAM, GPS_MAKS_MELESET,
    angka, jamDigital, durasiPendek, durasiUcap, totalMenit, lamaTotal, km, pace, paceTeks, tanggalTeks,
    cariSesi, sesiBerikut, ringkasInti,
    jamBaru, waktuAktif, waktuProgram, jamMulai, jamJeda, jamSelesai, jamLompatKe, jamPulihkan,
    garisWaktu, posisi, infoBerikut, ucapanBagian, ucapanKm,
    jarakMeter, rekamBaru, rekamTitik, infoGps,
    awalMinggu, perMinggu, jumlahkan, grafikMinggu,
    dataBaru, catatanSah, rapikanData, bacaCadangan, cuplikanSah
  };
})();

// Untuk tes di laptop (Node.js). Di browser baris ini tidak berpengaruh.
if (typeof module !== 'undefined' && module.exports) module.exports = Lari;
