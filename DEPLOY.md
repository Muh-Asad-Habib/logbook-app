# 🚀 DEPLOY.md — Online-kan Logbook 24 Jam, 100% Gratis, Laptop Boleh Mati

> Panduan ini ditulis **dari nol** — ikuti urut dari atas ke bawah, ±30–45 menit.
> Hasil akhir: aplikasi punya **URL permanen** `https://nama-kamu.vercel.app`
> yang bisa dibuka siapa saja, kapan saja, **tanpa laptopmu menyala**.

## 🗺️ Gambaran besar (pahami dulu 2 menit)

Versi lama: semuanya hidup di laptopmu. Versi baru: tiap bagian "dititipkan"
ke layanan cloud gratis yang memang khusus untuk itu:

```
                ┌─────────────────────────────────────────────┐
 Pengguna 📱💻  │  VERCEL (gratis)                            │
 ───────────────►  • halaman web (Next.js, statis)            │
 https://xxx    │  • backend API (Express, serverless)        │
 .vercel.app    └──────────┬──────────────────┬───────────────┘
                           │ data             │ foto
                ┌──────────▼─────────┐  ┌─────▼───────────────┐
                │ NEON (gratis)      │  │ IMAGEKIT (gratis)   │
                │ Postgres 0.5 GB    │  │ CDN foto 20 GB      │
                │ akun, kegiatan,    │  │ foto kegiatan &     │
                │ keuangan, log      │  │ bukti belanja       │
                └────────────────────┘  └─────────────────────┘
```

| Layanan | Tugas | Kuota gratis | Perlu kartu? |
|---|---|---|---|
| **GitHub** | menyimpan kode (Vercel membacanya dari sini) | tak terbatas utk repo | ❌ |
| **Vercel** | hosting web + API, URL permanen | 100 GB bandwidth/bln | ❌ |
| **Neon** | database Postgres (pengganti `data/db.json`) | 0.5 GB (≈ jutaan entri teks) | ❌ |
| **ImageKit** | penyimpanan + CDN foto (pengganti `uploads/`) | 20 GB simpan + 20 GB transfer/bln | ❌ |

> 💡 Foto dikompres otomatis jadi ±300 KB → 20 GB ≈ **60.000 foto**. Tenang.

---

## Bagian 1 — Siapkan Git & GitHub

### 1.1 Buat akun GitHub
1. Buka **https://github.com/signup**, daftar dengan email (gratis).
2. Verifikasi email.

### 1.2 Pasang Git di laptop (sekali saja)
1. Unduh dari **https://git-scm.com/download/win** → install (next-next-finish).
2. Buka **PowerShell baru**, cek: `git --version` → keluar angka versi = beres.
3. Kenalkan dirimu ke Git (dipakai sebagai "tanda tangan" commit):
   ```powershell
   git config --global user.name  "Nama Kamu"
   git config --global user.email "email-github-kamu@example.com"
   ```

### 1.3 Buat repo & push kode
1. Di GitHub klik **➕ → New repository** → nama: `logbook-app` →
   pilih **Private** (kodenya tidak perlu publik) → **Create repository**.
2. Di PowerShell:
   ```powershell
   cd "<folder-proyek>\logbook-app"
   git init
   git add .
   git commit -m "Logbook v3: Vercel + Neon + ImageKit"
   git branch -M main
   git remote add origin https://github.com/USERNAME-KAMU/logbook-app.git
   git push -u origin main
   ```
   (Saat diminta login, browser terbuka → klik **Authorize**.)

> 🔒 File rahasia (`.env`), data (`data/`), dan foto (`uploads/`) **otomatis
> TIDAK ikut ter-push** — sudah dikecualikan lewat `.gitignore`.

---

## Bagian 2 — Neon (database Postgres gratis)

1. Buka **https://neon.tech** → **Sign up** → paling gampang: **Continue with GitHub**.
2. Buat proyek baru:
   - **Project name**: `logbook`
   - **Postgres version**: biarkan default
   - **Region**: pilih **Asia Pacific (Singapore)** ← penting, paling dekat
3. Setelah proyek jadi, klik tombol **Connect** (kanan atas) →
   pilih **Connection string** → salin URL yang bentuknya seperti:
   ```
   postgresql://neondb_owner:npg_xxxx@ep-xxxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
   Ini **DATABASE_URL**-mu. Simpan dulu di Notepad. **Jangan bagikan ke siapa pun.**

> ℹ️ Tabel-tabel dibuat **otomatis** oleh aplikasi saat pertama tersambung —
> kamu tidak perlu menulis SQL apa pun.

---

## Bagian 3 — ImageKit (penyimpanan foto gratis 20 GB)

1. Buka **https://imagekit.io** → **Sign up** (gratis, tanpa kartu).
2. Saat diminta **ImageKit ID / URL endpoint**, isi bebas (mis. `logbookmu`) —
   region pilih **Singapore** bila ditawarkan.
3. Ambil 3 kunci: menu **Developer options → API keys**
   (https://imagekit.io/dashboard/developer/api-keys):
   - **URL-endpoint** → contoh `https://ik.imagekit.io/logbookmu`
   - **Public key** → `public_xxxx`
   - **Private key** → klik ikon mata → `private_xxxx` ← **rahasia!**
4. **Amankan foto** (supaya hanya tautan bertanda-tangan dari aplikasi yang bisa
   membuka foto): menu **Settings → Images → Restrict unsigned image URLs**
   (atau "Signed URLs" di beberapa versi dashboard) → **aktifkan** → Save.

> Cara kerja di aplikasi ini: browser minta foto ke `/api/files/...` →
> backend cek token login → balas **redirect ke signed URL** ImageKit
> (berlaku 1 jam) → foto meluncur langsung dari CDN. Cepat & tetap privat.

> 📄 **Laporan kemajuan (.docx) juga tersimpan di ImageKit** — bukan di Neon.
> Kuota Neon (0,5 GB) tetap lega walau tiap tim mengunggah laporan puluhan MB;
> ImageKit menampung sampai 20 GB. Baris laporan lama (base64 di Neon) otomatis
> **dimigrasikan** ke ImageKit saat pertama kali diakses — tanpa langkah manual.

---

## Bagian 4 — Isi file `.env` di laptop

1. Di folder `logbook-app`, **salin** `.env.example` menjadi `.env`:
   ```powershell
   cd "<folder-proyek>\logbook-app"
   Copy-Item .env.example .env
   notepad .env
   ```
2. Isi semua nilainya (dari Bagian 2 & 3):
   ```dotenv
   DATABASE_URL=postgresql://neondb_owner:npg_xxxx@ep-xxxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   IMAGEKIT_PUBLIC_KEY=public_xxxx
   IMAGEKIT_PRIVATE_KEY=private_xxxx
   IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/logbookmu
   IMAGEKIT_FOLDER=/logbook
   ```
3. Simpan. (File ini hanya ada di laptopmu — dipakai untuk migrasi & mode lokal.)

---

## Bagian 5 — Pindahkan data lama ke cloud (sekali saja)

Semua akun, kegiatan, keuangan, kredensial panel, dan **seluruh foto** di
`data/` + `uploads/` dipindahkan oleh satu perintah:

```powershell
cd "<folder-proyek>\logbook-app"
npm install
npm run migrate
```

Contoh keluaran yang benar:

```
1/3  Migrasi data ke Neon Postgres
- akun          : 3 baru dari 3
- kegiatan      : 14 baru dari 14
- keuangan      : 3 baru dari 3
...
3/3  Unggah foto ke ImageKit
  ✓ keg_2026-05-23_image1.jpeg
  ...
SELESAI 🎉
```

> Aman dijalankan berulang — yang sudah pernah masuk otomatis dilewati.
> Data lokalmu **tidak dihapus** (jadi cadangan).

---

## Bagian 6 — Deploy ke Vercel

1. Buka **https://vercel.com/signup** → **Continue with GitHub** → izinkan.
2. Di dashboard klik **Add New… → Project** → cari repo **logbook-app** → **Import**.
3. Pengaturan build **biarkan apa adanya** (semuanya sudah diatur oleh file
   `vercel.json` di repo — Framework "Other", build & output otomatis).
4. Buka bagian **Environment Variables**, tambahkan **5 baris yang sama persis
   dengan isi `.env`-mu**:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | `postgresql://…` |
   | `IMAGEKIT_PUBLIC_KEY` | `public_…` |
   | `IMAGEKIT_PRIVATE_KEY` | `private_…` |
   | `IMAGEKIT_URL_ENDPOINT` | `https://ik.imagekit.io/…` |
   | `IMAGEKIT_FOLDER` | `/logbook` |

5. Klik **Deploy** → tunggu 1–3 menit → 🎉 muncul **URL permanen**, misal:
   ```
   https://logbook-app-xxxx.vercel.app
   ```
6. **Bagikan URL itu** ke teman/pembimbing. Selesai — laptop boleh dimatikan
   selamanya; URL tidak pernah berubah.

### Update aplikasi di kemudian hari
Cukup push perubahan — Vercel otomatis build & deploy ulang:
```powershell
git add . ; git commit -m "perubahan" ; git push
```

---

## Bagian 7 — Uji coba (checklist 5 menit)

Buka URL vercel.app-mu, lalu centang satu per satu:

- [ ] Halaman login terbuka
- [ ] **Login** dengan akun lama (username & password TIDAK berubah)
- [ ] Dashboard menampilkan angka yang sama seperti dulu
- [ ] Halaman **Kegiatan**: foto-foto lama tampil (dimuat dari CDN ImageKit)
- [ ] **Tambah kegiatan baru + foto** dari HP → tersimpan & tampil
- [ ] **Ekspor DOCX / PDF / Excel** → file terunduh, foto ikut di dalamnya
- [ ] `https://URL-kamu/docs` → dokumentasi API (Swagger) terbuka
- [ ] Panel pemeliharaan: `https://URL-kamu/pusat-kendali` (atau path custom-mu)
      → login dengan kredensial panel lama

---

## Bagian 8 — Hal yang perlu diketahui

**Kredensial panel pemeliharaan.** Ikut termigrasi dari `data/admin.json`
(username/password panel lama tetap berlaku). Bila dulu belum pernah ada,
kredensial acak dibuat otomatis dan **dicetak sekali ke log**: buka proyek di
Vercel → tab **Logs** → cari baris `[keamanan]`. Lupa password panel?
Jalankan di laptop: `node tools/superuser.mjs -u namabaru -p sandibaru`.

**Batas ukuran upload ±4 MB per request** (batas platform Vercel).
Foto HP biasanya lolos (dan tetap dikompres server jadi ±300 KB), tapi
**impor .docx raksasa** (>4 MB, banyak foto) bisa ditolak — impor dokumen
besar cukup dilakukan sekali lewat `npm run migrate` dari laptop.

**"Tidur" singkat.** Bila tak ada pengunjung ±5 menit, database Neon ikut
tidur; request pertama berikutnya butuh ±1–3 detik ekstra. Normal untuk
paket gratis, request berikutnya cepat lagi.

**Mode lokal masih bisa** (untuk pengembangan): `.\start.ps1` tetap jalan —
bedanya sekarang data dibaca/ditulis ke Neon & ImageKit (butuh internet +
`.env`), bukan lagi file lokal.

**Cadangan data.** Folder `data/` + `uploads/` lama = cadangan terakhir kondisi
sebelum migrasi. Neon juga punya fitur *point-in-time restore* di dashboard.

**Kuota gratis.** Perkiraan pemakaian logbook (beberapa pengguna, ratusan
entri): Neon terpakai <1%, ImageKit <1%, Vercel <5%/bulan. Sangat longgar.

## ❓ Gangguan umum

| Gejala | Penyebab & solusi |
|---|---|
| Build Vercel gagal: `DATABASE_URL belum diisi` | Env vars belum ditambahkan di proyek Vercel (Bagian 6.4), lalu **Redeploy** |
| Login gagal padahal password benar | Migrasi belum dijalankan (`npm run migrate`) atau `DATABASE_URL` di Vercel beda dengan yang dipakai migrasi |
| Foto lama tidak muncul | Bagian 3/3 migrasi dilewati (kunci ImageKit belum diisi saat itu) → isi `.env`, jalankan `npm run migrate` lagi |
| Foto tampil sebentar lalu rusak setelah 1 jam | Normal — signed URL kedaluwarsa; aplikasi otomatis minta URL baru saat halaman dimuat ulang |
| `Upload ke ImageKit gagal (401)` | `IMAGEKIT_PRIVATE_KEY` salah/tertukar dengan public key |
| Ekspor PDF timeout | Entri berfoto sangat banyak; coba lagi (cache CDN membantu) — batas fungsi 60 detik |

