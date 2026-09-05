# 🚀 DEPLOY.md — Online-kan Logbook 24 Jam, 100% Gratis, Laptop Boleh Mati

> Panduan ini ditulis **dari nol** untuk siapa saja yang ingin memakai aplikasi
> ini — kodenya diambil langsung dari repo
> **https://github.com/Muh-Asad-Habib/logbook-app**. Ikuti urut dari atas ke
> bawah, ±30–45 menit. Hasil akhir: aplikasi punya **URL permanen**
> `https://nama-kamu.vercel.app` yang bisa dibuka siapa saja, kapan saja,
> **tanpa laptopmu menyala**.

## 🗺️ Gambaran besar (pahami dulu 2 menit)

Aplikasi ini tidak berjalan di laptopmu — tiap bagian "dititipkan"
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
| **GitHub** | menyimpan salinan kodemu (Vercel membacanya dari sini) | tak terbatas utk repo | ❌ |
| **Vercel** | hosting web + API, URL permanen | 100 GB bandwidth/bln | ❌ |
| **Neon** | database Postgres (akun, kegiatan, keuangan) | 0.5 GB (≈ jutaan entri teks) | ❌ |
| **ImageKit** | penyimpanan + CDN foto & dokumen | 20 GB simpan + 20 GB transfer/bln | ❌ |

> 💡 Foto dikompres otomatis jadi ±300 KB → 20 GB ≈ **60.000 foto**. Tenang.

---

## Bagian 1 — Ambil kode dari repo ini

### 1.1 Buat akun GitHub
1. Buka **https://github.com/signup**, daftar dengan email (gratis).
2. Verifikasi email.

### 1.2 Pasang Git & Node.js di laptop (sekali saja)
1. Unduh Git dari **https://git-scm.com/download/win** → install (next-next-finish).
2. Unduh **Node.js LTS** dari **https://nodejs.org** → install.
3. Buka **PowerShell baru**, cek keduanya:
   ```powershell
   git --version    # keluar angka versi = beres
   node --version   # minimal v20
   ```
4. Kenalkan dirimu ke Git (dipakai sebagai "tanda tangan" commit):
   ```powershell
   git config --global user.name  "Nama Kamu"
   git config --global user.email "email-github-kamu@example.com"
   ```

### 1.3 Fork lalu clone repo
1. Buka **https://github.com/Muh-Asad-Habib/logbook-app** → klik tombol
   **Fork** (kanan atas) → **Create fork**. Sekarang kamu punya salinan repo
   sendiri: `https://github.com/USERNAME-KAMU/logbook-app`.
2. Clone salinanmu ke laptop — di PowerShell:
   ```powershell
   cd "C:\folder\pilihanmu"
   git clone https://github.com/USERNAME-KAMU/logbook-app.git
   cd logbook-app
   npm install
   ```

> 💡 **Alternatif tanpa fork** (kalau tidak berencana menyimpan perubahanmu di
> GitHub): langsung `git clone https://github.com/Muh-Asad-Habib/logbook-app.git`
> juga bisa — deploy-nya lewat Vercel CLI (Bagian 6, cara B).

> 🔒 File rahasia (`.env`), data lokal (`data/`), dan foto (`uploads/`)
> **otomatis TIDAK ikut ter-push** — sudah dikecualikan lewat `.gitignore`.
> Kunci-kuncimu tetap milikmu sendiri.

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

> 📄 **Laporan kemajuan (.docx) & presentasi (.pptx) juga tersimpan di ImageKit** —
> bukan di Neon. Kuota Neon (0,5 GB) tetap lega walau tiap tim mengunggah
> dokumen puluhan MB; ImageKit menampung sampai 20 GB.

---

## Bagian 4 — Isi file `.env` di laptop

1. Di folder hasil clone, **salin** `.env.example` menjadi `.env`:
   ```powershell
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
3. Simpan. (File ini hanya ada di laptopmu — tidak pernah ikut ter-push.)

---

## Bagian 5 — (Opsional) Impor data lama

**Mulai dari nol? Lewati bagian ini** — akun dan seluruh tabel dibuat otomatis
saat aplikasi pertama tersambung ke database.

Punya data dari instalasi lama aplikasi ini (folder `data/` + `uploads/`)?
Taruh kedua folder itu di root proyek, lalu:

```powershell
npm run migrate
```

Semua akun, kegiatan, keuangan, kredensial panel, dan seluruh foto dipindahkan
ke Neon + ImageKit. Contoh keluaran yang benar:

```
1/3  Migrasi data ke Neon Postgres
- akun          : 3 baru dari 3
- kegiatan      : 14 baru dari 14
- keuangan      : 3 baru dari 3
...
3/3  Unggah foto ke ImageKit
SELESAI 🎉
```

> Aman dijalankan berulang — yang sudah pernah masuk otomatis dilewati.
> Data lokalmu **tidak dihapus** (jadi cadangan).

Punya logbook lama berbentuk **dokumen Word**? Nanti setelah online, buka menu
**Ekspor → Impor dari Word (.docx)** di aplikasi — entri & foto diambil otomatis.

---

## Bagian 6 — Deploy ke Vercel

### Cara A — lewat dashboard (disarankan, `git push` = otomatis deploy)

1. Buka **https://vercel.com/signup** → **Continue with GitHub** → izinkan.
2. Di dashboard klik **Add New… → Project** → pilih **fork `logbook-app`-mu** → **Import**.
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
   selamanya; URL tidak pernah berubah. Setiap `git push` ke fork-mu otomatis
   men-deploy versi terbaru.

### Cara B — lewat Vercel CLI (tanpa fork/dashboard)

```powershell
npx vercel login          # login sekali (browser terbuka)
npx vercel                # buat proyek + deploy preview
npx vercel env add DATABASE_URL           # ulangi untuk 4 variabel lainnya
npm run deploy            # deploy produksi
```

> Dengan cara B, `git push` **tidak** otomatis deploy — tiap update jalankan
> `npm run deploy` lagi. Bisa disambungkan belakangan: Vercel → proyekmu →
> **Settings → Git → Connect Git Repository** → pilih **GitHub** → izinkan akses
> ke repo `logbook-app` (repo privat perlu tombol *Configure GitHub App*).

### Pemeriksaan sebelum push / redeploy

Jalankan dari root proyek:

1. `npm ci` — instal persis dari `package-lock.json`; Vercel memakai perintah yang sama. Commit manifest dan lockfile yang berubah bersama-sama.
2. `npm run test:pradeploy` — tes dependensi, CSP ImageKit, cache service worker, konfigurasi Vercel, sintaks serta UI panel. Tidak membutuhkan `.env` atau database.
3. `npm run build` — pastikan ekspor statis `frontend/out` berhasil. Hasil build dan `node_modules` tidak perlu masuk repo.
4. Untuk regresi tampilan, jalankan frontend pada port 3100 di terminal terpisah lalu `npm run audit:desain`. Lihat `AUDIT-DESAIN.md` untuk cakupan dan opsi.
5. Periksa `git status --short` dan `git diff --check` sebelum commit. Jangan menambahkan `.env`, unggahan, database lokal, atau artefak pengujian. Sertakan berkas sumber dan tes baru yang belum terlacak.

**Paket Vercel CLI berbeda dari commit Git.** Pertahankan `.vercelignore`: berkas ini mengecualikan `.env` di semua folder, data/unggahan lokal, artefak, hasil build lama, dan dokumen pribadi dari upload CLI. `.gitignore` saja tidak cukup. Rahasia produksi tetap diatur melalui Environment Variables Vercel, bukan berkas lokal. Template runtime di `backend/src/assets/` dan skrip penyiapan ekspor tetap harus ikut.

Untuk mengaudit **hasil build produksi**, setelah `npm run build` jalankan `node tools/serve-audit.mjs` di terminal terpisah. Kemudian di PowerShell jalankan `$env:AUDIT_URL='http://127.0.0.1:3101'; npm run audit:desain`. Hapus pengaturan ini setelah selesai dengan `Remove-Item Env:AUDIT_URL`. Server tersebut hanya melayani berkas statis di localhost; API tetap ditiru oleh skrip audit, bukan tersambung ke database. Folder ekspor alternatif dapat diberikan sebagai argumen `serve-audit.mjs`.

`npm run test:pradeploy` sengaja **tidak** menjalankan seluruh `backend/diag-*.mjs`: sejumlah diagnostik integrasi membuat akun, mengubah pengaturan, atau menulis ke database. Jalankan tes integrasi tersebut hanya pada lingkungan uji terpisah, bukan database produksi.

Service worker hanya menyimpan kerangka frontend yang dikenal, tidak menangani panel admin/API/health, dan menghormati respons `private`/`no-store`. Versi baru membersihkan cache Logbook lama tanpa menghapus cache aplikasi lain. Header Vercel untuk `/sw.js` meminta validasi ulang setelah redeploy.

CSP server mengizinkan koneksi ke API upload dan CDN ImageKit. Untuk CDN kustom, isi `IMAGEKIT_URL_ENDPOINT` dengan URL HTTPS; server mengambil origin-nya saja. Tes lokal tidak menggantikan pengecekan unggah/unduh nyata pada deployment preview. Halaman statis yang dilayani langsung CDN Vercel tidak melewati middleware header Express.

### Update aplikasi di kemudian hari

```powershell
git add . ; git commit -m "perubahan" ; git push   # simpan kode (cara A: otomatis deploy)
npm run deploy                                      # hanya perlu untuk cara B
npm run cek:online https://URL-KAMU.vercel.app      # pastikan versi online = commit terakhir
```

`npm run deploy` = `npx vercel --prod --yes` (butuh login sekali: `npx vercel login`).

`npm run cek:online` membandingkan commit yang **sedang online** (dibaca dari
`/health`) dengan commit terakhir di laptop, lalu menguji halaman & pagar peran.
Alamatnya bisa diisi lewat argumen seperti di atas, atau disimpan sekali di
variabel lingkungan `LOGBOOK_URL`. Contoh keluaran sehat:
```
commit live : f4ceeec
commit lokal: f4ceeec
status      : ✅ ONLINE = commit terakhir
```

Ingin ikut menerima perbaikan terbaru dari repo asal? Di fork-mu klik
**Sync fork** di GitHub, lalu `git pull` dan deploy ulang.

---

## Bagian 7 — Uji coba (checklist 5 menit)

Buka URL vercel.app-mu, lalu centang satu per satu:

- [ ] Halaman login terbuka
- [ ] **Daftar akun tim baru** di tab ✨ Daftar → login berhasil
- [ ] Dashboard terbuka; isi **Dana awal** di menu Keuangan
- [ ] **Tambah kegiatan baru + foto** dari HP → tersimpan & tampil
- [ ] **Ekspor DOCX / PDF / Excel** → berkas terunduh dengan nama khas akunmu
      (mis. `Logbook Tim Alpha - Kegiatan & Keuangan (04-08-2026).docx`),
      foto ikut di dalamnya
- [ ] `https://URL-kamu/docs` → **404** (benar: dokumentasi API sengaja ditutup di
      produksi agar daftar endpoint tidak bisa ditelusuri; buka lewat
      `http://localhost:4000/docs` saat menjalankan aplikasi di komputer sendiri)
- [ ] panel admin: `https://URL-kamu/pusat-kendali` — kredensialnya dibuat acak
      saat aplikasi pertama jalan dan **dicetak sekali ke log**: buka proyek di
      Vercel → tab **Logs** → cari baris `[keamanan]` (simpan pribadi). Alamat
      panel bisa diganti dengan `node tools/superuser.mjs --path /alamat-baru`
- [ ] Kartu **🎓 Kode pendaftaran fasilitator** & **👨‍🏫 Kode pendaftaran dosen
      pendamping** di panel → setel kodenya
- [ ] Kartu **👥 Pendaftaran akun Tim** di halaman Pengaturan panel — tutup
      setelah semua tim terdaftar (akun baru tetap bisa dibuat dari panel)
- [ ] Daftar akun pendamping memakai kode itu → hubungkan ke tim: **Profil tim →
      Kode tim** disalin & dikirim, lalu pendamping memasukkannya di Dashboard
      (atau tetapkan lewat tombol **🔗 Tim** di panel admin)
- [ ] Login sebagai pendamping → data tim tampil (read-only), komentar terkirim;
      akun dosen bisa **ACC / minta revisi** sebuah entri

---

## Bagian 7b — Peran pendamping setelah deploy

Aplikasi punya tiga peran: **👥 Tim** (default), **🎓 Fasilitator**, dan
**👨‍🏫 Dosen Pendamping**. Yang perlu disiapkan admin sekali saja:

1. Buka panel admin → setel **kode pendaftaran** untuk fasilitator dan dosen
   (dua kode berbeda, disimpan sebagai hash scrypt di tabel `meta`).
   Selama kode belum diset, pendaftaran peran itu ditolak (403).
2. Bagikan kode ke pendamping → mereka daftar di tab **✨ Daftar** dengan
   memilih perannya.
3. **Menghubungkan ke tim — dua cara:**
   - **Mandiri (disarankan):** tim membuka **Profil → Kode tim**, menyalin
     kodenya (mis. `ABCD-2345`), lalu mengirimkannya ke pendamping. Pendamping
     memasukkannya di **Dashboard → Gabung ke tim dengan kode**. Tim bisa
     mencetak ulang kode atau mengeluarkan pendamping kapan saja.
   - **Oleh admin:** tombol **🔗 Tim** di panel admin (multi-pilih —
     satu pendamping boleh banyak tim, satu tim boleh banyak pendamping).
4. Perubahan peran/penugasan terasa maksimal **±30 detik** (cache sesi).

> 🔒 Semua endpoint tulis milik tim dipagari di server (`403` untuk pendamping),
> dan tiap permintaan pendamping dicek terhadap daftar tim yang ditugaskan —
> keamanan tidak bergantung pada tampilan frontend.
>
> 🗄️ Seluruh tabel & kolom (termasuk `fasilitator_tim`, `komentar`,
> `komentar_baca`, `persetujuan`) dibuat otomatis saat server jalan —
> **tidak ada langkah migrasi manual**.

---

## Bagian 8 — Hal yang perlu diketahui

**Kredensial panel admin.** Dibuat acak otomatis saat aplikasi pertama jalan
dan **dicetak sekali ke log**: buka proyek di Vercel → tab **Logs** → cari
baris `[keamanan]`. Alamat panel bawaan `/pusat-kendali` (bisa diganti lewat
`node tools/superuser.mjs --path /alamat-baru`). Lupa password panel? Jalankan
di laptop (butuh `.env`): `node tools/superuser.mjs -u namabaru -p sandibaru`.

**Batas ukuran upload ±4 MB per request** (batas platform Vercel) hanya
berlaku untuk jalur yang melewati server — foto kegiatan/nota (dikompres
klien ±300 KB) aman. Laporan `.docx`, presentasi `.pptx`, **dan impor logbook
`.docx`** dikirim browser **langsung ke ImageKit** (maks. 300 MB), jadi tidak
terkena batas ini. `tools/impor-logbook.mjs` tetap tersedia bila ingin
mengimpor dari laptop tanpa browser.

**Alamat tautan penampil Office.** Aplikasi memakai domain produksi Vercel
secara otomatis. Bila memakai domain kustom, isi env `APP_ORIGIN`
(mis. `https://logbook.kampus.ac.id`) di Vercel agar tautan yang diberikan ke
penampil Microsoft mengarah ke domain tersebut.

**"Tidur" singkat.** Bila tak ada pengunjung ±5 menit, database Neon ikut
tidur; request pertama berikutnya butuh ±1–3 detik ekstra. Normal untuk
paket gratis, request berikutnya cepat lagi.

**Mode lokal masih bisa** (untuk pengembangan): `.\start.ps1` menjalankan
aplikasi di `http://localhost:4000` — data tetap dibaca/ditulis ke Neon &
ImageKit (butuh internet + `.env`).

**Cadangan data.** Neon punya fitur *point-in-time restore* di dashboard-nya;
foto & dokumen tersimpan permanen di ImageKit.

**Kuota gratis.** Perkiraan pemakaian logbook (beberapa pengguna, ratusan
entri): Neon terpakai <1%, ImageKit <1%, Vercel <5%/bulan. Sangat longgar.

## ❓ Gangguan umum

| Gejala | Penyebab & solusi |
|---|---|
| Build Vercel gagal: `DATABASE_URL belum diisi` | Env vars belum ditambahkan di proyek Vercel (Bagian 6 langkah 4), lalu **Redeploy** |
| Login gagal padahal password benar | `DATABASE_URL` di Vercel beda dengan yang dipakai saat daftar/migrasi |
| Foto tidak muncul | Kunci ImageKit salah/belum diisi di env Vercel → perbaiki lalu **Redeploy** |
| Foto tampil sebentar lalu rusak setelah 1 jam | Normal — signed URL kedaluwarsa; aplikasi otomatis minta URL baru saat halaman dimuat ulang |
| `Upload ke ImageKit gagal (401)` | `IMAGEKIT_PRIVATE_KEY` salah/tertukar dengan public key |
| Ekspor PDF timeout | Entri berfoto sangat banyak; coba lagi (cache CDN membantu) — batas fungsi 60 detik |

