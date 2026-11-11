/* ================================================================
   app.js — layar dan tombol aplikasi Latihan Lari

   Gambaran besar:
   1. Data disimpan di localStorage HP dengan kunci "latihanLari.v1":
      - selesai    : sesi program yang sudah selesai (id sesi -> tanggal)
      - riwayat    : catatan tiap latihan (waktu, jarak, rasa, catatan)
      - pengaturan : suara pemandu, bip, getar, GPS
   2. Latihan yang sedang berjalan disimpan tiap 5 detik dengan kunci
      "latihanLari.v1.berjalan", supaya bisa dilanjutkan kalau aplikasi
      tertutup tiba-tiba.
   3. Hitungan (program, jam, GPS, grafik) ada di logika.js (objek Lari).
   4. Setiap ada perubahan: ubah data -> simpan() -> gambar ulang.
   ================================================================ */
'use strict';

const KUNCI = 'latihanLari.v1';
const KUNCI_BERJALAN = 'latihanLari.v1.berjalan';
const RASA = { ringan: 'Ringan', pas: 'Pas', berat: 'Berat' };
const JUDUL = { latihan: 'Latihan Lari', riwayat: 'Riwayat', atur: 'Pengaturan' };
const IKON_CENTANG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

let data = muatData();
let latihan = null;           // latihan yang sedang dibuka (null kalau tidak ada)
let kunciLayar = null;        // supaya layar tidak mati saat latihan
let sedangMintaKunci = false;
let suara = null;             // AudioContext untuk bunyi bip
let acaraPasang = null;       // untuk tombol "Pasang"
let waktuKabar = null;
let petaHasil = null;         // peta kecil di jendela hasil
let petaBesar = null;         // peta di jendela Rute
let petaLangsung = false;     // true kalau jendela Rute menampilkan latihan yang sedang berjalan

/* ================================================================
   BANTUAN KECIL
   ================================================================ */
function el(id) { return document.getElementById(id); }

// Ganti teks hanya kalau berubah (dipanggil 4 kali per detik saat latihan)
function teks(id, isi) {
  const e = el(id);
  if (e.textContent !== isi) e.textContent = isi;
}

// Supaya teks ketikan tidak dibaca sebagai kode HTML
function esc(t) {
  return String(t == null ? '' : t).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Buka / tutup jendela (dialog), dengan cadangan untuk browser lama
function bukaJendela(dlg) {
  if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); }
  else dlg.setAttribute('open', '');
}
function tutupJendela(dlg) {
  if (typeof dlg.close === 'function') { if (dlg.open) dlg.close(); }
  else dlg.removeAttribute('open');
}

function kabar(isi) {
  const k = el('kabar');
  k.textContent = isi;
  clearTimeout(waktuKabar);
  waktuKabar = setTimeout(() => { k.textContent = ''; }, 2600);
}

function hariIni() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/* ================================================================
   SIMPAN DAN MUAT DATA
   ================================================================ */
function muatData() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(KUNCI)); } catch (e) { d = null; }
  return Lari.rapikanData(d);
}

function simpan() {
  try {
    localStorage.setItem(KUNCI, JSON.stringify(data));
    return true;
  } catch (e) {
    kabar('Gagal menyimpan. Memori browser mungkin penuh.');
    return false;
  }
}

/* ================================================================
   MENU BAWAH
   ================================================================ */
function bukaTab(nama) {
  document.querySelectorAll('.halaman').forEach(h => h.classList.toggle('aktif', h.id === 'tab-' + nama));
  document.querySelectorAll('.menu-bawah button').forEach(b => {
    const aktif = b.dataset.tab === nama;
    b.classList.toggle('aktif', aktif);
    if (aktif) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  teks('judul-halaman', JUDUL[nama]);
  if (nama === 'latihan') tampilLatihan();
  if (nama === 'riwayat') tampilRiwayat();
  if (nama === 'atur') tampilPengaturan();
  window.scrollTo(0, 0);
}

/* ================================================================
   HALAMAN LATIHAN: sesi berikutnya dan daftar program
   ================================================================ */
function tampilLatihan() {
  const berikut = Lari.sesiBerikut(data.selesai);
  const jumlahSelesai = Lari.PROGRAM.filter(s => data.selesai[s.id]).length;

  el('kartu-berikut').innerHTML = berikut
    ? '<p class="label-kecil">Sesi berikutnya</p>' +
      '<h2>' + esc(berikut.judul) + '</h2>' +
      '<p class="ringkas">' + esc(berikut.ringkas) + '</p>' +
      '<p class="info-kecil">Total ' + Lari.totalMenit(berikut.totalDetik) + ', sudah termasuk pemanasan dan pendinginan jalan 5 menit.</p>' +
      '<button type="button" class="btn utama penuh besar" data-mulai="' + berikut.id + '">Mulai latihan</button>'
    : '<p class="label-kecil">Program selesai</p>' +
      '<h2>Kamu sudah bisa lari 30 menit tanpa henti</h2>' +
      '<p class="ringkas">Lanjut dengan Lari Bebas, lalu kejar 5 km.</p>';

  teks('teks-kemajuan', jumlahSelesai + ' dari ' + Lari.PROGRAM.length + ' sesi selesai');
  el('isi-kemajuan').style.width = Math.round(jumlahSelesai / Lari.PROGRAM.length * 100) + '%';

  let html = '';
  for (let m = 1; m <= 8; m++) {
    html += '<div class="kotak minggu"><h3>Minggu ' + m + '</h3>';
    Lari.PROGRAM.filter(s => s.minggu === m).forEach(s => {
      const sudah = !!data.selesai[s.id];
      const iniBerikut = !!berikut && berikut.id === s.id;
      html += '<button type="button" class="sesi' + (sudah ? ' sudah' : '') + (iniBerikut ? ' berikut' : '') + '" data-detail="' + s.id + '">' +
        '<span class="tanda" aria-hidden="true">' + (sudah ? IKON_CENTANG : s.hari) + '</span>' +
        '<span class="sesi-teks"><b>Hari ' + s.hari + (iniBerikut ? ' <span class="lencana">berikutnya</span>' : '') +
        (sudah ? '<span class="tak-terlihat"> (sudah selesai)</span>' : '') + '</b>' +
        '<small>' + esc(s.ringkas) + '</small></span>' +
        '<span class="sesi-lama">' + Lari.totalMenit(s.totalDetik) + '</span>' +
        '</button>';
    });
    html += '</div>';
  }
  el('daftar-program').innerHTML = html;
  tampilLanjutan();
  el('kotak-pasang').hidden = !acaraPasang;
}

// Jendela isi satu sesi
function bukaDetail(id) {
  const s = Lari.cariSesi(id);
  if (!s) return;
  const dlg = el('dlg-sesi');
  dlg.dataset.id = id;
  teks('sesi-judul', s.judul);
  teks('sesi-ringkas', s.ringkas + ' · total ' + Lari.totalMenit(s.totalDetik));
  el('sesi-urutan').innerHTML = s.bagian.map(b =>
    '<li class="urut-' + b.jenis + '"><span>' + Lari.NAMA[b.jenis] + '</span><b>' + Lari.durasiPendek(b.detik) + '</b></li>').join('');
  teks('sesi-tandai', data.selesai[id] ? 'Tandai belum selesai' : 'Tandai sudah selesai');
  bukaJendela(dlg);
}

function tandaiSesi(id) {
  if (!Lari.cariSesi(id)) return;
  if (data.selesai[id]) delete data.selesai[id];
  else data.selesai[id] = new Date().toISOString();
  simpan();
  tampilLatihan();
}

function mulaiSesi(id) {
  const s = Lari.cariSesi(id);
  if (s) bukaLatihan('program', s, null);
}

/* ================================================================
   LAYAR LATIHAN
   ================================================================ */
function bukaLatihan(jenis, sesi, pulihan) {
  if (latihan) return;
  if (!pulihan && bacaCuplikan()) {
    if (!confirm('Ada latihan yang belum selesai. Buang latihan itu dan mulai yang baru?')) return;
    hapusCuplikan();
  }
  latihan = {
    jenis: jenis,                    // 'program' atau 'bebas'
    sesi: sesi || null,
    garis: sesi ? Lari.garisWaktu(sesi.bagian) : null,
    jam: Lari.jamBaru(),
    rekam: Lari.rekamBaru(),
    rute: [],                        // titik untuk peta: daftar potongan [[lat, lon], ...]
    posisi: null,                    // titik GPS terakhir [lat, lon]
    pakaiGps: false,                 // true kalau GPS sudah dapat titik saat latihan
    kmDiucap: 0,
    setengahDiucap: false,
    indeksTerakhir: -1,              // bagian terakhir yang sudah diberi aba-aba
    bipTerakhir: null,
    mulaiTanggal: null,
    gps: { status: 'mati', meleset: null, terakhir: 0 },
    idPantau: null,
    detak: null,
    cuplikTerakhir: 0,
    hasil: null
  };
  if (pulihan) {
    latihan.jam = Lari.jamPulihkan(pulihan.jam, pulihan.disimpanPada);
    latihan.rekam.jarak = Lari.angka(pulihan.meter);
    latihan.rute = Lari.rapikanRute(pulihan.rute);
    latihan.pakaiGps = !!pulihan.pakaiGps;
    latihan.kmDiucap = Lari.angka(pulihan.kmDiucap);
    latihan.setengahDiucap = !!pulihan.setengahDiucap;
    latihan.indeksTerakhir = typeof pulihan.indeksTerakhir === 'number' ? pulihan.indeksTerakhir : -1;
    latihan.mulaiTanggal = typeof pulihan.mulaiTanggal === 'string' ? pulihan.mulaiTanggal : null;
  }
  document.body.classList.add('sedang-latihan');
  el('layar-latihan').hidden = false;
  el('lt-gps').hidden = false;
  teks('lt-judul', sesi ? sesi.judul : 'Lari Bebas');
  // Tombol kembali di HP tidak langsung menutup latihan
  try { history.pushState({ latihan: true }, ''); } catch (e) { /* tidak apa-apa */ }
  mulaiGps();
  mintaLayarMenyala();
  latihan.detak = setInterval(detak, 250);
  detak();
  el('lt-utama').focus();
}

// Dipanggil 4 kali per detik
function detak() {
  const lt = latihan;
  if (!lt || lt.jam.status === 'selesai') return;
  const kini = Date.now();
  if (lt.jenis === 'program' && lt.jam.status === 'aktif') {
    const p = Lari.posisi(lt.garis, Lari.waktuProgram(lt.jam, kini) / 1000);
    if (p.selesai) { akhiriLatihan(true); return; }
    if (p.indeks !== lt.indeksTerakhir) {
      lt.indeksTerakhir = p.indeks;
      lt.bipTerakhir = null;
      aba(p.indeks);
    } else {
      // Bip hitung mundur 3, 2, 1 sebelum ganti gerakan
      const sisa = Math.ceil(p.sisa);
      if (sisa >= 1 && sisa <= 3 && sisa !== lt.bipTerakhir && p.bagian.detik >= 10) {
        lt.bipTerakhir = sisa;
        bip(660, 0.12);
      }
    }
    if (!lt.setengahDiucap && p.kemajuan >= 0.5) {
      lt.setengahDiucap = true;
      ucap('Sudah setengah latihan. Terus!');
    }
  }
  if (lt.jam.status === 'aktif' && lt.pakaiGps) {
    const nomorKm = Math.floor(lt.rekam.jarak / 1000);
    if (nomorKm > lt.kmDiucap) {
      lt.kmDiucap = nomorKm;
      umumkanKm(nomorKm, kini);
    }
  }
  gambarLatihan(kini);
  if (lt.jam.status === 'aktif') simpanCuplikan(false);
}

// Aba-aba saat masuk bagian baru
function aba(indeks) {
  const b = latihan.garis[indeks];
  bip(988, 0.35);
  getar(b.jenis === 'lari' ? [300, 120, 300] : [500]);
  ucap(Lari.ucapanBagian(latihan.garis, indeks));
}

function umumkanKm(nomorKm, kini) {
  const detikPerKm = Lari.pace(Lari.waktuAktif(latihan.jam, kini) / 1000, latihan.rekam.jarak);
  bip(880, 0.2);
  getar([150, 80, 150]);
  ucap(Lari.ucapanKm(nomorKm, detikPerKm));
}

function gambarLatihan(kini) {
  const lt = latihan;
  const st = lt.jam.status;
  const detikAktif = Lari.waktuAktif(lt.jam, kini) / 1000;
  let fase, label, besar, bawah;
  if (lt.jenis === 'program') {
    const p = Lari.posisi(lt.garis, Lari.waktuProgram(lt.jam, kini) / 1000);
    const b = p.bagian || lt.garis[lt.garis.length - 1];
    fase = b.jenis;
    label = Lari.NAMA[b.jenis];
    besar = Lari.jamDigital(Math.ceil(p.sisa));
    bawah = st === 'siap' ? lt.sesi.ringkas : Lari.infoBerikut(lt.garis, p.selesai ? lt.garis.length - 1 : p.indeks);
    el('lt-isi').style.width = (p.kemajuan * 100).toFixed(1) + '%';
    teks('lt-sisa', 'Sisa ' + Lari.jamDigital(Math.ceil(p.sisaTotal)));
  } else {
    fase = 'bebas';
    label = 'Lari bebas';
    besar = Lari.jamDigital(detikAktif);
    bawah = lt.gps.status === 'mati' ? 'GPS mati, hanya waktu yang dicatat' : 'Info suara tiap 1 km';
  }
  if (st === 'siap') { fase = 'siap'; label = 'Siap?'; }
  if (st === 'jeda') { fase = 'jeda'; label += ' · jeda'; }

  const layar = el('layar-latihan');
  if (layar.dataset.fase !== fase) layar.dataset.fase = fase;
  teks('lt-fase', label);
  teks('lt-besar', besar);
  el('lt-besar').classList.toggle('panjang', besar.length > 5);
  teks('lt-bawah', bawah);
  el('lt-kemajuan').hidden = lt.jenis !== 'program';
  el('lt-stat-waktu').hidden = lt.jenis !== 'program';
  teks('lt-waktu', Lari.jamDigital(detikAktif));
  teks('lt-jarak', lt.pakaiGps ? Lari.km(lt.rekam.jarak) : '–');
  teks('lt-pace', lt.pakaiGps ? Lari.paceTeks(Lari.pace(detikAktif, lt.rekam.jarak)) : '–');
  const g = Lari.infoGps(lt.gps, kini);
  teks('lt-gps', g.teks);
  el('lt-gps').dataset.warna = g.warna;
  teks('lt-utama', st === 'siap' ? 'Mulai' : st === 'aktif' ? 'Jeda' : 'Lanjut');
  el('lt-lewati').hidden = lt.jenis !== 'program' || st === 'siap';
  el('lt-peta').hidden = lt.gps.status === 'mati' || lt.gps.status === 'tidak-ada' || lt.gps.status === 'ditolak';
  teks('lt-selesai', st === 'siap' ? 'Batal' : 'Selesai');
}

// Layar sesudah latihan berakhir (di belakang jendela hasil)
function gambarTuntas() {
  const h = latihan.hasil;
  const lama = Lari.jamDigital(h.detik);
  el('layar-latihan').dataset.fase = 'tuntas';
  teks('lt-fase', h.tuntas ? 'Selesai' : 'Diakhiri');
  teks('lt-besar', lama);
  el('lt-besar').classList.toggle('panjang', lama.length > 5);
  teks('lt-bawah', 'Simpan hasilnya supaya masuk riwayat');
  el('lt-kemajuan').hidden = true;
  el('lt-gps').hidden = true;
  teks('lt-waktu', lama);
  teks('lt-jarak', h.meter != null ? Lari.km(h.meter) : '–');
  teks('lt-pace', h.meter != null ? Lari.paceTeks(Lari.pace(h.detik, h.meter)) : '–');
  teks('lt-utama', 'Simpan hasil');
  el('lt-lewati').hidden = true;
  el('lt-peta').hidden = true;
  teks('lt-selesai', 'Buang');
}

// Tombol besar: Mulai / Jeda / Lanjut
function tombolUtama() {
  const lt = latihan;
  if (!lt) return;
  if (lt.hasil) { bukaJendela(el('dlg-hasil')); if (petaHasil) petaHasil.peta.invalidateSize(); return; }
  const kini = Date.now();
  siapkanSuara(); // suara harus "dinyalakan" saat jari menekan tombol (aturan browser HP)
  const st = lt.jam.status;
  if (st === 'siap' || st === 'jeda') {
    if (st === 'siap') {
      lt.mulaiTanggal = new Date(kini).toISOString();
      if (lt.jenis === 'bebas') { bip(988, 0.35); getar([300]); ucap('Mulai. Selamat lari!'); }
    } else {
      ucap('Lanjut.');
    }
    lt.rekam.terakhir = null; // titik GPS berikutnya jadi patokan baru
    Lari.jamMulai(lt.jam, kini);
    mintaLayarMenyala();
  } else if (st === 'aktif') {
    Lari.jamJeda(lt.jam, kini);
    lt.rekam.terakhir = null; // jarak selama jeda tidak dihitung
    ucap('Jeda.');
  }
  simpanCuplikan(true);
  detak();
}

function tombolLewati() {
  const lt = latihan;
  if (!lt || lt.hasil || lt.jenis !== 'program' || lt.jam.status === 'siap') return;
  const kini = Date.now();
  const p = Lari.posisi(lt.garis, Lari.waktuProgram(lt.jam, kini) / 1000);
  if (p.selesai) return;
  siapkanSuara();
  Lari.jamLompatKe(lt.jam, kini, p.bagian.akhir * 1000);
  simpanCuplikan(true);
  detak();
  if (lt.jam.status === 'jeda') gambarLatihan(Date.now());
}

function tombolSelesai() {
  const lt = latihan;
  if (!lt) return;
  if (lt.hasil) { buangHasil(); return; }
  if (lt.jam.status === 'siap') { tutupLatihan(); return; }
  if (!confirm('Akhiri latihan sekarang?')) return;
  akhiriLatihan(false);
}

function akhiriLatihan(tuntas) {
  const lt = latihan;
  if (!lt || lt.jam.status === 'selesai') return;
  const kini = Date.now();
  Lari.jamSelesai(lt.jam, kini);
  clearInterval(lt.detak);
  lt.detak = null;
  hentikanGps();
  lepasLayar();
  tutupPeta();
  // Simpanan latihan berjalan baru dihapus setelah hasil disimpan / dibuang
  if (tuntas) {
    bip(1320, 0.6);
    getar([400, 150, 400, 150, 600]);
    ucap('Latihan selesai. Kerja bagus!');
  }
  const detik = Math.round(Lari.waktuAktif(lt.jam, kini) / 1000);
  lt.hasil = {
    id: 'l' + kini.toString(36) + Math.random().toString(36).slice(2, 6),
    tanggal: lt.mulaiTanggal || new Date(kini).toISOString(),
    jenis: lt.jenis,
    sesi: lt.sesi ? lt.sesi.id : null,
    judul: lt.sesi ? lt.sesi.judul : 'Lari Bebas',
    detik: detik,
    meter: lt.pakaiGps ? Math.round(lt.rekam.jarak) : null,
    tuntas: tuntas,
    rasa: null,
    catatan: '',
    rute: Lari.ringkasRute(lt.rute) // titik yang hampir segaris dibuang supaya hemat memori
  };
  gambarTuntas();
  bukaHasil();
}

function tutupLatihan() {
  const lt = latihan;
  if (!lt) return;
  if (lt.detak) clearInterval(lt.detak);
  hentikanGps();
  lepasLayar();
  hapusCuplikan();
  tutupPeta();
  hapusPetaHasil();
  latihan = null;
  el('layar-latihan').hidden = true;
  document.body.classList.remove('sedang-latihan');
  try { if (history.state && history.state.latihan) history.back(); } catch (e) { /* tidak apa-apa */ }
  tampilLatihan();
}

/* ---------- Jendela hasil ---------- */
function bukaHasil() {
  const h = latihan.hasil;
  teks('hasil-judul', h.tuntas ? 'Latihan selesai!' : 'Latihan diakhiri');
  teks('hasil-sub', h.judul);
  teks('hasil-waktu', Lari.jamDigital(h.detik));
  teks('hasil-jarak', h.meter != null ? Lari.km(h.meter) + ' km' : '–');
  teks('hasil-pace', h.meter != null ? Lari.paceTeks(Lari.pace(h.detik, h.meter)) : '–');
  el('baris-tandai').hidden = h.jenis !== 'program';
  el('hasil-tandai').checked = h.tuntas;
  document.querySelectorAll('input[name="rasa"]').forEach(r => { r.checked = false; });
  el('hasil-catatan').value = '';
  bukaJendela(el('dlg-hasil'));
  gambarPetaHasil(h.rute); // sesudah jendela terbuka, supaya ukuran peta terbaca
}

function simpanHasil() {
  const lt = latihan;
  if (!lt || !lt.hasil) return;
  const h = lt.hasil;
  const rasa = document.querySelector('input[name="rasa"]:checked');
  h.rasa = rasa && RASA[rasa.value] ? rasa.value : null;
  h.catatan = el('hasil-catatan').value.trim().slice(0, 500);
  const tandai = h.jenis === 'program' && el('hasil-tandai').checked && !data.selesai[h.sesi];
  data.riwayat.push(h);
  if (tandai) data.selesai[h.sesi] = h.tanggal;
  if (!simpan()) {
    // Gagal tersimpan: kembalikan seperti semula, jendela tetap terbuka
    data.riwayat.pop();
    if (tandai) delete data.selesai[h.sesi];
    return;
  }
  lt.hasil = null;
  tutupJendela(el('dlg-hasil'));
  tutupLatihan();
  bukaTab('latihan');
  kabar('Latihan tersimpan');
}

function buangHasil() {
  if (!confirm('Buang latihan ini? Hasilnya tidak disimpan.')) return;
  if (latihan) latihan.hasil = null;
  tutupJendela(el('dlg-hasil'));
  tutupLatihan();
}

/* ================================================================
   GPS
   ================================================================ */
function mulaiGps() {
  const lt = latihan;
  if (!data.pengaturan.gps) { lt.gps.status = 'mati'; return; }
  if (!('geolocation' in navigator)) { lt.gps.status = 'tidak-ada'; return; }
  lt.gps.status = 'mencari';
  try {
    lt.idPantau = navigator.geolocation.watchPosition(terimaLokasi, gagalLokasi,
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  } catch (e) {
    lt.gps.status = 'tidak-ada';
  }
}

function hentikanGps() {
  const lt = latihan;
  if (lt && lt.idPantau != null) {
    try { navigator.geolocation.clearWatch(lt.idPantau); } catch (e) { /* tidak apa-apa */ }
    lt.idPantau = null;
  }
}

function terimaLokasi(pos) {
  const lt = latihan;
  if (!lt || lt.jam.status === 'selesai') return;
  const c = pos.coords;
  const kini = Date.now();
  lt.gps.meleset = c.accuracy;
  lt.gps.terakhir = kini;
  lt.gps.status = c.accuracy <= Lari.GPS_MAKS_MELESET ? 'bagus' : 'lemah';
  lt.posisi = [c.latitude, c.longitude];
  if (lt.jam.status === 'aktif') {
    const t = { lat: c.latitude, lon: c.longitude, meleset: c.accuracy, waktu: kini };
    const hasil = Lari.rekamTitik(lt.rekam, t);
    if (hasil === 'patokan' || hasil === 'tambah' || hasil === 'patokan-baru') lt.pakaiGps = true;
    Lari.catatRute(lt.rute, hasil, t); // titik yang dihitung jaraknya juga digambar di peta
  }
  perbaruiPetaLangsung();
}

function gagalLokasi(err) {
  const lt = latihan;
  if (!lt) return;
  if (err && err.code === 1) {          // izin lokasi ditolak
    lt.gps.status = 'ditolak';
    hentikanGps();
  } else if (lt.gps.status !== 'bagus' && lt.gps.status !== 'lemah') {
    lt.gps.status = 'mencari';
  }
}

/* ================================================================
   PETA RUTE (Leaflet + gambar peta OpenStreetMap)
   Garis rute tersimpan di HP, jadi tetap ada tanpa internet.
   Gambar petanya (jalan, bangunan) diambil dari internet.
   ================================================================ */
const WARNA_PETA = { rute: '#c2410c', mulai: '#15803d', selesai: '#1c1917', posisi: '#1d4ed8' };

function adaRute(rute) { return Lari.jumlahTitik(rute) >= 2; }

// Siapkan peta kosong di wadah. diam = peta kecil yang tidak bisa digeser.
function buatPeta(wadah, diam, pesan) {
  if (typeof L === 'undefined') {
    wadah.innerHTML = '<p class="peta-gagal">Peta tidak bisa dimuat. Tutup lalu buka lagi aplikasinya.</p>';
    return null;
  }
  const peta = L.map(wadah, {
    zoomControl: !diam, dragging: !diam, touchZoom: !diam, doubleClickZoom: !diam,
    scrollWheelZoom: !diam, boxZoom: !diam, keyboard: !diam, attributionControl: false
  });
  // Link dibuka di tab baru supaya aplikasi (dan latihan) tidak tertutup
  L.control.attribution({ prefix: '<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>' }).addTo(peta);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
  }).on('tileerror', () => {
    if (pesan && pesan.hidden) {
      pesan.textContent = 'Gambar peta butuh internet. Garis rute tetap tersimpan.';
      pesan.hidden = false;
    }
  }).addTo(peta);
  const m = { peta: peta, awal: null, akhir: null, posisi: null, ikut: true };
  // Garis putih di bawah garis oranye supaya rute jelas di atas jalan
  m.alas = L.polyline([], { color: '#fff', weight: 9, opacity: 0.85, interactive: false }).addTo(peta);
  m.garis = L.polyline([], { color: WARNA_PETA.rute, weight: 5, opacity: 0.95, interactive: false }).addTo(peta);
  peta.on('dragstart', () => { m.ikut = false; }); // peta digeser sendiri: berhenti mengikuti posisi
  return m;
}

// Pasang atau pindahkan satu titik bulat
function taruhTitik(m, tanda, p, warna) {
  if (!p) return tanda;
  if (tanda) return tanda.setLatLng(p);
  return L.circleMarker(p, { radius: 7, color: '#fff', weight: 3, fillColor: warna, fillOpacity: 1, interactive: false }).addTo(m.peta);
}

// Gambar rute, titik mulai, titik selesai, dan posisi sekarang
function isiPeta(m, rute, posisi, tandaSelesai) {
  const semua = rute.flat();
  m.alas.setLatLngs(rute);
  m.garis.setLatLngs(rute);
  m.awal = taruhTitik(m, m.awal, semua[0], WARNA_PETA.mulai);
  if (tandaSelesai && semua.length > 1) m.akhir = taruhTitik(m, m.akhir, semua[semua.length - 1], WARNA_PETA.selesai);
  m.posisi = taruhTitik(m, m.posisi, posisi, WARNA_PETA.posisi);
}

// Atur besar peta supaya seluruh rute terlihat
function pasPandang(m, rute, posisi) {
  const semua = rute.flat();
  if (posisi) semua.push(posisi);
  if (semua.length) m.peta.fitBounds(L.latLngBounds(semua), { padding: [24, 24], maxZoom: 17, animate: false });
}

// Peta kecil di jendela hasil
function gambarPetaHasil(rute) {
  hapusPetaHasil();
  const wadah = el('hasil-peta');
  wadah.hidden = !adaRute(rute);
  if (wadah.hidden) return;
  petaHasil = buatPeta(wadah, true, el('hasil-peta-pesan'));
  if (!petaHasil) return;
  isiPeta(petaHasil, rute, null, true);
  pasPandang(petaHasil, rute, null);
}

function hapusPetaHasil() {
  if (petaHasil) { petaHasil.peta.remove(); petaHasil = null; }
  el('hasil-peta').textContent = '';
  el('hasil-peta-pesan').hidden = true;
}

// Jendela Rute: catatan di riwayat (tetap) atau latihan yang sedang berjalan (langsung)
function bukaPeta(judul, sub, rute, langsung) {
  hapusPetaBesar();
  teks('peta-judul', judul);
  teks('peta-sub', sub);
  el('ket-akhir').hidden = langsung;
  el('ket-posisi').hidden = !langsung;
  bukaJendela(el('dlg-peta'));
  petaLangsung = langsung;
  gambarPetaBesar(rute, langsung ? latihan.posisi : null, !langsung);
}

function gambarPetaBesar(rute, posisi, tandaSelesai) {
  const wadah = el('peta-besar'), pesan = el('peta-pesan');
  const ada = Lari.jumlahTitik(rute) > 0 || !!posisi;
  wadah.hidden = !ada;
  pesan.textContent = ada ? '' : 'Menunggu sinyal GPS. Peta muncul sendiri setelah sinyal didapat.';
  pesan.hidden = ada;
  if (!ada) return;
  petaBesar = buatPeta(wadah, false, pesan);
  if (!petaBesar) return;
  isiPeta(petaBesar, rute, posisi, tandaSelesai);
  pasPandang(petaBesar, rute, posisi);
}

function bukaPetaRiwayat(id) {
  const c = data.riwayat.find(x => x.id === id);
  if (!c || !adaRute(c.rute)) return;
  const sub = [Lari.tanggalTeks(new Date(c.tanggal), new Date())];
  if (c.meter != null) sub.push(Lari.km(c.meter) + ' km');
  sub.push(Lari.jamDigital(c.detik));
  bukaPeta(c.judul, sub.join(' · '), c.rute, false);
}

function bukaPetaLangsung() {
  const lt = latihan;
  if (!lt || lt.hasil) return;
  bukaPeta('Rute sekarang', lt.sesi ? lt.sesi.judul : 'Lari Bebas', lt.rute, true);
}

// Dipanggil setiap ada titik GPS baru
function perbaruiPetaLangsung() {
  const lt = latihan;
  if (!petaLangsung || !lt) return;
  if (!petaBesar) {
    if (el('peta-besar').hidden) gambarPetaBesar(lt.rute, lt.posisi, false); // sinyal pertama: buat peta
    return;
  }
  isiPeta(petaBesar, lt.rute, lt.posisi, false);
  // Ikuti posisi kalau keluar dari layar (kecuali peta sedang digeser sendiri)
  if (petaBesar.ikut && lt.posisi && !petaBesar.peta.getBounds().contains(lt.posisi)) petaBesar.peta.panTo(lt.posisi);
}

function hapusPetaBesar() {
  if (petaBesar) { petaBesar.peta.remove(); petaBesar = null; }
  petaLangsung = false;
  el('peta-besar').textContent = '';
}

function tutupPeta() {
  tutupJendela(el('dlg-peta'));
  hapusPetaBesar();
}

/* ================================================================
   SUARA, BIP, GETAR, LAYAR MENYALA
   ================================================================ */
function siapkanSuara() {
  try {
    if (!suara) {
      const KelasSuara = window.AudioContext || window.webkitAudioContext;
      if (KelasSuara) suara = new KelasSuara();
    }
    if (suara && suara.state === 'suspended') suara.resume();
  } catch (e) {
    suara = null;
  }
}

function bip(frekuensi, lama) {
  if (!data.pengaturan.bip || !suara) return;
  try {
    const t = suara.currentTime;
    const osc = suara.createOscillator();
    const vol = suara.createGain();
    osc.frequency.value = frekuensi;
    vol.gain.setValueAtTime(0.0001, t);
    vol.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
    vol.gain.exponentialRampToValueAtTime(0.0001, t + lama);
    osc.connect(vol);
    vol.connect(suara.destination);
    osc.start(t);
    osc.stop(t + lama + 0.05);
  } catch (e) { /* HP tanpa suara: tidak apa-apa */ }
}

function getar(pola) {
  if (!data.pengaturan.getar || !navigator.vibrate) return;
  try { navigator.vibrate(pola); } catch (e) { /* tidak apa-apa */ }
}

// Pilih suara bahasa Indonesia kalau ada di HP
function suaraIndonesia() {
  try {
    return window.speechSynthesis.getVoices().find(v => /^(id|in)([-_]|$)/i.test(v.lang)) || null;
  } catch (e) {
    return null;
  }
}

function ucap(kalimat) {
  if (!data.pengaturan.suara || !kalimat || !('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(kalimat);
    u.lang = 'id-ID';
    const v = suaraIndonesia();
    if (v) u.voice = v;
    window.speechSynthesis.resume(); // Chrome kadang "macet" dalam keadaan pause
    window.speechSynthesis.speak(u);
  } catch (e) { /* tidak apa-apa */ }
}

function mintaLayarMenyala() {
  if (!('wakeLock' in navigator) || kunciLayar || sedangMintaKunci || document.visibilityState !== 'visible') return;
  sedangMintaKunci = true;
  navigator.wakeLock.request('screen').then(k => {
    sedangMintaKunci = false;
    if (!latihan || latihan.jam.status === 'selesai') { k.release().catch(() => {}); return; }
    kunciLayar = k;
    k.addEventListener('release', () => { if (kunciLayar === k) kunciLayar = null; });
  }).catch(() => { sedangMintaKunci = false; });
}

function lepasLayar() {
  const k = kunciLayar;
  kunciLayar = null;
  if (k) k.release().catch(() => {});
}

/* ================================================================
   LATIHAN YANG TERTUTUP TIBA-TIBA
   ================================================================ */
function simpanCuplikan(paksa) {
  const lt = latihan;
  if (!lt || lt.hasil || lt.jam.status === 'siap' || lt.jam.status === 'selesai') return;
  const kini = Date.now();
  if (!paksa && kini - lt.cuplikTerakhir < 5000) return;
  lt.cuplikTerakhir = kini;
  const isi = {
    versi: 1,
    jenis: lt.jenis,
    sesi: lt.sesi ? lt.sesi.id : null,
    jam: lt.jam,
    meter: lt.rekam.jarak,
    rute: lt.rute,
    pakaiGps: lt.pakaiGps,
    kmDiucap: lt.kmDiucap,
    setengahDiucap: lt.setengahDiucap,
    indeksTerakhir: lt.indeksTerakhir,
    mulaiTanggal: lt.mulaiTanggal,
    disimpanPada: kini
  };
  try { localStorage.setItem(KUNCI_BERJALAN, JSON.stringify(isi)); } catch (e) { /* tidak apa-apa */ }
}

function bacaCuplikan() {
  let c = null;
  try { c = JSON.parse(localStorage.getItem(KUNCI_BERJALAN)); } catch (e) { c = null; }
  return Lari.cuplikanSah(c, Date.now()) ? c : null;
}

function hapusCuplikan() {
  try { localStorage.removeItem(KUNCI_BERJALAN); } catch (e) { /* tidak apa-apa */ }
}

function tampilLanjutan() {
  const c = latihan ? null : bacaCuplikan();
  el('kotak-lanjut').hidden = !c;
  if (!c) return;
  const sesi = c.sesi ? Lari.cariSesi(c.sesi) : null;
  const jam = Lari.jamPulihkan(c.jam, c.disimpanPada);
  teks('teks-lanjut', (sesi ? sesi.judul : 'Lari Bebas') + ' · sudah ' + Lari.jamDigital(jam.simpanan / 1000));
}

function lanjutkanCuplikan() {
  const c = bacaCuplikan();
  if (!c) { tampilLatihan(); return; }
  bukaLatihan(c.jenis, c.sesi ? Lari.cariSesi(c.sesi) : null, c);
}

function buangCuplikan() {
  if (!confirm('Buang latihan yang belum selesai ini?')) return;
  hapusCuplikan();
  tampilLatihan();
}

/* ================================================================
   HALAMAN RIWAYAT
   ================================================================ */
function tampilRiwayat() {
  const daftar = data.riwayat.slice().sort((a, b) => Date.parse(b.tanggal) - Date.parse(a.tanggal));
  const total = Lari.jumlahkan(daftar);
  const kini = new Date();
  teks('angka-kali', String(total.kali));
  teks('angka-jarak', Lari.km(total.meter));
  teks('angka-lama', Lari.lamaTotal(total.detik));
  el('isi-grafik').innerHTML = Lari.grafikMinggu(Lari.perMinggu(daftar, kini, 8));

  if (!daftar.length) {
    el('daftar-riwayat').innerHTML = '<div class="kotak kosong"><p>Belum ada catatan. Selesaikan latihan pertamamu, nanti muncul di sini.</p></div>';
    return;
  }
  el('daftar-riwayat').innerHTML = daftar.map(c => {
    const angka = [Lari.jamDigital(c.detik)];
    if (c.meter != null) {
      angka.push(Lari.km(c.meter) + ' km');
      const p = Lari.pace(c.detik, c.meter);
      if (p) angka.push(Lari.paceTeks(p) + ' /km');
    }
    const tanggal = Lari.tanggalTeks(new Date(c.tanggal), kini);
    return '<article class="kotak catatan">' +
      '<div class="kepala-catatan"><div><small>' + esc(tanggal) + '</small>' +
      '<b>' + esc(c.judul) + (c.jenis === 'program' && !c.tuntas ? ' <span class="lencana kuning">belum tuntas</span>' : '') + '</b></div>' +
      '<button type="button" class="btn kecil bahaya" data-hapus="' + esc(c.id) + '" aria-label="Hapus catatan ' + esc(c.judul + ', ' + tanggal) + '">Hapus</button></div>' +
      '<p class="angka-catatan">' + angka.map(esc).join(' · ') + '</p>' +
      (c.rasa && RASA[c.rasa] ? '<p class="info-kecil">Rasanya: ' + RASA[c.rasa] + '</p>' : '') +
      (c.catatan ? '<p class="isi-catatan">' + esc(c.catatan) + '</p>' : '') +
      (adaRute(c.rute) ? '<button type="button" class="btn kecil btn-rute" data-rute="' + esc(c.id) + '">Lihat rute</button>' : '') +
      '</article>';
  }).join('');
}

function hapusCatatan(id) {
  const i = data.riwayat.findIndex(c => c.id === id);
  if (i < 0) return;
  if (!confirm('Hapus catatan latihan ini?')) return;
  data.riwayat.splice(i, 1);
  simpan();
  tampilRiwayat();
}

/* ================================================================
   HALAMAN PENGATURAN
   ================================================================ */
function tampilPengaturan() {
  document.querySelectorAll('[data-atur]').forEach(k => { k.checked = !!data.pengaturan[k.dataset.atur]; });
}

function tesSuara() {
  siapkanSuara();
  bip(988, 0.3);
  getar([200]);
  if (!('speechSynthesis' in window)) { kabar('HP ini tidak punya suara pemandu'); return; }
  if (!data.pengaturan.suara) { kabar('Nyalakan dulu Suara pemandu'); return; }
  ucap('Suara pemandu aktif. Ayo lari!');
}

function hapusSemua() {
  if (!confirm('Hapus semua catatan dan progres program di HP ini? Ini tidak bisa dibatalkan. Simpan cadangan dulu kalau masih perlu.')) return;
  const pengaturan = data.pengaturan;
  data = Lari.dataBaru();
  data.pengaturan = pengaturan;
  simpan();
  kabar('Semua data sudah dihapus');
  bukaTab('latihan');
}

/* ---------- Cadangan data: simpan ke file dan pulihkan dari file ---------- */
function pesanCadangan(isi) {
  const p = el('pesan-cadangan');
  p.textContent = isi;
  p.hidden = !isi;
}

function isiFileCadangan() {
  return JSON.stringify({ aplikasi: 'Latihan Lari', versi: 1, dibuat: new Date().toISOString(), data: data }, null, 2);
}

async function simpanCadangan() {
  const isi = isiFileCadangan();
  const nama = 'latihan-lari-cadangan-' + hariIni() + '.json';
  // HP: pakai menu Bagikan (bisa Simpan ke File, Google Drive, atau WhatsApp)
  try {
    const file = new File([isi], nama, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Cadangan Latihan Lari' });
      pesanCadangan('Cadangan sudah dibagikan. Simpan file ' + nama + ' di tempat aman.');
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return; // dibatalkan
  }
  // Laptop / browser lain: unduh file
  const url = URL.createObjectURL(new Blob([isi], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nama;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  pesanCadangan('File ' + nama + ' sudah diunduh. Simpan di tempat aman.');
}

async function pulihkanDari(file) {
  let isi = null;
  try { isi = await file.text(); } catch (e) { isi = null; }
  const baru = isi == null ? null : Lari.bacaCadangan(isi);
  if (!baru) { pesanCadangan('File ini bukan cadangan Latihan Lari.'); return; }
  if (!confirm('Ganti semua data di HP ini dengan isi file cadangan (' + baru.riwayat.length + ' catatan latihan)?')) return;
  data = baru;
  simpan();
  tampilPengaturan();
  pesanCadangan('Data sudah dipulihkan: ' + data.riwayat.length + ' catatan latihan.');
}

/* ---------- Pasang di layar HP ---------- */
function pasangAplikasi() {
  const acara = acaraPasang;
  if (!acara) return;
  acaraPasang = null;
  el('kotak-pasang').hidden = true;
  acara.prompt();
}

/* ================================================================
   TOMBOL-TOMBOL
   ================================================================ */
function pasangPendengar() {
  // Tombol yang dibuat ulang (daftar sesi, menu, hapus catatan)
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-tab], [data-mulai], [data-detail], [data-hapus], [data-rute]');
    if (!t) return;
    if (t.dataset.tab) bukaTab(t.dataset.tab);
    else if (t.dataset.mulai) mulaiSesi(t.dataset.mulai);
    else if (t.dataset.detail) bukaDetail(t.dataset.detail);
    else if (t.dataset.hapus) hapusCatatan(t.dataset.hapus);
    else if (t.dataset.rute) bukaPetaRiwayat(t.dataset.rute);
  });

  // Halaman Latihan
  el('btn-bebas').addEventListener('click', () => bukaLatihan('bebas', null, null));
  el('btn-lanjut').addEventListener('click', lanjutkanCuplikan);
  el('btn-buang-lanjut').addEventListener('click', buangCuplikan);
  el('btn-pasang').addEventListener('click', pasangAplikasi);

  // Jendela sesi
  const dlgSesi = el('dlg-sesi');
  el('sesi-mulai').addEventListener('click', () => { tutupJendela(dlgSesi); mulaiSesi(dlgSesi.dataset.id); });
  el('sesi-tandai').addEventListener('click', () => { tutupJendela(dlgSesi); tandaiSesi(dlgSesi.dataset.id); });
  el('sesi-tutup').addEventListener('click', () => tutupJendela(dlgSesi));
  dlgSesi.addEventListener('click', e => { if (e.target === dlgSesi) tutupJendela(dlgSesi); });

  // Layar latihan
  el('lt-utama').addEventListener('click', tombolUtama);
  el('lt-lewati').addEventListener('click', tombolLewati);
  el('lt-selesai').addEventListener('click', tombolSelesai);
  el('lt-peta').addEventListener('click', bukaPetaLangsung);

  // Jendela peta rute
  const dlgPeta = el('dlg-peta');
  el('peta-tutup').addEventListener('click', tutupPeta);
  dlgPeta.addEventListener('click', e => { if (e.target === dlgPeta) tutupPeta(); });
  dlgPeta.addEventListener('close', () => { if (!dlgPeta.open) hapusPetaBesar(); });

  // Jendela hasil: tidak boleh tertutup tanpa Simpan / Buang
  const dlgHasil = el('dlg-hasil');
  el('hasil-simpan').addEventListener('click', simpanHasil);
  el('hasil-buang').addEventListener('click', buangHasil);
  dlgHasil.addEventListener('cancel', e => e.preventDefault());
  // Kalau tetap tertutup (misalnya tombol kembali ditekan 2 kali), tombol di layar latihan bisa membukanya lagi
  dlgHasil.addEventListener('close', () => { if (latihan && latihan.hasil) gambarTuntas(); });

  // Pengaturan
  document.querySelectorAll('[data-atur]').forEach(k => {
    k.addEventListener('change', () => { data.pengaturan[k.dataset.atur] = k.checked; simpan(); });
  });
  el('btn-tes-suara').addEventListener('click', tesSuara);
  el('btn-simpan-cadangan').addEventListener('click', simpanCadangan);
  const fileEl = el('file-cadangan');
  el('btn-pulihkan').addEventListener('click', () => fileEl.click());
  fileEl.addEventListener('change', () => {
    const f = fileEl.files && fileEl.files[0];
    if (f) pulihkanDari(f).finally(() => { fileEl.value = ''; });
  });
  el('btn-hapus-semua').addEventListener('click', hapusSemua);

  // Tombol kembali di HP saat latihan: jangan keluar dari aplikasi
  window.addEventListener('popstate', () => {
    if (!latihan) return;
    try { history.pushState({ latihan: true }, ''); } catch (e) { /* tidak apa-apa */ }
    kabar(latihan.hasil ? 'Pilih Simpan hasil atau Buang' : 'Tekan Selesai untuk mengakhiri latihan');
  });

  // Pindah aplikasi / layar mati: simpan dulu. Kembali: nyalakan layar lagi.
  document.addEventListener('visibilitychange', () => {
    if (!latihan) return;
    if (document.visibilityState === 'hidden') simpanCuplikan(true);
    else if (latihan.jam.status !== 'selesai') { mintaLayarMenyala(); detak(); }
  });
  window.addEventListener('pagehide', () => simpanCuplikan(true));
  window.addEventListener('beforeunload', e => {
    if (latihan && latihan.jam.status === 'aktif') { e.preventDefault(); e.returnValue = ''; }
  });

  // Tombol "Pasang" muncul kalau browser mengizinkan
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    acaraPasang = e;
    el('kotak-pasang').hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    acaraPasang = null;
    el('kotak-pasang').hidden = true;
    kabar('Aplikasi sudah terpasang');
  });

  // Daftar suara HP kadang baru siap belakangan
  if ('speechSynthesis' in window) {
    try { window.speechSynthesis.getVoices(); } catch (e) { /* tidak apa-apa */ }
  }
}

/* ================================================================
   MULAI
   ================================================================ */
pasangPendengar();
bukaTab('latihan');

// Simpan file aplikasi di HP supaya tetap bisa dibuka tanpa internet (lihat sw.js)
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* tanpa mode offline: tidak apa-apa */ });
}
