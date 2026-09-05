# Audit desain dan responsivitas Logbook

Tanggal: 5 September 2026.

## Cakupan dan metode

Audit kode serta pengujian browser Chromium pada frontend dan HTML Pusat Kendali. Pengujian memakai **data tiruan**, nama tim/nama berkas panjang tanpa spasi, nominal jutaan rupiah, enam kegiatan, enam transaksi, foto SVG tiruan, dan DOCX minimal yang dibuat di memori. Tidak memakai kredensial asli, tidak menjalankan backend database, tidak mengunggah atau menghapus data pengguna.

Ukuran viewport (CSS px): **320×740, 375×812, 430×932, 640×800, 768×1024, 900×700, 1024×600, 1440×900, 1920×1080, 844×390**. Frontend diperiksa dalam tema terang/gelap dan peran tim, fasilitator, serta dosen pada rute yang sesuai. Admin memakai tema gelap bawaannya.

### Inventaris tampilan

| Area | Yang diperiksa |
|---|---|
| Login dan pendaftaran | Kartu login, input, pilihan daftar, nama aksesibel, layout mobile |
| Dashboard tim | Metrik, grafik, heatmap, dana, timeline, rekap ACC, teks panjang |
| Dashboard fasilitator/dosen | Ringkasan tim, metrik, dokumen, pergantian/tambah tim |
| Kegiatan | Filter, tanggal, kartu entri, foto, dialog tambah, komentar dan revisi |
| Keuangan | Filter sumber, mode kartu/tabel, angka, rekap, dialog tambah dan sumber dana |
| Laporan | Unggah, nama berkas panjang, toolbar, renderer DOCX lokal, komentar/ACC |
| Presentasi | Unggah PPTX, input Canva, nama berkas panjang, pesan keterbatasan penampil lokal |
| Galeri | Grid gambar, tombol foto, keyboard Spasi/Tab/Escape, pengembalian fokus |
| Ekspor/impor | Kartu format ekspor, unggah DOCX, tata letak kontrol |
| Profil | Identitas panjang, form akun, kode tim, daftar perangkat, riwayat |
| Kerangka aplikasi | Sidebar normal/mini, layar pendek, topbar, menu akun, navigasi bawah, menu Lainnya |
| AI | Panel percakapan, pemilih model, kontrol input, tata letak mobile |
| Pusat Kendali | Login, ringkasan, akun, sesi, audit, pengaturan; tujuh dialog pada tiga ukuran |
| Kondisi alternatif | Data kosong dan API gagal untuk dashboard, kegiatan, keuangan, galeri, laporan, presentasi |

## Temuan dan perbaikan

| Prioritas | Temuan | Perbaikan |
|---|---|---|
| Tinggi | Tujuh tujuan navigasi mobile dipaksa dalam satu baris dengan label kecil | Maksimal lima tombol; tim memakai empat tujuan utama + **Lainnya** berisi Presentasi, Galeri, Ekspor. Semua fitur tetap tersedia |
| Tinggi | Nama tim panjang pada paragraf dashboard pendamping melampaui viewport 320 px | Pembungkusan teks bebas pada container; aturan angka/tabel tetap dipertahankan |
| Tinggi | Kolom form dan grid dapat mengikuti lebar intrinsik input/isi | `minmax(0, …)`, `min-width: 0`, batas lebar kontrol; form satu kolom pada ≤400 px |
| Tinggi | Popup sumber dana terikat pada wadah tabel yang dapat memotongnya | Diganti dialog native di top layer, dengan tombol Tutup, fokus bawaan, Escape, serta scrolling |
| Tinggi | Tab lightbox memasukkan tombol panah yang disembunyikan di mobile | Hanya kontrol terlihat dan aktif yang masuk putaran fokus; diuji kembali ke pemicu galeri |
| Sedang | Galeri memakai div yang hanya mendukung Enter | Tombol native mendukung Enter dan Spasi, disertai nama aksesibel |
| Sedang | Sidebar tidak mengalokasikan area gulir saat layar pendek | Menu dapat digulir; bagian akun dan merek tetap tersedia. Berlaku juga pada admin |
| Sedang | Aturan CSS terakhir menimpa padding safe area dialog | Padding bawah dialog dipulihkan, tinggi dinamis viewport, serta penyesuaian inset atas/kiri/kanan |
| Sedang | Konten terakhir terlalu dekat dengan FAB/AI/navigasi tetap | Ruang bawah konten diperbesar supaya dapat digulir melewati kontrol mengambang |
| Sedang | Kontrol kecil dan font input khusus menimpa ukuran mobile | Sasaran sentuh utama minimal 44 px; input/select tertentu 16 px pada pointer coarse |
| Sedang | Filter sumber terlalu rapat pada layar kecil | Kelompok filter boleh membungkus; sumber dana dua kolom pada ≤400 px |
| Sedang | Indigo gelap dipakai sebagai teks pada kartu gelap | Teks aksen penting diperterang, tanpa mengganti gradien tombol berteks putih |
| Sedang | Input unggah laporan, PPTX, Canva, dan impor Word belum punya nama aksesibel | Dihubungkan ke judul terlihat melalui `aria-labelledby` |
| Sedang | Input/tombol komentar tertentu belum memiliki label | Label edit/simpan/batal/kirim ditambahkan; baris edit boleh membungkus |
| Sedang | Dialog kegiatan dan belanja hanya memiliki aksi bawah | Nama dialog aksesibel dan tombol Tutup di kepala ditambahkan |
| Rendah | Status navigasi dan tombol akun kurang jelas bagi pembaca layar | `aria-current`, nama tombol akun, label navigasi desktop, serta target skip-link yang dapat difokus |
| Rendah | Pengurangan animasi belum menghentikan smooth scrolling | `scroll-behavior: auto` ketika reduced motion aktif |
| Sedang | Input revisi dan tombol batal belum memiliki nama aksesibel; input sempit di ponsel | Label ditambahkan dan baris revisi boleh membungkus dengan lebar input yang memadai |
| Sedang | Navigasi admin mini bergantung pada label CSS | Lima tautan diberi `aria-label`, satu halaman aktif ditandai `aria-current="page"` |
| Sedang | Menu akun dan tim belum konsisten saat dioperasikan lewat keyboard | Hook bersama mendukung panah atas/bawah, Home/End, Escape dan pengembalian fokus; menu menutup saat fokus/pointer keluar, termasuk setelah konten selesai dimuat |
| Sedang | Nama tim panjang mendorong chip peran dosen keluar pada viewport 1024×600 | Tombol chip tim dapat menyusut dengan `min-width: 0`; judul mobile memakai heading yang dapat membungkus |
| Sedang | Dropdown dengan banyak tim berisiko terpotong pada layar pendek | Lebar dan tinggi dibatasi viewport, daftar dapat digulir; diuji dengan 24 tim pada 320×740, 844×390, dan 1280×500 |
| Sedang | Fokus panel AI dan Enter saat komposisi IME belum ditangani konsisten | Fokus masuk saat dibuka dan kembali ke pemicu saat ditutup dari panel; Escape dibatasi ke panel/pemicu, Enter IME tidak mengirim, jawaban asinkron tidak merebut fokus di luar panel |
| Rendah | Percakapan AI belum memiliki semantik log aksesibel | `role="log"`, nama percakapan, pengumuman sopan, serta status sibuk ditambahkan; panel tetap nonmodal tanpa jebakan fokus |

### Kontras yang diukur

Perhitungan luminansi relatif sRGB untuk pasangan warna solid:

- Indigo lama `#4f46e5` pada `#171a33`: **2,71:1**.
- Aksen teks baru `#a5b4fc` pada latar yang sama: **8,55:1**.
- Ungu lama `#7c3aed`: **2,99:1**; ungu teks baru `#c4b5fd`: **9,23:1** pada latar yang sama.

Angka ini bukan sertifikasi seluruh kombinasi warna aplikasi. Gradien, transparansi, hover, serta teks inline lainnya memerlukan pemeriksaan kontras tersendiri.

### Perbaikan tambahan sebelum push / redeploy

- **CSP ImageKit:** `connect-src` server sebelumnya hanya mengizinkan origin sendiri, sehingga unggah langsung dan pengambilan bagian dokumen dari CDN dapat terblokir. Kebijakan dipindahkan ke `backend/src/security-headers.js`, mengizinkan API upload/CDN ImageKit secara terbatas, serta origin CDN kustom HTTPS tanpa kredensial dari `IMAGEKIT_URL_ENDPOINT`. Tidak membuka izin ke semua domain HTTPS.
- **Cache offline:** service worker versi 2 hanya menangani navigasi ke halaman frontend yang dikenal, bukan panel admin (termasuk alamat kustom), API, health, atau docs. Respons navigasi privat, `no-store`, non-HTML, redirect, dan galat tidak disimpan. Bila jaringan dan cache sama-sama tidak tersedia, tersedia respons 503 yang jelas.
- **Pembersihan cache:** aktivasi service worker hanya menghapus cache Logbook versi lama, bukan cache aplikasi lain pada origin yang sama.
- **Deployment terkunci:** Vercel memakai `npm ci`, dan `/sw.js` mendapat `Cache-Control: no-cache` agar pembaruan segera divalidasi ulang.
- **Pengujian dapat diulang:** `npm run test:pradeploy` menjalankan tes terisolasi tanpa database. `tools/serve-audit.mjs` melayani hasil ekspor pada localhost dengan pemetaan URL tanpa `.html`, termasuk ketika Next membuat folder dan berkas `.html` bernama sama. Server ini hanya untuk audit, bukan pengganti backend aplikasi.

Validasi pradeploy pada Node.js **22.18.0**, npm **10.9.3**:

- `npm ci` dan `npm run build` **berhasil dari salinan sementara bersih**, tanpa `.env` atau `node_modules` lama.
- **12 tes pradeploy lulus, 0 gagal**, termasuk dependensi, header CSP melalui Helmet, logika service worker dengan cache/jaringan tiruan, dan konfigurasi Vercel. Tes diulang pada dependensi hasil instalasi bersih.
- Validasi sintaks/struktur panel berhasil; **32 diagnostik UI admin lulus, 0 gagal**, juga pada salinan bersih.
- Pemeriksaan sintaks **43 berkas sumber backend/API** berhasil tanpa menjalankan server atau database.
- Audit dependensi root dan frontend terpisah kembali menghasilkan **0 kerentanan terdeteksi**, exit code 0. Peringatan deprecation dependensi transitif masih berasal dari upstream; bukan kegagalan instalasi/build dan tidak diperbaiki dengan override versi mayor secara sembarang.
- Git hanya melacak `.env.example`, bukan `.env`; tidak ada penghapusan kredensial atau perubahan data pengguna yang dilakukan.

Log validasi berada di `artifacts/audit-desain/clean-install.*`, `clean-build.*`, `clean-tests.*`, serta `security-*-pradeploy.*` / `security-pradeploy.*`. Instalasi bersih bukan simulasi penuh lingkungan serverless Vercel: bundling fungsi, variabel lingkungan produksi, dan layanan cloud nyata tetap perlu diperiksa pada deployment preview.

## Pengujian

Validasi sebelumnya pada 5 September 2026 (hasil audit penuh pada ekspor produksi dari instalasi bersih: `2026-09-05T11:26:03.057Z`):

- **521 skenario tata letak/interaksi selesai; 0 overflow horizontal halaman dan 0 error runtime yang terdeteksi; exit code 0.**
- Pemeriksaan singkat setelah perbaikan chip tim juga berhasil: **103 skenario, exit code 0**.
- Semua permintaan API dalam tes memiliki fixture; tidak ada endpoint tak dikenal pada hasil akhir. Endpoint tak dikenal kini membuat proses pengujian gagal.
- **Build produksi Next.js berhasil**, termasuk ekspor halaman statis.
- **32 diagnostik UI admin lulus, 0 gagal.**
- Pemeriksaan sintaks skrip dan `git diff --check` berhasil.

Hasil mentah berada di `artifacts/audit-desain/hasil.json`; tangkapan layar terpilih berada di direktori yang sama. Artefak diabaikan Git dan dapat dibuat ulang. Hasil ini berlaku untuk cakupan dan fixture di atas, bukan jaminan bebas masalah pada semua perangkat atau seluruh kemungkinan data.

Pengujian otomatis memeriksa batas horizontal elemen, lebar dokumen, kesiapan konten terisi, error JavaScript, dan beberapa interaksi keyboard. Tabel/heatmap yang sengaja dapat digulir horizontal **tidak** dianggap sebagai overflow halaman.

Regresi tambahan memeriksa tepat satu heading topbar terlihat, menu akun mobile/sidebar mini, navigasi dan pengembalian fokus menu 24 tim, fokus awal panel AI, Enter selama komposisi IME, Escape dari luar panel, serta fokus di luar panel yang tetap terjaga ketika jawaban AI tiba. Log dan kode keluar validasi lanjutan disimpan sebagai `full-lanjutan.*`, `quick-lanjutan.*`, `build-lanjutan.*`, dan `admin-lanjutan.*` di direktori artefak yang sama.

Audit produksi awal memakai `tools/serve-audit.mjs` pada `127.0.0.1:3101`, dengan API tetap ditiru. Log serta exit code 0 tersimpan di `static-pradeploy-final.log` dan `static-pradeploy-final.exit`. Percobaan awal dengan server statis sederhana sempat berhenti karena pemetaan URL tanpa `.html` tidak menangani folder Next bernama sama; server uji telah diperbaiki dan matriks penuh diulang hingga selesai.

### Perbaikan nav dan mobile berdasarkan tangkapan layar

- **Skeleton isi tetap dipertahankan**, termasuk pada Dashboard, Kegiatan, Keuangan, Laporan, dan Presentasi. Percobaan menghapus skeleton/animasi isi sebelumnya dibatalkan sesuai klarifikasi pengguna; yang distabilkan adalah navigasinya.
- **Nav desktop:** pergeseran hover dan transisi menyeluruh pada tautan sidebar dihapus. Gaya nav mobile dikembalikan seperti sebelumnya sesuai klarifikasi pengguna bahwa mobile sudah aman; penanda aktif dan fokus keyboard tetap ada.
- **Pertanyaan AI satu baris:** memakai input teks native dengan placeholder singkat, tinggi 44 px, tombol kirim sejajar, dan `enterKeyHint="send"`. Enter selama komposisi IME tidak mengirim; teks panjang tetap satu baris tanpa scrollbar vertikal.
- **Formulir entri mobile:** kolom tanggal/harga/capaian/kode unik cukup lebar, jam–menit dan satuan–jumlah berpasangan, keyboard desimal untuk angka, textarea deskripsi tetap multiline, serta area isi yang dapat digulir dengan aksi Simpan/Batal mudah dijangkau. Kontrol saran AI dan unggahan ditata ulang.
- **Bar dana:** gradien dasar tetap diam; hanya lapisan garis yang bergerak. Tile 28×28 px bergeser tepat 28 px tiap siklus, dengan mask lembut di ujung membulat agar sambungannya tidak kentara. Efek sama diterapkan pada bar komposisi pengeluaran; pada mobile label/nominal berada di atas bar selebar kartu. Angka dan proporsi dana tidak diubah. Reduced motion tetap dihormati.
- **Galeri:** identitas React memakai jenis entri + id entri + posisi lampiran, sehingga gambar yang sama pada kegiatan dan bukti belanja tidak menghasilkan key ganda.
- Indikator pengembangan Next.js dinonaktifkan agar tidak menutupi tombol Beranda pada pengujian mobile lokal.

Regresi baru berada di `tools/audit-navigasi.mjs` dan `tools/audit-mobile.mjs`, dipanggil otomatis oleh audit utama. Navigasi diuji melalui klik menu (termasuk Lainnya dan Profil), sidebar lebar/mini, serta Back/Forward dengan animasi sistem aktif. Setiap frame memeriksa identitas/posisi/opacity/latar nav, transform tombol, tema, dan keberlangsungan dokumen; pemeriksaan tanpa animasi tombol berlaku untuk **desktop**, sedangkan **skeleton isi bukan kegagalan**. Animasi toggle sidebar diselesaikan sebelum mengambil baseline navigasi. Kasus jaringan lambat menahan API sampai skeleton terlihat, lalu memastikan isi muncul setelah respons dilepas. Form, input AI panjang, animasi bar, reduced motion, dan screenshot diperiksa pada ukuran mobile potret/landscape.

Tes terarah awal berhasil: **14 skenario navigasi/skeleton** dan **4 skenario mobile**, masing-masing exit code 0. Build produksi dan rangkaian pradeploy juga berhasil (12 tes serta 32 diagnostik UI admin). Log tersedia sebagai `nav-polish-quick2.*`, `mobile-polish-quick2.*`, `mobile-polish-build.*`, dan `mobile-polish-pradeploy.*`. Hasil matriks lengkap disimpan di `mobile-polish-full.*` dan `hasil.json`.

### Navigasi produksi dan pengetahuan PKM

- Ditemukan **404 segmen RSC**: klien meminta `kegiatan/__next.kegiatan.__PAGE__.txt`, sedangkan exporter menulis `kegiatan/__next.kegiatan/__PAGE__.txt`. `tools/prepare-static-export.mjs` kini dipanggil otomatis setelah build untuk menerbitkan alias berisi byte yang sama. Alias yang bertabrakan dengan data berbeda ditolak. Ini berlaku pada CDN Vercel maupun server statis lokal, tanpa mengubah routing API. Build terakhir menghasilkan sembilan alias; URL yang sebelumnya 404 telah diuji membalas 200.
- Pengetahuan PKM berasal dari ringkasan dokumen resmi **2022–2026** dengan pemilihan tahun/skema dan referensi halaman. Bukan pelatihan ulang model atau klaim menguasai seluruh juknis. Rincian sumber, cakupan, keterbatasan, serta cara pembaruan berada di `docs/AI-PKM.md`.
- Profil PKM per tim dapat dikonfirmasi pemilik akun tim. Pendamping dapat memilih semua tim yang ditugaskan untuk memeriksa profil; akses tim lain tetap ditolak. Indikasi kode di catatan tidak dianggap verifikasi surat pendanaan. Nama tim saja tidak dipakai untuk menetapkan skema.
- Prompt membedakan persentase **Belmawa diterima** pada statistik aplikasi dengan **jumlah dana diusulkan** pada tabel RAB resmi. AI tidak boleh memvonis pelanggaran hanya dari statistik tanpa basis RAB yang tepat.
- Verifikasi terarah terbaru: **27 skenario desktop/skeleton lulus**, **28 tes pradeploy lulus**, dan **32 diagnostik UI admin lulus**. Tes PKM juga memastikan pertanyaan tahun di luar korpus tidak diam-diam memakai aturan 2026. Log pradeploy terakhir: `pkm-pradeploy-complete.*`.
- Temuan tambahan pada formulir landscape: tombol Simpan sebelumnya 38 px pada viewport di atas 640 px. Seluruh tombol dialog entri kini minimal 44 px; **32 skenario mobile lengkap lulus** setelah perbaikan. Build akhir berhasil beserta sembilan alias RSC. Log: `pkm-complete-build.*`, `pkm-mobile-complete.*`; matriks akhir memakai `pkm-complete-full.*`.

### Hasil akhir perbaikan desktop, mobile, dan AI PKM

Audit penuh selesai pada **5 September 2026, `2026-09-05T13:04:55.724Z`**:

- **836 skenario lulus, exit code 0**, tanpa overflow halaman atau error runtime yang terdeteksi pada cakupan fixture.
- Termasuk **280 perpindahan menu** pada tiga peran dan dua tema; **140 di desktop** (sidebar lebar/mini) dengan **0 kedipan nav terukur**. **0 reload dokumen** pada keseluruhan perpindahan menu dan **0 endpoint API tanpa fixture**.
- Skeleton jaringan lambat terverifikasi untuk tim, fasilitator dan dosen. Animasi isi dan perilaku nav mobile tetap dipertahankan.
- **32 skenario formulir/AI/bar mobile** tercakup dalam matriks akhir, termasuk landscape.
- **28 tes pradeploy**, **32 diagnostik UI admin**, dan build produksi berhasil.

Hasil akhir tersimpan di `artifacts/audit-desain/hasil.json`, `pkm-complete-full.log`, `pkm-complete-full.exit`, serta `hasil-final-ringkas.json`. Angka ini menggantikan hasil percobaan yang berhenti pada 404 segmen, pengukuran sidebar saat toggle, atau tombol landscape 38 px.

Pengujian pengetahuan PKM menggunakan model/store tiruan: **kualitas dan kecepatan jawaban model Ollama nyata belum dibenchmark**, dan skema tim nyata tidak dinyatakan terverifikasi hanya dari nama/catatan. Konfirmasi per tim mengikuti proposal/surat pendanaan melalui Profil PKM. Perubahan lanjutan ini belum di-commit, di-push atau di-redeploy pada saat laporan diperbarui.

### Menjalankan ulang

1. Pasang dependensi melalui `npm ci`, lalu browser melalui `npx playwright install chromium`.
2. Jalankan frontend lokal: `npm run dev --workspace frontend -- --port 3100`.
3. Di terminal terpisah jalankan `npm run audit:desain` dari root proyek.
4. Opsional di PowerShell: set `$env:AUDIT_SCREENSHOTS='1'` untuk menyimpan screenshot terpilih atau `$env:AUDIT_QUICK='1'` untuk pemeriksaan singkat.
5. Jalankan `npm run build --workspace frontend` dan `npm run diag:panel-ui --workspace backend` untuk validasi build serta diagnostik admin.
6. Jalankan `node --test tools/test-dependensi.mjs` untuk memeriksa XLSX/UUID, parser Express, dan pengolahan gambar Sharp tanpa database.

Untuk menguji hasil produksi, jalankan `npm run build`, lalu `node tools/serve-audit.mjs` di terminal terpisah. Pada terminal audit PowerShell, set `$env:AUDIT_URL='http://127.0.0.1:3101'` sebelum `npm run audit:desain`, lalu hapus dengan `Remove-Item Env:AUDIT_URL` setelah selesai. Seluruh rangkaian tes pradeploy terisolasi dapat diulang dengan `npm run test:pradeploy`.

`AUDIT_URL` dapat mengganti alamat server, tetapi skrip menolak hostname selain localhost/127.0.0.1. Seluruh permintaan API browser ditiru, termasuk jika frontend memiliki NEXT_PUBLIC_API_URL terkonfigurasi.

Untuk uji terarah, gunakan `$env:AUDIT_NAV_ONLY='1'` (nav + skeleton) atau `$env:AUDIT_MOBILE_ONLY='1'` (form + AI + bar), bukan keduanya. Hapus variabel mode tersebut sebelum menjalankan matriks penuh.

## Batas hasil dan tindak lanjut

- Tidak ada klaim identik piksel dengan referensi JPG. Identitas warna, kartu, sidebar, dan layout yang ada dipertahankan; fokus pada masalah konkret dan konsistensi.
- Screenshot dihasilkan untuk pemeriksaan ulang, bukan pembandingan visual otomatis terhadap gambar baseline.
- Pengujian utama Chromium dengan emulasi ukuran/touch; **Safari/iOS, Firefox, keyboard virtual perangkat fisik, screen reader, dan zoom browser 200% belum diuji langsung**. Pengujian viewport sempit tidak sama dengan pengujian zoom 200%.
- Office/Canva eksternal ditiru untuk menghindari akses layanan nyata. Akurasi seluruh dokumen PPTX/DOCX pengguna, unggah, unduh, dan integrasi backend bukan bagian dari tes tata letak ini.
- Tujuh dialog admin diuji secara struktural dengan `showModal`; ini tidak memverifikasi seluruh aksi pengelolaan akun di dalamnya.
- Error/empty states serta skeleton dengan API yang ditahan telah diuji. Ini bukan emulasi penuh jaringan seluler, keyboard virtual perangkat fisik, atau seluruh transisi aplikasi.
- CSS masih memiliki beberapa lapisan override lama. Refaktor menyeluruh perlu dilakukan bertahap agar tidak merusak halaman yang memakai aturan bersama.
- Temuan dependency awal **12 kerentanan (5 moderate, 7 high)** sudah ditindaklanjuti. Setelah pembaruan dan instalasi bersih `npm ci`, **npm audit workspace dan frontend terpisah melaporkan 0 kerentanan terdeteksi**. Tidak menggunakan `npm audit fix --force` atau menurunkan ExcelJS. Override `qs@6.16.0` dan `exceljs → uuid@11.1.1` dipakai untuk dependensi transitif; tinjau ulang saat upstream memperbarui dependensinya. Next.js terkunci pada 16.3.4 dan Express pada 4.22.2. Status audit bukan jaminan tidak adanya kerentanan yang belum diketahui.
- Root Turbopack ditetapkan eksplisit lewat `import.meta.url`, dan lockfile frontend terpisah ikut diperbarui. Dua lockfile tetap dipertahankan, tanpa peringatan root ambigu pada konfigurasi baru.
- Peringatan IDE tentang `/login-scene.svg` merupakan resolusi path editor; aset berada di `frontend/public/login-scene.svg`. Fallback `vh` lalu `dvh` memang disengaja.
- Pengujian service worker memakai VM dengan cache/jaringan tiruan; siklus pembaruan PWA pada perangkat fisik belum diuji. Header Express tidak otomatis berlaku pada halaman statis yang dilayani langsung CDN Vercel.
