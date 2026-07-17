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
│  │   └─ Gambar (uploads/)  │   (gratis)
│  └─ Data: data/db.json     │
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

### 🎓 Peran Fasilitator

Selain akun **tim** (default), ada peran **fasilitator** — pembimbing yang
memantau logbook tim:

- **Daftar**: di tab Daftar, isi konfirmasi password lalu centang
  **"Daftar sebagai Fasilitator"** → masukkan **kode fasilitator** yang
  ditetapkan admin di pusat kendali (tanpa kode yang benar, pendaftaran ditolak).
- **Akses**: fasilitator hanya bisa **melihat & mengomentari** kegiatan,
  keuangan, dan laporan kemajuan tim yang **ditugaskan pusat kendali** —
  tidak bisa menambah/mengubah/menghapus data apa pun (dipagari di server).
- **Many-to-many**: satu tim boleh punya banyak fasilitator, dan satu
  fasilitator boleh mengampu banyak tim (ada pemilih tim di bilah atas).
- **Komentar 2 arah**: fasilitator memulai komentar pada entri; tim membalas,
  menandai selesai, dan keduanya bisa mengedit (berlabel *"(diedit)"*) atau
  menghapus komentar miliknya. Ada badge jumlah komentar belum dibaca di menu.
- **Belum ditugaskan?** Setelah login, fasilitator melihat pesan
  *"Hubungi admin untuk menjadikan kamu fasilitator di tim kamu"* sampai
  pusat kendali menetapkan timnya.
- **Pusat kendali**: tabel akun kini bertab **👥 Tim / 🎓 Fasilitator** —
  kelola kode pendaftaran, tetapkan tim per fasilitator (multi-pilih),
  dan lihat laporan kemajuan tiap tim di tab **📄 Laporan**.

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

Semua **lokal di folder proyek** — mudah di-backup (tinggal salin folder):

| Apa | Lokasi |
|---|---|
| Data kegiatan, keuangan, pengaturan | `data/db.json` |
| Semua foto & bukti/nota | `uploads/` |

Data lama dari aplikasi Streamlit (SQLite `data/logbook.db`) **otomatis dimigrasikan**
saat pertama kali server jalan — sudah teruji: 14 kegiatan, 3 belanja, dan dana awal terbawa semua.

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

## 🗂️ Struktur proyek

```
logbook-app/
├── start.ps1            ← JALANKAN INI
├── stop.ps1             ← hentikan paksa
├── data/db.json         ← seluruh data (lokal)
├── uploads/             ← seluruh gambar (lokal)
├── tools/cloudflared.exe← tunnel (terunduh otomatis)
├── backend/             ← Express: API + Swagger + penyaji frontend (port 4000)
│   └── src/
│       ├── server.js    ← entry point
│       ├── storage.js   ← penyimpanan JSON + migrasi otomatis dari SQLite lama
│       ├── files.js     ← simpan/hapus gambar di uploads/
│       └── routes/      ← kegiatan, keuangan, pengaturan, files
└── frontend/            ← Next.js → di-build jadi statis (frontend/out)
    └── app/             ← Dashboard, Kegiatan, Keuangan, Galeri
```

## 🧑‍💻 Mode pengembangan (opsional)

```powershell
cd backend;  npm run dev     # API di :4000 (auto-reload)
cd frontend; npm run dev     # UI di :3000 (hot-reload, API → localhost:4000)
```

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
J: Tidak — data ada di `data/db.json` + `uploads/` di diskmu. Mati-nyalakan bebas;
yang berhenti hanya akses orang lain selama server mati.

