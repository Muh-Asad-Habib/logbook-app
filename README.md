# 📒 Logbook Kegiatan & Keuangan — Sekali Jalan, Bisa Diakses Siapa Saja di Internet

> ### 🚀 BARU v3.0 (Juli 2026) — Online 24 jam TANPA laptop menyala
> Aplikasi kini bisa di-deploy **100% gratis** ke cloud:
> **Vercel** (hosting + URL permanen) + **Neon** (database Postgres) +
> **ImageKit** (foto via CDN, gratis 20 GB).
> 👉 **Ikuti panduan lengkap dari nol di [DEPLOY.md](DEPLOY.md).**
>
> Mode lokal (`.\start.ps1`) tetap ada untuk pengembangan — bedanya data
> sekarang tersimpan di Neon & ImageKit (butuh file `.env`, lihat `.env.example`),
> bukan lagi `data/db.json` + `uploads/`.

> ### 🆕 Pembaruan v2.1 (Juli 2026)
> - **Tampilan baru**: sidebar di desktop, bottom-nav + tombol ➕ melayang di HP, mode gelap 🌙 (ikut sistem / bisa diganti manual), ikon profesional (lucide), notifikasi toast, dialog konfirmasi custom.
> - **Lightbox foto**: klik foto → terbuka penuh, geser (swipe) kiri/kanan di HP.
> - **PWA**: buka lewat HP → menu browser → **"Tambahkan ke layar utama"** — jalan seperti aplikasi asli.
> - **Foto otomatis dikompres** (maks 1600px, ±80% lebih kecil) — galeri jauh lebih ringan.
> - **Keamanan**: rate-limit login/daftar (anti brute-force), sesi kedaluwarsa 30 hari, header keamanan (helmet), validasi tipe file di server.
> - **Halaman kegiatan** dikelompokkan per bulan; **tabel keuangan** ada subtotal bulanan; **dashboard** ada sparkline mini; **profil** ada riwayat aktivitas akun.
>
> Setelah update kode: jalankan `.\start.ps1 -Rebuild` sekali.

Tanpa Docker. Tanpa MongoDB. Tanpa MinIO. Tanpa kirim-kirim kode.
Semua data tersimpan **lokal di komputermu**, dan aplikasi otomatis mendapat
**URL publik** yang bisa dibuka siapa pun — termasuk yang **beda jaringan**.

```
Komputermu (host)                          Teman-temanmu (di mana saja)
┌────────────────────────────┐
│  start.ps1                 │             📱 💻 buka:
│  ├─ Server (Express :4000) │   tunnel    https://xxxx.trycloudflare.com
│  │   ├─ Web (Next.js)      │ ◀────────── (internet, beda jaringan OK)
│  │   ├─ REST API + Swagger │  Cloudflare
│  │   └─ Gambar (ImageKit)  │   (gratis)
│  └─ Data: Neon (Postgres)  │
└────────────────────────────┘
```

## 🚀 Cara pakai (satu perintah)

> Syarat satu-satunya: [Node.js LTS](https://nodejs.org) terpasang (sudah ada di komputermu ✅).

```powershell
cd "<folder-proyek>\logbook-app"
.\start.ps1
```

Skrip ini otomatis:
1. Memasang dependensi (hanya pertama kali)
2. Mem-build frontend (hanya pertama kali)
3. Menjalankan server di `http://localhost:4000`
4. Membuka **tunnel Cloudflare gratis** → muncul kotak berisi URL publik:

```
+--------------------------------------------------------+
|  Your quick Tunnel has been created! Visit it at:      |
|  https://contoh-acak-empat-kata.trycloudflare.com      |
+--------------------------------------------------------+
```

**Bagikan URL itu** ke teman/pembimbing lewat WA — mereka tinggal klik. Selesai. 🎉

Berhenti: tekan `Ctrl+C` (server ikut berhenti). Kalau ada proses nyangkut: `.\stop.ps1`.

## 🔐 Login & akun

Aplikasi ini dirancang untuk **dibagikan** — setiap akun punya logbook sendiri
yang **benar-benar terpisah**: kegiatan, keuangan, dana awal, galeri, ekspor,
dan impornya tidak saling terlihat antar akun.

- **Masuk**: buka aplikasi → halaman login → isi username & password.
- **Daftar**: klik tab **✨ Daftar** — akun baru selalu mulai dari **logbook kosong**.
- **Pengaturan akun**: klik nama akun di kanan atas → **⚙️ Pengaturan akun**
  untuk mengganti username atau password kapan saja.
- **Keluar**: klik nama akun → **⏻ Keluar**.

> - Password disimpan sebagai **hash scrypt** (satu arah, bukan teks asli) — tidak ada
>   siapa pun yang bisa membacanya, termasuk pengelola server.
> - Semua API (kegiatan, keuangan, statistik, gambar, ekspor, impor) butuh token
>   login — orang yang hanya tahu URL tunnel **tidak bisa melihat/mengubah data**.
> - Ganti password otomatis **mengeluarkan sesi di perangkat lain**.
> - **Lupa password?** Pengelola server dapat menyetel ulang password akunmu
>   (tanpa bisa melihat password lama), lalu segera ganti sendiri lewat
>   menu Pengaturan akun.

### 🎓 Peran Fasilitator & 👨‍🏫 Dosen Pendamping

Selain akun **tim** (default), ada dua peran **pendamping** yang memantau
logbook tim:

| Peran | Lihat data tim | Komentar | ACC / minta revisi |
|---|:--:|:--:|:--:|
| 👥 Tim | logbook sendiri | ✅ (membalas) | — |
| 🎓 Fasilitator | ✅ | ✅ | — |
| 👨‍🏫 Dosen Pendamping | ✅ | ✅ | ✅ |

- **Daftar**: di tab Daftar pilih **peran** (Tim / Fasilitator / Dosen
  Pendamping). Untuk pendamping, masukkan **kode** yang ditetapkan admin di
  pusat kendali — kode fasilitator dan kode dosen **berbeda**; tanpa kode yang
  benar pendaftaran ditolak.
- **🔗 Menghubungkan diri (tanpa admin)**: tiap tim punya **Kode tim** di
  halaman **Profil** (mis. `ABCD-2345`). Tim menyalin kode itu, mengirimkannya
  ke fasilitator/dosen, lalu pendamping memasukkannya di **Dashboard →
  Gabung ke tim dengan kode** → langsung terhubung. Tim bisa **mencetak ulang
  kode** (kode lama mati) dan **mengeluarkan** pendamping kapan saja; pendamping
  juga bisa keluar sendiri. Admin tetap dapat menugaskan manual lewat pusat kendali.
- **Akses**: pendamping hanya bisa **melihat & mengomentari** kegiatan,
  keuangan, dan laporan kemajuan tim yang **terhubung dengannya** —
  tidak bisa menambah/mengubah/menghapus data tim (dipagari di server).
- **Many-to-many**: satu tim boleh punya banyak pendamping, dan satu
  pendamping boleh mengampu banyak tim (ada pemilih tim di bilah atas).
- **Komentar 2 arah**: pendamping memulai komentar pada entri; tim membalas,
  menandai selesai, dan keduanya bisa mengedit (berlabel *"(diedit)"*) atau
  menghapus komentar miliknya. Ada badge jumlah komentar belum dibaca di menu.
- **Belum ditugaskan?** Setelah login, pendamping melihat kolom
  *"Gabung ke tim dengan kode"* — minta kodenya ke tim, atau hubungi admin.
- **Pusat kendali**: tabel akun bertab **👥 Tim / 🎓 Fasilitator /
  👨‍🏫 Dosen Pendamping** — kelola kode pendaftaran tiap peran, tetapkan tim
  per pendamping (multi-pilih), dan lihat laporan kemajuan tiap tim.

#### ✅ ACC (pengesahan) oleh dosen pendamping

Tiap entri kegiatan, entri belanja, dan laporan kemajuan punya satu status:

| Status | Arti |
|---|---|
| ⏳ **Menunggu ACC** | belum ditinjau dosen |
| ✔ **Disetujui** | sudah di-ACC dosen pendamping |
| ↺ **Revisi** | dosen minta perbaikan — **wajib disertai catatan** |

- Tombol **ACC / Minta revisi / Batalkan** hanya muncul untuk akun dosen, dan
  server juga menolak permintaan dari peran lain (`PUT /api/persetujuan`).
- Tim melihat lencana status + catatan revisi langsung di entrinya, serta
  rekap **Pengesahan dosen (ACC)** di Dashboard.
- **Otomatis batal saat data berubah**: kalau tim mengedit entri (atau
  mengganti berkas laporan), status kembali ke *menunggu* supaya ACC selalu
  merujuk versi yang benar-benar ditinjau.

### Opsi

| Perintah | Fungsi |
|---|---|
| `.\start.ps1` | Jalankan + URL publik internet |
| `.\start.ps1 -NoTunnel` | Hanya lokal + LAN (tanpa internet) |
| `.\start.ps1 -Rebuild` | Build ulang frontend (setelah mengubah kode frontend) |
| `.\stop.ps1` | Hentikan paksa semua proses |

> ⚠️ Catatan penting:
> - **URL berganti** setiap kali `start.ps1` dijalankan ulang — kirim URL baru ke teman.
> - Komputermu harus **tetap menyala** selama orang lain mengakses (komputermu = servernya).
> - Pertama kali dijalankan, skrip mengunduh `cloudflared.exe` (±50 MB, sekali saja).

## 💾 Di mana data tersimpan?

Sejak v3.0 seluruh data ada di **cloud** (lihat [DEPLOY.md](DEPLOY.md)) — laptop
boleh dimatikan tanpa kehilangan apa pun:

| Apa | Lokasi |
|---|---|
| Akun, peran, kegiatan, keuangan, pengaturan, komentar, status ACC | **Neon** (Postgres) |
| Foto kegiatan & bukti/nota | **ImageKit** (CDN, signed URL) |
| Laporan kemajuan `.docx` | **ImageKit** (bukan Neon — kuota Neon 0,5 GB tetap lega) |
| Kredensial pusat kendali | tabel `meta` di Neon (hash scrypt) |

> Konfigurasi lewat `.env` (`DATABASE_URL`, `IMAGEKIT_*`) — salin dari `.env.example`.
> Tabel dibuat otomatis (`CREATE TABLE IF NOT EXISTS`) saat server pertama tersambung.

**Data lama** ikut terbawa: berkas Streamlit (SQLite `data/logbook.db`) → `data/db.json`
→ Neon + ImageKit lewat `npm run migrate` (sekali jalan). Baris laporan lama yang masih
base64 di Neon otomatis dipindah ke ImageKit saat pertama kali dibuka.

## 📤 Ekspor DOCX, PDF & Excel

Buka menu **📤 Ekspor** di web (atau panggil API langsung):

| Format | Endpoint | Isi |
|---|---|---|
| **DOCX** | `/api/export/docx` | Dokumen logbook terisi otomatis — entri + fotonya tersusun di tabel kegiatan & keuangan. Aman diunduh berulang (entri yang sudah ada dilewati). |
| **PDF** | `/api/export/pdf` | Rekap siap cetak: ringkasan dana, seluruh kegiatan lengkap dengan foto, tabel keuangan bertotal, nomor halaman. |
| **Excel** | `/api/export/xlsx` | 3 sheet: Kegiatan, Keuangan, Ringkasan. |

Ekspor **tidak pernah mengubah data** — yang diunduh selalu salinan terisi. Entri ditulis
mengikuti gaya dokumen; baris kosong sisa tabel otomatis dihapus agar rapi.

## 📥 Impor dari Word

Di halaman **📤 Ekspor/Impor**, unggah berkas `.docx` logbook milikmu lalu klik
**Impor sekarang**:

- Entri kegiatan & belanja yang **belum ada** di aplikasi ditambahkan — **beserta fotonya**
  (foto diekstrak dari dokumen dan disimpan ke `uploads/`).
- Entri yang sudah ada dilewati — aman diklik berulang.
- Mengerti format tanggal `23-Mei-26`, `06 Juni 2026`, `6/5/2026`; waktu `10`, `2 jam`,
  `1 j 30 mnt`; harga `Rp 100.000 / bulan`.
- Via API: `POST /api/import/docx` (multipart, field `file` opsional).

## 📚 REST API (Swagger)

Dokumentasi interaktif: buka `/docs` (mis. `http://localhost:4000/docs` atau
`https://xxxx.trycloudflare.com/docs`). Semua endpoint data butuh **token login**
(header `Authorization: Bearer <token>` atau query `?token=...`):

```bash
# login → dapat token
curl -X POST https://xxxx.trycloudflare.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"username-kamu","password":"password-kamu"}'

# daftar kegiatan (pakai token)
curl https://xxxx.trycloudflare.com/api/kegiatan \
  -H "Authorization: Bearer TOKEN_DARI_LOGIN"

# tambah kegiatan + foto
curl -X POST https://xxxx.trycloudflare.com/api/kegiatan \
  -H "Authorization: Bearer TOKEN_DARI_LOGIN" \
  -F "tanggal=2026-07-11" -F "kegiatan=Rapat tim" \
  -F "capaian_delta=5" -F "waktu_menit=60" -F "foto=@foto.jpg"
```

| Method | Endpoint | Fungsi |
|---|---|---|
| POST | `/api/auth/register` | Daftar akun baru (dapat token) |
| POST | `/api/auth/login` | Login (dapat token) |
| GET | `/api/auth/me` | Profil yang sedang login |
| PUT | `/api/auth/username` | Ganti username sendiri (konfirmasi password) |
| PUT | `/api/auth/password` | Ganti password sendiri (sesi lain keluar) |
| POST | `/api/auth/logout` | Hapus sesi/token |
| GET / POST | `/api/kegiatan` | Daftar / tambah kegiatan (+foto) |
| PUT / DELETE | `/api/kegiatan/{id}` | Ubah / hapus kegiatan |
| GET / POST | `/api/keuangan` | Daftar / tambah belanja (+bukti) |
| PUT / DELETE | `/api/keuangan/{id}` | Ubah / hapus belanja |
| GET / PUT | `/api/pengaturan/{kunci}` | Pengaturan (mis. `dana_awal`) |
| GET | `/api/statistik` | Ringkasan dashboard |
| GET | `/api/files/{key}` | Ambil gambar |
| GET | `/api/export/docx` | Unduh dokumen logbook terisi (.docx) |
| GET | `/api/export/pdf` | Unduh rekap PDF |
| GET | `/api/export/xlsx` | Unduh rekap Excel |
| POST | `/api/import/docx` | Impor entri + foto dari dokumen Word |
| GET | `/health` | Health check (tanpa login) |

**📄 Laporan kemajuan (akun tim)**

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/laporan/info` | Info berkas laporan (nama, ukuran, waktu unggah) |
| GET | `/api/laporan/file` | Unduh/tampilkan `.docx` milik sendiri |
| POST / DELETE | `/api/laporan` | Unggah / hapus laporan (potongan: `/chunk` + `/selesai`) |
| POST | `/api/laporan/tautan` | Buat tautan publik sementara (penampil Office) |
| GET | `/api/laporan/publik/{kunci}` | Akses berkas lewat tautan publik (tanpa login) |

**🎓 Pendamping (fasilitator & dosen) — hanya baca**

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/fasilitator/tim` | Daftar tim yang diampu (bisa lebih dari satu) |
| POST | `/api/fasilitator/gabung` | Gabung ke tim memakai kode yang dibagikan tim |
| DELETE | `/api/fasilitator/tim/{id}` | Keluar dari sebuah tim |
| GET | `/api/fasilitator/tim/{id}/kegiatan` | Kegiatan tim tersebut |
| GET | `/api/fasilitator/tim/{id}/keuangan` | Belanja tim tersebut |
| GET | `/api/fasilitator/tim/{id}/statistik` | Ringkasan angka tim |
| GET | `/api/fasilitator/tim/{id}/ringkasan` | Dashboard: statistik + entri & aktivitas terakhir |
| GET | `/api/fasilitator/tim/{id}/laporan-info` \| `/laporan-file` | Info / isi laporan kemajuan |
| POST | `/api/fasilitator/tim/{id}/laporan-tautan` | Tautan penampil Office (tidak mengubah data) |

**👥 Kode tim (akun tim)**

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/tim/kode` | Kode tim untuk dibagikan ke pendamping |
| POST | `/api/tim/kode/reset` | Cetak ulang kode (kode lama langsung mati) |
| GET | `/api/tim/pendamping` | Daftar pendamping yang terhubung |
| DELETE | `/api/tim/pendamping/{id}` | Keluarkan seorang pendamping |

**💬 Komentar & ✅ ACC**

| Method | Endpoint | Fungsi |
|---|---|---|
| GET / POST | `/api/komentar` | Daftar / tambah komentar (`?jenis=&target_id=&tim=`) |
| PUT / DELETE | `/api/komentar/{id}` | Edit (berlabel *"(diedit)"*) / hapus milik sendiri |
| PUT | `/api/komentar/{id}/selesai` | Tandai selesai (khusus pemilik tim) |
| GET | `/api/komentar/jumlah` | Jumlah komentar per entri (badge) |
| GET | `/api/komentar/belum-dibaca` | Hitungan belum dibaca per pengguna |
| POST | `/api/komentar/tandai-dibaca` | Tandai sejumlah komentar sudah dibaca |
| GET | `/api/persetujuan` | Peta status ACC entri (`menunggu`/`disetujui`/`revisi`) |
| GET | `/api/persetujuan/ringkas` | Rekap ACC satu tim |
| PUT | `/api/persetujuan` | ACC / minta revisi / batalkan — **khusus dosen** |

> Endpoint tulis milik tim (kegiatan, keuangan, pengaturan, ekspor, impor, laporan)
> menolak akun pendamping dengan **403** — pagar ada di server, bukan sekadar UI.

## 🗂️ Struktur proyek

```
logbook-app/
├── start.ps1            ← JALANKAN INI (mode lokal)
├── stop.ps1             ← hentikan paksa
├── .env                 ← DATABASE_URL + kunci ImageKit (dari .env.example)
├── api/index.js         ← entry point serverless (Vercel)
├── tools/               ← cloudflared.exe, migrate-to-cloud.mjs, superuser.mjs
├── backend/             ← Express: API + Swagger + penyaji frontend (port 4000)
│   └── src/
│       ├── server.js    ← entry point + pemasangan seluruh route
│       ├── db.js        ← koneksi Neon + skema (CREATE/ALTER IF NOT EXISTS)
│       ├── storage.js   ← seluruh akses data (akun, entri, komentar, ACC)
│       ├── files.js     ← unggah foto & .docx ke ImageKit (+ signed URL)
│       ├── auth.js      ← sesi + pagar peran (hanyaTim / hanyaFasilitator / hanyaDosen)
│       ├── admin/       ← pusat kendali (panel.js + routes.js)
│       └── routes/      ← kegiatan, keuangan, laporan, fasilitator, komentar, persetujuan, …
└── frontend/            ← Next.js → di-build jadi statis (frontend/out)
    ├── app/             ← Dashboard, Kegiatan, Keuangan, Laporan, Galeri, Ekspor, Profil
    └── components/      ← Shell, Komentar, Acc, KartuAcc, DashboardFasilitator, …
```

## 🧑‍💻 Mode pengembangan (opsional)

```powershell
cd backend;  npm run dev     # API di :4000 (auto-reload)
cd frontend; npm run dev     # UI di :3000 (hot-reload, API → localhost:4000)
```

Uji otomatis (server harus hidup di `:4000`, butuh `.env`):

| Perintah | Isi uji |
|---|---|
| `npm run diag --workspace backend` | Semua rute terdaftar + pagar peran + panel pusat kendali |
| `npm run diag:peran --workspace backend` | End-to-end peran: daftar pakai kode, pagar tulis 403, assignment, komentar 2 arah, badge belum-dibaca, ACC dosen (revisi → batal otomatis saat entri diubah → disetujui). Akun uji dibuat & dihapus otomatis |

Setelah selesai mengubah frontend: `.\start.ps1 -Rebuild`.

## ❓ Tanya-jawab

**T: Teman saya beda kota/beda WiFi, bisa akses?**
J: Bisa — itulah fungsi URL `trycloudflare.com`. Selama komputermu menyala
dan `start.ps1` masih berjalan, siapa pun bisa membuka URL-nya.

**T: Kenapa URL-nya berubah terus?**
J: Quick Tunnel Cloudflare gratis memberi URL acak per sesi. Kalau mau URL
tetap, buat akun Cloudflare (gratis) + domain sendiri → *named tunnel*, atau
sewa VPS dan jalankan server di sana.

**T: Amankah?**
J: Ya, lebih aman sekarang — semua data **dilindungi login**. Orang yang hanya tahu
URL tunnel cuma melihat halaman login; tanpa username & password mereka tidak bisa
melihat atau mengubah apa pun. Password disimpan sebagai hash scrypt.

**T: Data hilang kalau komputer mati?**
J: Tidak — data ada di **Neon** (Postgres) + **ImageKit**, bukan di laptopmu.
Mati-nyalakan bebas; kalau di-deploy ke Vercel, aplikasi bahkan tetap online 24 jam.
Yang berhenti hanya URL tunnel lokal selama `start.ps1` tidak berjalan.

