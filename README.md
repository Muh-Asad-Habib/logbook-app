# 📒 Logbook Kegiatan & Keuangan

Aplikasi web untuk **mencatat, memantau, dan melaporkan** perjalanan sebuah tim
proyek — mulai dari kegiatan harian, pengeluaran dana, laporan kemajuan, sampai
materi presentasi — dalam satu tempat yang rapi dan dapat diakses bersama
pembimbing.

Dibuat untuk kebutuhan nyata tim program kemahasiswaan (PKM, proyek penelitian,
tugas besar, program pendampingan): setiap catatan harus lengkap dengan **foto
bukti**, **rekap dana**, dan **pengesahan dosen** — lalu pada akhirnya harus
bisa dicetak menjadi dokumen laporan.

---

## 📌 Daftar isi

- [Apa yang bisa dilakukan aplikasi ini](#-apa-yang-bisa-dilakukan-aplikasi-ini)
- [Siapa saja penggunanya](#-siapa-saja-penggunanya)
- [Cara memakai — panduan pengguna](#-cara-memakai--panduan-pengguna)
- [Panduan untuk pembimbing](#-panduan-untuk-pembimbing-fasilitator--dosen)
- [Panduan untuk admin](#-panduan-untuk-admin)
- [Menjalankan aplikasi](#-menjalankan-aplikasi)
- [Konfigurasi (.env)](#-konfigurasi-env)
- [Di mana data disimpan](#-di-mana-data-disimpan)
- [REST API & dokumentasi Swagger](#-rest-api--dokumentasi-swagger)
- [Struktur proyek](#-struktur-proyek)
- [Pengujian otomatis](#-pengujian-otomatis)
- [Keamanan](#-keamanan)
- [Tanya-jawab](#-tanya-jawab)

---

## ✨ Apa yang bisa dilakukan aplikasi ini

| Fitur | Penjelasan |
|---|---|
| 🗓️ **Catatan kegiatan** | Tanggal, uraian kegiatan, durasi, tambahan capaian (%), dan beberapa foto sekaligus. Otomatis dikelompokkan per bulan. |
| 💰 **Catatan keuangan** | Item belanja, harga satuan, jumlah, total otomatis, plus foto nota/bukti. Ada subtotal per bulan. |
| 📊 **Dashboard** | Ringkasan capaian, total waktu, dana terpakai & sisa dana, grafik mini, dan kegiatan terbaru. |
| 📄 **Laporan kemajuan** | Unggah dokumen Word (`.docx`) dan tampilkan langsung di aplikasi seperti dibuka di Word. |
| 📊 **Presentasi** | Unggah PowerPoint (`.pptx`) dan/atau tempel tautan Canva — keduanya boleh dipakai bersamaan. |
| 🖼️ **Galeri** | Semua foto kegiatan dalam satu halaman, bisa dibuka besar (geser kiri/kanan di ponsel). |
| 📤 **Ekspor** | Unduh rekap sebagai **Word**, **PDF**, atau **Excel** — siap dikumpulkan. |
| 📥 **Impor** | Punya logbook lama berbentuk Word? Unggah, isinya (termasuk foto) dipindahkan otomatis. |
| 💬 **Komentar 2 arah** | Pembimbing memberi catatan pada entri tertentu, tim membalas, ada penanda "belum dibaca". |
| ✅ **Pengesahan (ACC)** | Dosen menyetujui atau meminta revisi tiap entri; statusnya terlihat jelas oleh tim. |
| 🌙 **Nyaman dipakai** | Tampilan terang/gelap, responsif di ponsel, dan bisa dipasang sebagai aplikasi (PWA). |

---

## 👥 Siapa saja penggunanya

Aplikasi mengenal empat peran dengan hak akses berbeda:

| Peran | Bisa melihat | Ubah data | Komentar | ACC / minta revisi |
|---|---|:--:|:--:|:--:|
| 👥 **Tim** | logbook miliknya sendiri | ✅ | ✅ (membalas) | — |
| 🎓 **Fasilitator** | logbook tim yang didampingi | — | ✅ | — |
| 👨‍🏫 **Dosen Pendamping** | logbook tim yang didampingi | — | ✅ | ✅ |
| 🛡️ **Admin** | semua akun & data | pengelolaan akun | — | — |

Setiap akun tim memiliki logbook yang **benar-benar terpisah** — kegiatan,
keuangan, dana, galeri, dan dokumennya tidak terlihat oleh tim lain.

Pembatasan hak akses ini dijaga di sisi server, bukan sekadar disembunyikan di
tampilan: permintaan yang tidak berhak selalu ditolak dengan kode **403**.

---

## 📖 Cara memakai — panduan pengguna

### 1. Membuat akun & masuk

1. Buka alamat aplikasi, lalu pilih tab **✨ Daftar**.
2. Pilih peran:
   - **Tim** — dapat langsung mendaftar.
   - **Fasilitator** atau **Dosen Pendamping** — memerlukan **kode pendaftaran**
     dari admin (kode untuk keduanya berbeda).
3. Isi username & password, lalu daftar. Akun baru selalu dimulai dari logbook
   kosong.
4. Untuk kunjungan berikutnya, gunakan tab **Masuk**.

> Username dan password dapat diganti kapan saja melalui nama akun (pojok) →
> **⚙️ Pengaturan akun**. Mengganti password otomatis mengeluarkan sesi di
> perangkat lain.

### 2. Menyiapkan dana awal

Buka **Keuangan** lalu isi **Dana awal** dengan total anggaran tim. Angka ini
dipakai untuk menghitung **sisa dana** di dashboard dan pada semua hasil ekspor.

### 3. Mencatat kegiatan

1. Buka menu **Kegiatan** → tombol **Tambah** (di ponsel: tombol **➕** melayang).
2. Isi bagian berikut:
   - **Tanggal** kegiatan
   - **Uraian kegiatan** — tulis sedetail mungkin (tempat, jam, siapa yang hadir)
   - **Durasi** dalam menit
   - **Tambahan capaian (%)** — kemajuan dari kegiatan ini; aplikasi
     menjumlahkannya menjadi capaian total
   - **Foto** — boleh beberapa sekaligus
3. Simpan. Entri akan muncul dikelompokkan per bulan, dan foto dapat diklik
   untuk diperbesar.

> Foto dikecilkan otomatis di perangkat sebelum dikirim, sehingga unggahan tetap
> cepat meskipun memakai foto ponsel beresolusi tinggi.

### 4. Mencatat pengeluaran

Buka menu **Keuangan** → **Tambah**, lalu isi nama item, harga satuan, jumlah,
dan satuan (misalnya "per bulan"). Total dihitung otomatis, dan foto nota dapat
dilampirkan sebagai bukti.

### 5. Laporan kemajuan & presentasi

| Menu | Isi | Catatan |
|---|---|---|
| **Laporan Kemajuan** | satu berkas `.docx` | Unggahan baru menggantikan berkas lama. Tampil langsung di aplikasi dan bisa diunduh. |
| **Presentasi** | satu berkas `.pptx` **dan/atau** satu tautan Canva | Boleh dipakai bersamaan dan dihapus terpisah. `.pptx` bisa diunduh; Canva hanya pratinjau. |

Untuk Canva, salin tautan dari tombol **Bagikan** dan pastikan setelannya
*"Siapa saja dengan tautan dapat melihat"* agar pratinjaunya dapat dibuka
pembimbing.

### 6. Mengundang pembimbing

1. Buka menu **Profil** → bagian **Kode tim** (contoh: `ABCD-2345`).
2. Kirimkan kode tersebut kepada fasilitator atau dosen.
3. Pembimbing memasukkannya di dashboard mereka melalui **Gabung ke tim dengan
   kode**.

Kode dapat **dicetak ulang** kapan saja (kode lama langsung tidak berlaku), dan
pembimbing dapat **dikeluarkan** dari halaman Profil. Satu tim boleh memiliki
banyak pembimbing, dan satu pembimbing boleh mendampingi banyak tim.

### 7. Komentar & pengesahan (ACC)

Setiap entri kegiatan, entri belanja, laporan, dan presentasi memiliki satu
status:

| Status | Arti |
|---|---|
| ⏳ **Menunggu ACC** | belum ditinjau dosen |
| ✔ **Disetujui** | sudah disahkan dosen pendamping |
| ↺ **Revisi** | dosen meminta perbaikan — selalu disertai catatan |

Bila entri diperbaiki (atau berkas laporan/presentasi diganti), statusnya
otomatis kembali ke **menunggu** supaya pengesahan selalu merujuk versi
terbaru. Jumlah komentar yang belum dibaca tampil sebagai lencana pada menu.

### 8. Mengekspor & mengimpor dokumen

Buka menu **Ekspor**:

| Format | Isi |
|---|---|
| **Word (.docx)** | Dokumen logbook terisi otomatis — entri beserta fotonya tersusun dalam tabel kegiatan & keuangan. |
| **PDF** | Rekap siap cetak: ringkasan dana, seluruh kegiatan berikut foto, tabel keuangan bertotal, dan nomor halaman. |
| **Excel (.xlsx)** | Tiga lembar: Kegiatan, Keuangan, dan Ringkasan. |

Ekspor **tidak pernah mengubah data** — yang diunduh selalu salinan baru dan
aman diulang berkali-kali.

**Impor:** pada halaman yang sama, unggah logbook Word lama lalu klik **Impor
sekarang**. Entri yang belum ada akan ditambahkan lengkap dengan fotonya; entri
yang sudah ada dilewati sehingga aman diklik berulang. Format tanggal seperti
`23-Mei-26`, `06 Juni 2026`, `6/5/2026`, durasi `2 jam` atau `1 j 30 mnt`, serta
harga `Rp 100.000 / bulan` sudah dikenali.

---

## 🎓 Panduan untuk pembimbing (fasilitator & dosen)

1. **Daftar** dengan peran Fasilitator atau Dosen Pendamping memakai kode dari
   admin.
2. **Terhubung ke tim** — masukkan kode tim di dashboard, atau minta admin
   menugaskan secara manual.
3. **Memantau** — menu Kegiatan, Keuangan, Laporan Kemajuan, dan Presentasi
   menampilkan data tim yang didampingi (hanya dapat dibaca).
4. **Berkomentar** — mulai diskusi pada entri mana pun; tim akan membalas.
5. **Memberi ACC** (khusus dosen) — setujui entri atau minta revisi disertai
   catatan perbaikan.

Bila mendampingi lebih dari satu tim, gunakan **pemilih tim** pada bilah atas
untuk berpindah. Pembimbing juga dapat keluar dari sebuah tim kapan saja.

---

## 🛡️ Panduan untuk admin

Panel admin merupakan halaman terpisah dengan login tersendiri. Di dalamnya
tersedia:

- **Ringkasan** jumlah akun, kegiatan, belanja, sesi aktif, entri ter-ACC, dan
  laporan.
- **Daftar akun** bertab **👥 Tim / 🎓 Fasilitator / 👨‍🏫 Dosen Pendamping**
  lengkap dengan pencarian.
- **Detail akun** — kegiatan, keuangan, laporan, dan jejak aktivitas satu akun.
- **Pengelolaan akun** — ganti username, setel ulang password, keluarkan dari
  semua perangkat, hapus akun.
- **Kode pendaftaran** untuk fasilitator dan dosen (dapat diganti kapan saja).
- **Penugasan tim** — hubungkan pembimbing ke tim melalui tombol **🔗 Tim**.
- **Catatan audit** yang diperbarui langsung.

> Alamat panel admin beserta kredensialnya dibuat otomatis saat aplikasi pertama
> kali dijalankan dan ditampilkan **satu kali** pada log server — catat baik-baik.
> Kredensial dapat disetel ulang kapan saja dengan `node tools/superuser.mjs`.
> Karena alamat tersebut tidak pernah ditautkan dari halaman mana pun, simpanlah
> secara pribadi.

---

## 🚀 Menjalankan aplikasi

### Pilihan A — Online 24 jam (disarankan)

Aplikasi dirancang untuk berjalan di layanan gratis:

| Bagian | Layanan |
|---|---|
| Hosting + alamat tetap | **Vercel** |
| Database | **Neon** (PostgreSQL) |
| Penyimpanan gambar & dokumen | **ImageKit** |

Panduan lengkap langkah demi langkah tersedia pada **[DEPLOY.md](DEPLOY.md)**.
Setelah terpasang, aplikasi dapat diakses siapa pun melalui alamat tetap tanpa
memerlukan perangkat yang menyala terus-menerus.

### Pilihan B — Menjalankan sendiri (lokal)

**Prasyarat:** [Node.js LTS](https://nodejs.org) terpasang dan berkas `.env`
sudah diisi (lihat [Konfigurasi](#-konfigurasi-env)).

```powershell
cd logbook-app
.\start.ps1
```

Skrip tersebut memasang dependensi, membangun frontend, menjalankan server pada
`http://localhost:4000`, lalu membuka terowongan Cloudflare gratis sehingga
aplikasi memperoleh alamat publik sementara yang dapat dibagikan.

| Perintah | Fungsi |
|---|---|
| `.\start.ps1` | Jalankan beserta alamat publik sementara |
| `.\start.ps1 -NoTunnel` | Jalankan hanya di jaringan lokal |
| `.\start.ps1 -Rebuild` | Bangun ulang frontend (setelah kode frontend berubah) |
| `.\stop.ps1` | Hentikan seluruh proses terkait |

> Alamat terowongan gratis berubah setiap kali dijalankan ulang, dan aplikasi
> hanya dapat diakses selama server masih berjalan. Untuk pemakaian jangka
> panjang, gunakan Pilihan A.

### Pilihan C — Mode pengembangan

```powershell
cd backend;  npm run dev     # API pada :4000 (muat ulang otomatis)
cd frontend; npm run dev     # Antarmuka pada :3000 (API → localhost:4000)
```

---

## ⚙️ Konfigurasi (.env)

Salin `.env.example` menjadi `.env` di dalam folder `logbook-app`, lalu isi:

| Variabel | Kegunaan |
|---|---|
| `DATABASE_URL` | Alamat koneksi database Neon (PostgreSQL). |
| `IMAGEKIT_PUBLIC_KEY` | Kunci publik ImageKit. |
| `IMAGEKIT_PRIVATE_KEY` | Kunci privat ImageKit — rahasia. |
| `IMAGEKIT_URL_ENDPOINT` | Endpoint URL ImageKit. |
| `IMAGEKIT_FOLDER` | Folder penyimpanan (opsional, bawaan `/logbook`). |

Tabel database dibuat otomatis saat server pertama kali tersambung sehingga
tidak ada langkah migrasi manual. Bila kunci ImageKit dikosongkan, berkas
disimpan ke folder `uploads/` — praktis untuk pengembangan, namun tidak
disarankan untuk pemakaian sungguhan.

---

## 💾 Di mana data disimpan

| Data | Lokasi |
|---|---|
| Akun, peran, kegiatan, keuangan, pengaturan, komentar, status ACC | **Neon** (PostgreSQL) |
| Foto kegiatan & bukti belanja | **ImageKit** (CDN, tautan bertanda tangan) |
| Laporan kemajuan `.docx` | **ImageKit** |
| Presentasi `.pptx` | **ImageKit** (tautan Canva disimpan sebagai teks) |
| Kredensial panel admin | tabel `meta` pada Neon (hash scrypt) |

Berkas gambar dan dokumen sengaja tidak disimpan di dalam database agar kuota
database tetap lega, sekaligus membuat pemuatan foto lebih cepat melalui CDN.

---

## 📚 REST API & dokumentasi Swagger

Dokumentasi interaktif tersedia pada `/docs` (misalnya
`http://localhost:4000/docs`). Seluruh endpoint data memerlukan token login,
melalui header `Authorization: Bearer <token>` atau query `?token=...`.

```bash
# 1) masuk → memperoleh token
curl -X POST https://ALAMAT-APLIKASI/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"USERNAME","password":"PASSWORD"}'

# 2) mengambil daftar kegiatan
curl https://ALAMAT-APLIKASI/api/kegiatan \
  -H "Authorization: Bearer TOKEN"

# 3) menambah kegiatan beserta foto
curl -X POST https://ALAMAT-APLIKASI/api/kegiatan \
  -H "Authorization: Bearer TOKEN" \
  -F "tanggal=2026-07-11" -F "kegiatan=Rapat tim" \
  -F "capaian_delta=5" -F "waktu_menit=60" -F "foto=@foto.jpg"
```

**Akun & data tim**

| Method | Endpoint | Fungsi |
|---|---|---|
| POST | `/api/auth/register` | Daftar akun baru (memperoleh token) |
| POST | `/api/auth/login` | Masuk (memperoleh token) |
| GET | `/api/auth/me` | Profil akun yang sedang masuk |
| PUT | `/api/auth/username` | Ganti username (konfirmasi password) |
| PUT | `/api/auth/password` | Ganti password (sesi lain dikeluarkan) |
| POST | `/api/auth/logout` | Akhiri sesi |
| GET / POST | `/api/kegiatan` | Daftar / tambah kegiatan (+foto) |
| PUT / DELETE | `/api/kegiatan/{id}` | Ubah / hapus kegiatan |
| GET / POST | `/api/keuangan` | Daftar / tambah belanja (+bukti) |
| PUT / DELETE | `/api/keuangan/{id}` | Ubah / hapus belanja |
| GET / PUT | `/api/pengaturan/{kunci}` | Pengaturan (mis. `dana_awal`) |
| GET | `/api/statistik` | Ringkasan dashboard |
| GET | `/api/files/{key}` | Ambil gambar |
| GET | `/api/export/docx` \| `/pdf` \| `/xlsx` | Unduh hasil ekspor |
| POST | `/api/import/docx` | Impor entri + foto dari dokumen Word |
| GET | `/health` | Pemeriksaan status (tanpa login) |

**Laporan kemajuan**

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/laporan/info` | Info berkas laporan (nama, ukuran, waktu unggah) |
| GET | `/api/laporan/file` | Tampilkan / unduh `.docx` |
| POST / DELETE | `/api/laporan` | Unggah / hapus laporan (potongan: `/chunk` + `/selesai`) |
| POST | `/api/laporan/tautan` | Tautan sementara untuk penampil Office |
| GET | `/api/laporan/publik/{kunci}` | Akses berkas melalui tautan sementara |

**Presentasi**

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/presentasi/info` | Info berkas `.pptx` dan tautan Canva |
| GET / DELETE | `/api/presentasi/file` | Unduh / hapus `.pptx` (tautan Canva tetap ada) |
| POST | `/api/presentasi` | Unggah `.pptx` (potongan: `/chunk` + `/selesai`) |
| POST / DELETE | `/api/presentasi/canva` | Simpan / hapus tautan Canva |
| POST | `/api/presentasi/tautan` | Tautan sementara untuk penampil PowerPoint |
| GET | `/api/presentasi/publik/{kunci}` | Akses berkas melalui tautan sementara |

**Pembimbing (hanya baca)**

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/fasilitator/tim` | Daftar tim yang didampingi |
| POST | `/api/fasilitator/gabung` | Bergabung ke tim memakai kode tim |
| DELETE | `/api/fasilitator/tim/{id}` | Keluar dari sebuah tim |
| GET | `/api/fasilitator/tim/{id}/kegiatan` \| `/keuangan` \| `/statistik` \| `/ringkasan` | Data tim tersebut |
| GET | `/api/fasilitator/tim/{id}/laporan-info` \| `/laporan-file` | Laporan kemajuan tim |
| GET | `/api/fasilitator/tim/{id}/presentasi-info` \| `/presentasi-file` | Presentasi tim |
| POST | `/api/fasilitator/tim/{id}/laporan-tautan` \| `/presentasi-tautan` | Tautan penampil dokumen |

**Kode tim, komentar & pengesahan**

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/tim/kode` | Kode tim untuk dibagikan |
| POST | `/api/tim/kode/reset` | Cetak ulang kode (kode lama tidak berlaku) |
| GET / DELETE | `/api/tim/pendamping` \| `/{id}` | Lihat / keluarkan pembimbing |
| GET / POST | `/api/komentar` | Daftar / tambah komentar |
| PUT / DELETE | `/api/komentar/{id}` | Ubah / hapus komentar sendiri |
| PUT | `/api/komentar/{id}/selesai` | Tandai komentar selesai |
| GET | `/api/komentar/jumlah` \| `/belum-dibaca` | Hitungan komentar |
| POST | `/api/komentar/tandai-dibaca` | Tandai komentar sudah dibaca |
| GET | `/api/persetujuan` \| `/ringkas` | Status & rekap ACC |
| PUT | `/api/persetujuan` | Beri ACC / minta revisi (khusus dosen) |

---

## 🗂️ Struktur proyek

```
logbook-app/
├── start.ps1            ← menjalankan aplikasi secara lokal
├── stop.ps1             ← menghentikan proses terkait
├── .env                 ← konfigurasi database & penyimpanan berkas
├── api/index.js         ← titik masuk untuk hosting serverless (Vercel)
├── tools/               ← utilitas: kredensial admin, migrasi data, dsb.
├── backend/             ← Express: REST API + Swagger + penyaji frontend
│   └── src/
│       ├── server.js    ← titik masuk & pemasangan seluruh rute
│       ├── db.js        ← koneksi database + pembuatan skema otomatis
│       ├── storage.js   ← seluruh akses data (akun, entri, komentar, ACC)
│       ├── files.js     ← unggah foto, .docx & .pptx ke penyimpanan berkas
│       ├── auth.js      ← sesi login + pembatasan hak akses per peran
│       ├── admin/       ← panel admin (panel.js + routes.js)
│       └── routes/      ← kegiatan, keuangan, laporan, presentasi, dst.
└── frontend/            ← Next.js, dibangun menjadi berkas statis
    ├── app/             ← Dashboard, Kegiatan, Keuangan, Laporan, Presentasi,
    │                       Galeri, Ekspor, Profil
    └── components/      ← Shell, Komentar, Acc, KartuAcc, dsb.
```

---

## 🧪 Pengujian otomatis

Server harus dalam keadaan berjalan (bawaan `:4000`) dan `.env` sudah terisi.

| Perintah | Yang diuji |
|---|---|
| `npm run diag --workspace backend` | Seluruh rute terdaftar, pembatasan hak akses per peran, dan keutuhan panel admin |
| `npm run diag:peran --workspace backend` | Alur peran menyeluruh: pendaftaran dengan kode, penolakan 403, penugasan tim, komentar dua arah, lencana belum dibaca, dan ACC dosen |
| `npm run diag:presentasi --workspace backend` | Alur presentasi menyeluruh: unggah `.pptx`, normalisasi tautan Canva, akses pembimbing, komentar & ACC, serta penghapusan terpisah |

Akun uji dibuat dan dihapus kembali secara otomatis sehingga data sungguhan
tidak terganggu.

---

## 🔒 Keamanan

- Password disimpan sebagai **hash scrypt** (satu arah) — tidak dapat dibaca
  kembali oleh siapa pun, termasuk pengelola aplikasi.
- Seluruh endpoint data memerlukan token login; pengunjung yang hanya mengetahui
  alamat aplikasi hanya akan melihat halaman masuk.
- Pembatasan hak akses per peran diterapkan di server, sehingga akun pembimbing
  tidak dapat mengubah data tim walaupun permintaannya dibuat secara manual.
- Sesi kedaluwarsa otomatis setelah 30 hari, dan mengganti password langsung
  mengakhiri sesi di perangkat lain.
- Tersedia pembatasan percobaan masuk (anti tebak-tebakan password) serta header
  keamanan standar.
- Gambar disajikan melalui tautan bertanda tangan berumur pendek dan hanya dapat
  diakses pemilik data atau pembimbing yang berhak.

---

## ❓ Tanya-jawab

**Apakah data hilang bila perangkat dimatikan?**
Tidak. Seluruh data tersimpan pada layanan cloud (database dan penyimpanan
berkas), bukan pada perangkat yang menjalankan aplikasi.

**Bisakah satu tim didampingi lebih dari satu dosen?**
Bisa. Hubungan tim dan pembimbing bersifat banyak-ke-banyak: satu tim boleh
memiliki beberapa pembimbing, dan satu pembimbing boleh mendampingi beberapa
tim.

**Bagaimana bila lupa password?**
Admin dapat menyetel ulang password akun melalui panel admin tanpa perlu
mengetahui password lama. Setelah berhasil masuk, gantilah sendiri melalui menu
Pengaturan akun.

**Apakah foto memakan banyak kuota internet?**
Tidak. Foto dikecilkan otomatis di perangkat sebelum diunggah, lalu disajikan
melalui CDN sehingga pemuatan tetap ringan.

**Apakah hasil ekspor menimpa data?**
Tidak. Ekspor selalu menghasilkan salinan baru dan tidak pernah mengubah isi
logbook, jadi aman diunduh berkali-kali.

**Bisakah aplikasi dipasang di ponsel?**
Bisa. Buka aplikasi pada peramban ponsel lalu pilih **"Tambahkan ke layar
utama"**; tampilannya akan berjalan layaknya aplikasi biasa.

