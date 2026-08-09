# ðŸ“’ Logbook Kegiatan & Keuangan

Aplikasi web untuk **mencatat, memantau, dan melaporkan** perjalanan sebuah tim
proyek â€” mulai dari kegiatan harian, pengeluaran dana, laporan kemajuan, sampai
materi presentasi â€” dalam satu tempat yang rapi dan dapat diakses bersama
pembimbing.

Dibuat untuk kebutuhan nyata tim program kemahasiswaan (PKM, proyek penelitian,
tugas besar, program pendampingan): setiap catatan harus lengkap dengan **foto
bukti**, **rekap dana**, dan **pengesahan dosen** â€” lalu pada akhirnya harus
bisa dicetak menjadi dokumen laporan.

> âš¡ **Ingin langsung memakainya?** *Fork* repo ini, lalu ikuti
> **[DEPLOY.md](DEPLOY.md)** â€” Â±30 menit sampai aplikasi hidup di alamat tetap
> `https://nama-kamu.vercel.app`, gratis dan tanpa kartu kredit.

---

## ðŸ“Œ Daftar isi

- [Apa yang bisa dilakukan aplikasi ini](#-apa-yang-bisa-dilakukan-aplikasi-ini)
- [Siapa saja penggunanya](#-siapa-saja-penggunanya)
- [Cara memakai â€” panduan pengguna](#-cara-memakai--panduan-pengguna)
- [Panduan untuk pembimbing](#-panduan-untuk-pembimbing-fasilitator--dosen)
- [Panduan untuk admin](#-panduan-untuk-admin)
- [Menjalankan aplikasi](#-menjalankan-aplikasi)
- [Daftar perintah npm](#-daftar-perintah-npm)
- [Konfigurasi (.env)](#-konfigurasi-env)
- [Di mana data disimpan](#-di-mana-data-disimpan)
- [REST API & dokumentasi Swagger](#-rest-api--dokumentasi-swagger)
- [Struktur proyek](#-struktur-proyek)
- [Pengujian otomatis](#-pengujian-otomatis)
- [Keamanan](#-keamanan)
- [Tanya-jawab](#-tanya-jawab)

---

## âœ¨ Apa yang bisa dilakukan aplikasi ini

| Fitur | Penjelasan |
|---|---|
| ðŸ—“ï¸ **Catatan kegiatan** | Tanggal, uraian kegiatan, durasi, tambahan capaian (%), dan beberapa foto sekaligus. Otomatis dikelompokkan per bulan. |
| ðŸ’° **Catatan keuangan** | Item belanja, harga satuan, jumlah, total otomatis, plus foto nota/bukti. Ada subtotal per bulan. |
| ðŸ“Š **Dashboard** | Ringkasan capaian, total waktu, dana terpakai & sisa dana, grafik mini, dan kegiatan terbaru. |
| ðŸ“„ **Laporan kemajuan** | Unggah dokumen Word (`.docx`) dan tampilkan langsung di aplikasi seperti dibuka di Word. |
| ðŸ“Š **Presentasi** | Unggah PowerPoint (`.pptx`) dan/atau tempel tautan Canva â€” keduanya boleh dipakai bersamaan. |
| ðŸ–¼ï¸ **Galeri** | Semua foto kegiatan dalam satu halaman, bisa dibuka besar (geser kiri/kanan di ponsel). |
| ðŸ“¤ **Ekspor** | Unduh rekap sebagai **Word**, **PDF**, atau **Excel** â€” siap dikumpulkan. |
| ðŸ“¥ **Impor** | Punya logbook lama berbentuk Word? Unggah, isinya (termasuk foto) dipindahkan otomatis. |
| ðŸ’¬ **Komentar 2 arah** | Pembimbing memberi catatan pada entri tertentu, tim membalas, ada penanda "belum dibaca". |
| âœ… **Pengesahan (ACC)** | Dosen menyetujui atau meminta revisi tiap entri; statusnya terlihat jelas oleh tim. |
| ðŸŒ™ **Nyaman dipakai** | Tampilan terang/gelap, responsif di ponsel, dan bisa dipasang sebagai aplikasi (PWA). |

---

## ðŸ‘¥ Siapa saja penggunanya

Aplikasi mengenal empat peran dengan hak akses berbeda:

| Peran | Bisa melihat | Ubah data | Komentar | ACC / minta revisi |
|---|---|:--:|:--:|:--:|
| ðŸ‘¥ **Tim** | logbook miliknya sendiri | âœ… | âœ… (membalas) | â€” |
| ðŸŽ“ **Fasilitator** | logbook tim yang didampingi | â€” | âœ… | â€” |
| ðŸ‘¨â€ðŸ« **Dosen Pendamping** | logbook tim yang didampingi | â€” | âœ… | âœ… |
| ðŸ›¡ï¸ **Admin** | semua akun & data | pengelolaan akun | â€” | â€” |

Setiap akun tim memiliki logbook yang **benar-benar terpisah** â€” kegiatan,
keuangan, dana, galeri, dan dokumennya tidak terlihat oleh tim lain.

Pembatasan hak akses ini dijaga di sisi server, bukan sekadar disembunyikan di
tampilan: permintaan yang tidak berhak selalu ditolak dengan kode **403**.

---

## ðŸ“– Cara memakai â€” panduan pengguna

### 1. Membuat akun & masuk

1. Buka alamat aplikasi, lalu pilih tab **âœ¨ Daftar**.
2. Pilih peran:
   - **Tim** â€” dapat langsung mendaftar.
   - **Fasilitator** atau **Dosen Pendamping** â€” memerlukan **kode pendaftaran**
     dari admin (kode untuk keduanya berbeda).
3. Isi username & password, lalu daftar. Akun baru selalu dimulai dari logbook
   kosong.
4. Untuk kunjungan berikutnya, gunakan tab **Masuk**.

> Username dan password dapat diganti kapan saja melalui nama akun (pojok) â†’
> **âš™ï¸ Pengaturan akun**. Mengganti password otomatis mengeluarkan sesi di
> perangkat lain.

### 2. Menyiapkan dana awal

Buka **Keuangan** lalu isi **Dana awal** dengan total anggaran tim. Angka ini
dipakai untuk menghitung **sisa dana** di dashboard dan pada semua hasil ekspor.

### 3. Mencatat kegiatan

1. Buka menu **Kegiatan** â†’ tombol **Tambah** (di ponsel: tombol **âž•** melayang).
2. Isi bagian berikut:
   - **Tanggal** kegiatan
   - **Uraian kegiatan** â€” tulis sedetail mungkin (tempat, jam, siapa yang hadir)
   - **Durasi** dalam menit
   - **Tambahan capaian (%)** â€” kemajuan dari kegiatan ini; aplikasi
     menjumlahkannya menjadi capaian total
   - **Foto** â€” boleh beberapa sekaligus
3. Simpan. Entri akan muncul dikelompokkan per bulan, dan foto dapat diklik
   untuk diperbesar.

> Foto dikecilkan otomatis di perangkat sebelum dikirim, sehingga unggahan tetap
> cepat meskipun memakai foto ponsel beresolusi tinggi.

### 4. Mencatat pengeluaran

Buka menu **Keuangan** â†’ **Tambah**, lalu isi nama item, harga satuan, jumlah,
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

1. Buka menu **Profil** â†’ bagian **Kode tim** (contoh: `ABCD-2345`).
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
| â³ **Menunggu ACC** | belum ditinjau dosen |
| âœ” **Disetujui** | sudah disahkan dosen pendamping |
| â†º **Revisi** | dosen meminta perbaikan â€” selalu disertai catatan |

Bila entri diperbaiki (atau berkas laporan/presentasi diganti), statusnya
otomatis kembali ke **menunggu** supaya pengesahan selalu merujuk versi
terbaru. Jumlah komentar yang belum dibaca tampil sebagai lencana pada menu.

### 8. Mengekspor & mengimpor dokumen

Buka menu **Ekspor**:

| Format | Isi |
|---|---|
| **Word (.docx)** | Dokumen logbook terisi otomatis â€” entri beserta fotonya tersusun dalam tabel kegiatan & keuangan. |
| **PDF** | Rekap siap cetak: ringkasan dana, seluruh kegiatan berikut foto, tabel keuangan bertotal, dan nomor halaman. |
| **Excel (.xlsx)** | Tiga lembar: Kegiatan, Keuangan, dan Ringkasan. |

Nama berkas hasil unduhan dibuat khas untuk tiap tim beserta tanggal unduhnya,
sehingga tidak tertukar saat dikumpulkan bersama tim lain:

```
Logbook Tim Alpha - Kegiatan & Keuangan (04-08-2026).docx
Logbook Tim Alpha - Kegiatan & Keuangan (04-08-2026).pdf
Logbook Tim Alpha - Rekap Kegiatan & Keuangan (04-08-2026).xlsx
```

Ekspor **tidak pernah mengubah data** â€” yang diunduh selalu salinan baru dan
aman diulang berkali-kali.

**Impor:** pada halaman yang sama, unggah logbook Word lama lalu klik **Impor
sekarang**. Entri yang belum ada akan ditambahkan lengkap dengan fotonya; entri
yang sudah ada dilewati sehingga aman diklik berulang. Format tanggal seperti
`23-Mei-26`, `06 Juni 2026`, `6/5/2026`, durasi `2 jam` atau `1 j 30 mnt`, serta
harga `Rp 100.000 / bulan` sudah dikenali.

---

## ðŸŽ“ Panduan untuk pembimbing (fasilitator & dosen)

1. **Daftar** dengan peran Fasilitator atau Dosen Pendamping memakai kode dari
   admin.
2. **Terhubung ke tim** â€” masukkan kode tim di dashboard, atau minta admin
   menugaskan secara manual.
3. **Memantau** â€” menu Kegiatan, Keuangan, Laporan Kemajuan, dan Presentasi
   menampilkan data tim yang didampingi (hanya dapat dibaca).
4. **Berkomentar** â€” mulai diskusi pada entri mana pun; tim akan membalas.
5. **Memberi ACC** (khusus dosen) â€” setujui entri atau minta revisi disertai
   catatan perbaikan.

Bila mendampingi lebih dari satu tim, gunakan **pemilih tim** pada bilah atas
untuk berpindah. Pembimbing juga dapat keluar dari sebuah tim kapan saja.

---

## ðŸ›¡ï¸ Panduan untuk admin

Panel admin merupakan halaman terpisah dengan login tersendiri. Di dalamnya
tersedia:

- **Ringkasan** jumlah akun, kegiatan, belanja, sesi aktif, entri ter-ACC, dan
  laporan.
- **Daftar akun** bertab **ðŸ‘¥ Tim / ðŸŽ“ Fasilitator / ðŸ‘¨â€ðŸ« Dosen Pendamping**
  lengkap dengan pencarian.
- **Detail akun** â€” kegiatan, keuangan, laporan, dan jejak aktivitas satu akun.
- **Pengelolaan akun** â€” ganti username, setel ulang password, keluarkan dari
  semua perangkat, hapus akun.
- **Kode pendaftaran** untuk fasilitator dan dosen (dapat diganti kapan saja).
- **Penugasan tim** â€” hubungkan pembimbing ke tim melalui tombol **ðŸ”— Tim**.
- **Catatan audit** yang diperbarui langsung.

> Alamat panel admin beserta kredensialnya dibuat otomatis saat aplikasi pertama
> kali dijalankan dan ditampilkan **satu kali** pada log server â€” catat baik-baik.
> Kredensial dapat disetel ulang kapan saja dengan `node tools/superuser.mjs`.
> Karena alamat tersebut tidak pernah ditautkan dari halaman mana pun, simpanlah
> secara pribadi.

---

## ðŸš€ Menjalankan aplikasi

### Pilihan A â€” Online 24 jam (disarankan)

Aplikasi dirancang untuk berjalan di layanan gratis:

| Bagian | Layanan |
|---|---|
| Hosting + alamat tetap | **Vercel** |
| Database | **Neon** (PostgreSQL) |
| Penyimpanan gambar & dokumen | **ImageKit** |

Panduan lengkap langkah demi langkah tersedia pada **[DEPLOY.md](DEPLOY.md)** â€”
mulai dari mem-*fork* repo ini sampai aplikasi hidup di alamat tetap.
Setelah terpasang, aplikasi dapat diakses siapa pun melalui alamat tetap tanpa
memerlukan perangkat yang menyala terus-menerus.

### Pilihan B â€” Menjalankan sendiri (lokal)

**Prasyarat:** [Git](https://git-scm.com) dan [Node.js LTS](https://nodejs.org)
terpasang, lalu ambil kodenya dan isi berkas `.env`
(lihat [Konfigurasi](#-konfigurasi-env)).

```powershell
git clone https://github.com/Muh-Asad-Habib/logbook-app.git
cd logbook-app
npm install
Copy-Item .env.example .env   # lalu isi nilainya
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

### Pilihan C â€” Mode pengembangan

```powershell
npm run dev --workspace backend      # API pada :4000 (muat ulang otomatis)
npm run dev --workspace frontend     # Antarmuka pada :3000 (API â†’ localhost:4000)
```

---

## ðŸ§° Daftar perintah npm

Dijalankan dari folder proyek (akar):

| Perintah | Fungsi |
|---|---|
| `npm install` | Pasang seluruh dependensi (backend + frontend sekaligus) |
| `npm run build` | Bangun frontend menjadi berkas statis (`frontend/out`) |
| `npm start` | Jalankan server API + penyaji frontend pada `:4000` |
| `npm run dev` | Mode pengembangan backend (muat ulang otomatis) |
| `npm run migrate` | Pindahkan data lokal lama (`data/` + `uploads/`) ke Neon & ImageKit |
| `npm run deploy` | Deploy produksi ke Vercel (`npx vercel --prod --yes`) |
| `npm run cek:online <url>` | Bandingkan versi online dengan commit terakhir + uji halaman |

Utilitas lain di folder `tools/`:

| Perintah | Fungsi |
|---|---|
| `node tools/superuser.mjs -u NAMA -p SANDI` | Setel ulang kredensial panel admin |
| `node tools/impor-logbook.mjs --file "berkas.docx" --user "Nama Akun"` | Impor dokumen Word besar langsung ke sebuah akun |

---

## âš™ï¸ Konfigurasi (.env)

Salin `.env.example` menjadi `.env` di akar folder proyek, lalu isi:

| Variabel | Kegunaan |
|---|---|
| `DATABASE_URL` | Alamat koneksi database Neon (PostgreSQL). |
| `IMAGEKIT_PUBLIC_KEY` | Kunci publik ImageKit. |
| `IMAGEKIT_PRIVATE_KEY` | Kunci privat ImageKit â€” rahasia. |
| `IMAGEKIT_URL_ENDPOINT` | Endpoint URL ImageKit. |
| `IMAGEKIT_FOLDER` | Folder penyimpanan (opsional, bawaan `/logbook`). |

Tabel database dibuat otomatis saat server pertama kali tersambung sehingga
tidak ada langkah migrasi manual. Bila kunci ImageKit dikosongkan, berkas
disimpan ke folder `uploads/` â€” praktis untuk pengembangan, namun tidak
disarankan untuk pemakaian sungguhan.

---

## ðŸ’¾ Di mana data disimpan

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

## ðŸ“š REST API & dokumentasi Swagger

Dokumentasi interaktif tersedia pada `/docs` (misalnya
`http://localhost:4000/docs`). Seluruh endpoint data memerlukan token login,
melalui header `Authorization: Bearer <token>` atau query `?token=...`.

```bash
# 1) masuk â†’ memperoleh token
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
| GET | `/api/export/info` | Jumlah entri baru yang akan masuk ke dokumen |
| GET | `/api/export/docx` \| `/pdf` \| `/xlsx` | Unduh hasil ekspor |
| POST | `/api/import/docx` | Impor entri + foto dari dokumen Word |
| POST | `/api/import/docx/chunk` \| `/docx/selesai` | Impor berkas besar secara terpotong |

**Umum (tanpa login)**

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/health` | Pemeriksaan status + penanda versi deploy |
| GET | `/docs` | Dokumentasi Swagger interaktif |
| GET | `/openapi.json` | Spesifikasi OpenAPI mentah |

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

## ðŸ—‚ï¸ Struktur proyek

```
logbook-app/
â”œâ”€â”€ start.ps1            â† menjalankan aplikasi secara lokal
â”œâ”€â”€ stop.ps1             â† menghentikan proses terkait
â”œâ”€â”€ vercel.json          â† pengaturan hosting serverless (build, rewrite, region)
â”œâ”€â”€ .env                 â† konfigurasi database & penyimpanan berkas (lokal saja)
â”œâ”€â”€ api/index.js         â† titik masuk untuk hosting serverless (Vercel)
â”œâ”€â”€ tools/               â† utilitas: kredensial admin, migrasi data, cek online
â”œâ”€â”€ backend/             â† Express: REST API + Swagger + penyaji frontend
â”‚   â””â”€â”€ src/
â”‚       â”œâ”€â”€ server.js    â† titik masuk & pemasangan seluruh rute
â”‚       â”œâ”€â”€ db.js        â† koneksi database + pembuatan skema otomatis
â”‚       â”œâ”€â”€ storage.js   â† seluruh akses data (akun, entri, komentar, ACC)
â”‚       â”œâ”€â”€ files.js     â† unggah foto, .docx & .pptx ke penyimpanan berkas
â”‚       â”œâ”€â”€ auth.js      â† sesi login + pembatasan hak akses per peran
â”‚       â”œâ”€â”€ assets/      â† template-logbook.docx (kerangka dokumen ekspor)
â”‚       â”œâ”€â”€ export/      â† penyusun berkas docx, pdf, xlsx
â”‚       â”œâ”€â”€ import/      â† pembaca logbook Word lama
â”‚       â”œâ”€â”€ admin/       â† panel admin (panel.js + routes.js)
â”‚       â””â”€â”€ routes/      â† kegiatan, keuangan, laporan, presentasi, dst.
â””â”€â”€ frontend/            â† Next.js, dibangun menjadi berkas statis
    â”œâ”€â”€ app/             â† Dashboard, Kegiatan, Keuangan, Laporan, Presentasi,
    â”‚                       Galeri, Ekspor, Profil
    â”œâ”€â”€ lib/api.js       â† pemanggil REST API + cache sisi klien
    â””â”€â”€ components/      â† Shell, Komentar, Acc, KartuAcc, dsb.
```

> Template `backend/src/assets/template-logbook.docx` hanya berisi **kerangka
> tabel kosong** (judul kolom) â€” hasil ekspor diisi sepenuhnya dari data akun
> yang sedang masuk.

---

## ðŸ§ª Pengujian otomatis

Server harus dalam keadaan berjalan (bawaan `:4000`) dan `.env` sudah terisi.

| Perintah | Yang diuji |
|---|---|
| `npm run diag --workspace backend` | Seluruh rute terdaftar (`diag:rute`) dan keutuhan panel admin (`diag:panel`) |
| `npm run diag:panel-api --workspace backend` | Endpoint panel admin: validasi input, pengelolaan akun, audit |
| `npm run diag:peran --workspace backend` | Alur peran menyeluruh: pendaftaran dengan kode, penolakan 403, penugasan tim, komentar dua arah, lencana belum dibaca, dan ACC dosen |
| `npm run diag:presentasi --workspace backend` | Alur presentasi menyeluruh: unggah `.pptx`, normalisasi tautan Canva, akses pembimbing, komentar & ACC, serta penghapusan terpisah |

Akun uji dibuat dan dihapus kembali secara otomatis sehingga data sungguhan
tidak terganggu.

---

## ðŸ”’ Keamanan

- Password disimpan sebagai **hash scrypt** (satu arah) â€” tidak dapat dibaca
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

## â“ Tanya-jawab

**Bisakah saya memakainya untuk timku sendiri?**
Bisa. *Fork* repo ini, buat akun gratis di Vercel + Neon + ImageKit, lalu ikuti
[DEPLOY.md](DEPLOY.md). Seluruh data (akun, foto, dokumen) tersimpan di layanan
milikmu sendiri â€” tidak ada yang dikirim ke pemilik repo.

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
logbook, jadi aman diunduh berkali-kali. Nama berkasnya pun mengandung nama akun
dan tanggal unduh sehingga tidak saling menimpa di folder unduhan.

**Bisakah aplikasi dipasang di ponsel?**
Bisa. Buka aplikasi pada peramban ponsel lalu pilih **"Tambahkan ke layar
utama"**; tampilannya akan berjalan layaknya aplikasi biasa.

