# 📒 Logbook Kegiatan & Keuangan

Aplikasi web untuk **mencatat, memantau, dan melaporkan** perjalanan sebuah tim
proyek — mulai dari kegiatan harian, pengeluaran dana, laporan kemajuan, sampai
materi presentasi — dalam satu tempat yang rapi dan dapat diakses bersama
pembimbing.

Dibuat untuk kebutuhan nyata tim program kemahasiswaan (PKM, proyek penelitian,
tugas besar, program pendampingan): setiap catatan harus lengkap dengan **foto
bukti**, **rekap dana**, dan **pengesahan dosen** — lalu pada akhirnya harus
bisa dicetak menjadi dokumen laporan.

> ⚡ **Ingin langsung memakainya?** *Fork* repo ini, lalu ikuti
> **[DEPLOY.md](DEPLOY.md)** — ±30 menit sampai aplikasi hidup di alamat tetap
> `https://nama-kamu.vercel.app`, gratis dan tanpa kartu kredit.

---

## 📌 Daftar isi

- [Apa yang bisa dilakukan aplikasi ini](#-apa-yang-bisa-dilakukan-aplikasi-ini)
- [Siapa saja penggunanya](#-siapa-saja-penggunanya)
- [Cara memakai — panduan pengguna](#-cara-memakai--panduan-pengguna)
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

## ✨ Apa yang bisa dilakukan aplikasi ini

| Fitur | Penjelasan |
|---|---|
| 🗓️ **Catatan kegiatan** | Tanggal, uraian kegiatan, durasi, tambahan capaian (%), dan beberapa foto sekaligus. Otomatis dikelompokkan per bulan. |
| 💰 **Catatan keuangan** | Item belanja, harga satuan, jumlah, total otomatis, plus foto nota/bukti. Ada subtotal per bulan, filter bulan &amp; sumber dana. |
| 🏦 **Sumber dana &amp; rekap PKM** | Tandai tiap belanja berasal dari **Belmawa** (dengan kategori PKM: bahan habis pakai 60%, sewa &amp; jasa 15%, transportasi 30%, lain-lain 15%) atau **Perguruan Tinggi** (batas umum Rp2 juta). Semuanya **opsional** — entri tanpa penanda tetap sah, hanya diberi lencana "belum dipilih". Kartu **Rekap dana PKM** memantau pemakaian tiap kategori. |
| 📊 **Dashboard** | Ringkasan capaian, total waktu, dana terpakai &amp; sisa dana, rekap ringkas per sumber dana, grafik mini, dan kegiatan terbaru. |
| 📄 **Laporan kemajuan** | Unggah dokumen Word (`.docx`) dan tampilkan langsung di aplikasi seperti dibuka di Word. |
| 📊 **Presentasi** | Unggah PowerPoint (`.pptx`) dan/atau tempel tautan Canva — keduanya boleh dipakai bersamaan. Pratinjau `.pptx` memakai penampil PowerPoint Online (maks. 10 MB); berkas lebih besar cukup diunduh. |
| 🖼️ **Galeri** | Semua foto kegiatan dalam satu halaman, bisa dibuka besar (geser kiri/kanan di ponsel). |
| 📤 **Ekspor** | Unduh rekap sebagai **Word**, **PDF**, atau **Excel** — siap dikumpulkan. Tersedia pula **Word khusus keuangan** (dana Belmawa per kategori & dana PT terpisah). |
| 📥 **Impor** | Punya logbook lama berbentuk Word? Unggah, isinya (termasuk foto) dipindahkan otomatis. |
| 🤖 **Asisten AI** | Tanya langsung soal logbookmu — *"uang paling banyak ke mana?"*, *"berapa persen bahan habis pakai?"*, *"ringkas kegiatan bulan ini"* — dijawab dari data tim yang tersimpan. Juga bisa **merapikan deskripsi kegiatan** dan **mengusulkan sumber dana & kategori PKM** saat mengisi form. Ditenagai model Ollama di server kampus (`ollama.if.unismuh.ac.id`). |
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
   - **Tim** — dapat langsung mendaftar *(selama pendaftaran tim dibuka admin;
     bila ditutup, minta admin membuatkan akun dari panel)*.
   - **Fasilitator** atau **Dosen Pendamping** — memerlukan **kode pendaftaran**
     dari admin (kode untuk keduanya berbeda).
3. Isi username & password, lalu daftar. Akun baru selalu dimulai dari logbook
   kosong.
4. Untuk kunjungan berikutnya, gunakan tab **Masuk**.

> Username dan password dapat diganti kapan saja melalui nama akun (pojok) →
> **⚙️ Pengaturan akun**. Mengganti password otomatis mengeluarkan sesi di
> perangkat lain.

### 2. Menyiapkan dana kegiatan

Buka **Dashboard** → kartu **Dana kegiatan**, lalu isi dua nominal sesuai yang
benar-benar diterima tim:

- **Dana Belmawa** — besarnya berbeda tiap tim.
- **Dana Perguruan Tinggi** — umumnya maksimal Rp2.000.000 (jika lebih, aplikasi
  hanya memberi peringatan, bukan menolak).

Totalnya dipakai untuk menghitung **sisa dana** di dashboard dan pada semua hasil
ekspor, serta menjadi dasar persentase kategori di **Rekap dana PKM**.

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

**Kode unik (opsional).** Banyak pembayaran transfer memakai kode unik sehingga
nominalnya tidak bulat — misalnya sewa GPU Rp90.000/jam yang terbayar Rp90.123.
Isi selisih itu pada kolom **Kode unik (Rp)**; nilainya langsung dijumlahkan ke
total (`harga × jumlah + kode unik`) supaya angka tersimpan sama persis dengan
nota. Biarkan 0 bila tidak ada. Di daftar belanja kode unik tampil sebagai
keterangan kecil pada kolom harga, sedangkan kolom Total dan semua ekspor
(DOCX/PDF/Excel) menampilkan satu angka gabungan — sama seperti di nota.

**Sumber dana (opsional).** Pada form tersedia pemilih **Sumber dana** berbentuk
chip berwarna — *Belmawa* atau *Perguruan Tinggi*. Begitu **Belmawa** dipilih,
panel **Kategori belanja PKM** terbuka di bawahnya (bahan habis pakai, sewa &
jasa, transportasi lokal, lain-lain) lengkap dengan batas persentasenya; kategori
tidak ditampilkan untuk dana PT karena memang tidak berlaku. Chip menyesuaikan
lebar layar sehingga tetap nyaman di ponsel. Keduanya boleh dibiarkan kosong;
entri tanpa penanda hanya diberi lencana *"belum dipilih"*. Cara tercepat
melengkapinya: klik lencana itu langsung di daftar belanja lalu pilih chip
sumber & kategori — **ACC dosen tidak ikut dibatalkan** karena nominalnya tidak
berubah.

**Rekap dana PKM.** Di bawah toolbar Keuangan ada kartu rekap: berapa dana
Belmawa & PT yang terpakai, rincian tiap kategori beserta batas pedoman PKM 2026
(bahan habis pakai 60%, sewa & jasa 15%, transportasi lokal 30%, lain-lain 15%),
serta berapa entri yang belum ditandai. Batas yang terlampaui ditandai merah
sebagai peringatan — bukan penghalang menyimpan. Rekap ini ikut tercetak di
ekspor **PDF**, **Excel** (sheet *Rekap Dana*), dan **Word khusus keuangan**.

> Gunakan filter **bulan** dan **sumber dana** di toolbar untuk menemukan entri
> tertentu dengan cepat, termasuk memfilter yang *belum dipilih* sumbernya.
> Begitu chip **Belmawa** dipilih, muncul baris **Kategori** untuk menyaring
> lebih dalam (Bahan habis pakai, Sewa & jasa, Transportasi lokal, Lain-lain,
> atau yang *tanpa kategori*).

### 5. Laporan kemajuan & presentasi

| Menu | Isi | Catatan |
|---|---|---|
| **Laporan Kemajuan** | satu berkas `.docx` | Unggahan baru menggantikan berkas lama. Tampil langsung di aplikasi dan bisa diunduh. |
| **Presentasi** | satu berkas `.pptx` **dan/atau** satu tautan Canva | Boleh dipakai bersamaan dan dihapus terpisah. `.pptx` bisa diunduh; Canva hanya pratinjau. Pratinjau `.pptx` memakai penampil PowerPoint Online (maks. 10 MB); berkas lebih besar cukup diunduh. |

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
| **Word (.docx)** | Dokumen logbook terisi otomatis — entri beserta fotonya tersusun dalam tabel kegiatan & keuangan. Bagian **keuangan dimulai di halaman baru** agar dokumen enak dibaca dan dicetak. |
| **PDF** | Rekap siap cetak: ringkasan dana, seluruh kegiatan berikut foto, tabel keuangan bertotal, dan nomor halaman. |
| **Excel (.xlsx)** | Tiga lembar: Kegiatan, Keuangan, dan Ringkasan. |
| **Word Khusus Keuangan (.docx)** | Berkas **terpisah** berisi keuangan saja: tabel **dana Belmawa** dipecah per kategori PKM (tiap kategori diawali baris pemisah *Bahan habis pakai*, *Sewa & jasa*, … dan ditutup subtotal), lalu tabel **dana Perguruan Tinggi** sendiri, rekap pemakaian dana, dan **lampiran nota**. Bukti tiap belanja tampil kecil di kolom *Nota* serta berukuran besar di lampiran dengan nomor sama (**L-1**, **L-2**, …). Isinya teks, tabel, dan gambar biasa sehingga **bebas disalin dan diedit** di Word. |

Nama berkas hasil unduhan dibuat khas untuk tiap tim beserta tanggal unduhnya,
sehingga tidak tertukar saat dikumpulkan bersama tim lain:

```
Logbook Tim Alpha - Kegiatan & Keuangan (04-08-2026).docx
Logbook Tim Alpha - Kegiatan & Keuangan (04-08-2026).pdf
Logbook Tim Alpha - Rekap Kegiatan & Keuangan (04-08-2026).xlsx
Logbook Tim Alpha - Khusus Keuangan (04-08-2026).docx
```

Ekspor **tidak pernah mengubah data** — yang diunduh selalu salinan baru dan
aman diulang berkali-kali. Ekspor khusus keuangan juga **tidak mengganggu**
ekspor gabungan kegiatan & keuangan; keduanya berdiri sendiri.

> ⚡ **Cepat & hemat.** Foto untuk dokumen diminta ke CDN **sudah dalam ukuran
> sematan** (ImageKit yang mengecilkan, bukan server), diunduh dengan paralel
> terbatas, dan satu foto yang dipakai beberapa baris hanya disimpan sekali di
> dalam berkas. Bila data belum berubah sejak unduhan terakhir, tautan berkas
> yang sama langsung dikembalikan tanpa dibangun ulang (`cache: true`);
> tambahkan `?segar=1` pada `POST /api/export/tautan/{jenis}` untuk memaksa
> bangun ulang.

**Impor:** pada halaman yang sama, unggah logbook Word lama lalu klik **Impor
sekarang**. Berkas dikirim **langsung ke penyimpanan (ImageKit)** — tidak
melewati server — sehingga dokumen berfoto puluhan MB pun bisa diimpor dari
browser (maks. 300 MB); server lalu membacanya, memindahkan entri & foto, dan
menghapus berkas sementaranya. Entri yang belum ada akan ditambahkan lengkap
dengan fotonya; entri yang sudah ada dilewati sehingga aman diklik berulang.
Format tanggal seperti `23-Mei-26`, `06 Juni 2026`, `6/5/2026`, durasi `2 jam`
atau `1 j 30 mnt`, serta harga `Rp 100.000 / bulan` sudah dikenali. Setiap
gambar di dalam dokumen dikompresi **sekali** lalu diunggah **paralel** (5
sekaligus); bila impor gagal di tengah, foto yang sudah naik untuk entri yang
belum tersimpan dihapus otomatis — tidak ada berkas yatim.

### 9. Asisten AI

Tombol **✨ Tanya AI** (kanan bawah; di ponsel kiri bawah) membuka panel
percakapan. Server menyusun ringkasan data tim — dana, rekap kategori PKM
(60/15/30/15 %), pengeluaran per bulan, daftar belanja & kegiatan — lalu
mengirimkannya ke model **Ollama** di server kampus, sehingga jawaban memakai
angka yang benar, bukan mengarang. Contoh pertanyaan:

- *Uang kami paling banyak terpakai untuk apa?*
- *Berapa persen pemakaian tiap kategori dana Belmawa? Ada yang melebihi batas?*
- *Berapa sisa dana dan berapa entri yang belum ditandai sumbernya?*
- *Kegiatan apa saja di bulan Juli, dan berapa capaian totalnya?*

Di formulir **Kegiatan** ada tombol **Perbaiki dengan AI** (gaya formal /
ringkas / rinci) yang mengusulkan deskripsi lebih rapi **tanpa menambah fakta**
— tekan **Gunakan** bila cocok. Di formulir **Keuangan** ada **Saran kategori
AI** yang menebak sumber dana & kategori PKM dari nama item. Pembimbing dapat
bertanya tentang tim yang sedang dipilih di bilah atas.

**Modelnya kamu yang pilih.** Di kepala panel ada daftar **Model** berisi
seluruh model yang benar-benar terpasang di server kampus, diurutkan dari yang
paling ringan (jawaban paling cepat) lengkap dengan jumlah parameter &
ukurannya. Pilihan **Otomatis** berarti memakai model bawaan pemasangan
(`OLLAMA_MODEL`) — sistem tidak pernah menggantinya diam-diam. Pilihan
tersimpan di akunmu, jadi ikut dipakai tombol AI di formulir Kegiatan &
Keuangan dan tetap sama saat dibuka di perangkat lain. Tiap jawaban diberi
label model penjawabnya sehingga mudah membandingkan.

> Model penyemat (*embedding*, mis. `nomic-embed-text`) dan model berakhiran
> `:cloud` tidak ditawarkan karena tidak bisa diajak mengobrol / menuntut
> kredensial awan tersendiri. Setel `AI_MODEL_AWAN=1` bila pemasanganmu
> memang punya kredensialnya.

> Semua hasil AI hanya **usulan** — tidak ada yang tersimpan otomatis. Angka
> resmi tetap yang tertera di halaman Keuangan & Kegiatan. Permintaan dibatasi
> 12 per menit per akun. Fitur ini bisa dimatikan dengan `AI_NONAKTIF=1`.

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

Panel admin merupakan halaman terpisah dengan login tersendiri. Secara garis
besar, di dalamnya admin dapat:

- Melihat **ringkasan** jumlah akun, kegiatan, belanja, laporan, dan berapa akun
  yang sedang login.
- Mengelola **akun pengguna** — tim, fasilitator, dan dosen pendamping: ganti
  username, setel ulang password, keluarkan dari perangkat yang sedang login,
  serta menghapus akun.
- Memantau **perangkat & sesi** — berapa dan siapa saja yang sedang login,
  ditinjau secara keseluruhan maupun per akun. Tiap perangkat diberi status
  kehadiran nyata: **sedang membuka** (tab aplikasi terbuka, denyut < 90
  detik), **tab di latar** (terbuka tapi tersembunyi), atau **tidak membuka**
  (masih login, aplikasi tidak sedang dibuka). Kartu **"Sedang membuka"**
  menghitung akun yang benar-benar aktif saat ini — bukan sekadar login
  terakhir.
- Mengatur **kode pendaftaran** fasilitator dan dosen, serta **penugasan tim**
  untuk menghubungkan pembimbing dengan tim yang didampingi.
- **Membuka / menutup pendaftaran akun Tim** — tutup begitu semua tim
  terdaftar supaya tidak ada akun liar; akun baru tetap bisa dibuat admin dari
  panel. Pendaftaran fasilitator/dosen tidak terpengaruh (tetap memakai kode).
- Membaca **catatan aktivitas** panel yang tersimpan otomatis.

Seluruh tampilan panel menyegarkan diri sendiri, jadi perubahan langsung terlihat
tanpa perlu memuat ulang halaman.

> Alamat panel admin bawaan adalah `/pusat-kendali`; kredensialnya dibuat
> otomatis saat aplikasi pertama kali dijalankan dan ditampilkan **satu kali**
> pada log server — catat baik-baik. Kredensial dapat disetel ulang kapan saja
> dengan `node tools/superuser.mjs -u NAMA -p SANDI`, dan alamat panel dapat
> diganti dengan `node tools/superuser.mjs --path /alamat-baru`. Alamat panel
> tidak pernah ditautkan dari halaman mana pun; login-nya dibatasi 5 percobaan
> per 15 menit per alamat IP (plus rem darurat lintas-IP) dan sesinya terikat
> pada peramban yang dipakai.

---

## 🚀 Menjalankan aplikasi

### Pilihan A — Online 24 jam (disarankan)

Aplikasi dirancang untuk berjalan di layanan gratis:

| Bagian | Layanan |
|---|---|
| Hosting + alamat tetap | **Vercel** |
| Database | **Neon** (PostgreSQL) |
| Penyimpanan gambar & dokumen | **ImageKit** |

Panduan lengkap langkah demi langkah tersedia pada **[DEPLOY.md](DEPLOY.md)** —
mulai dari mem-*fork* repo ini sampai aplikasi hidup di alamat tetap.
Setelah terpasang, aplikasi dapat diakses siapa pun melalui alamat tetap tanpa
memerlukan perangkat yang menyala terus-menerus.

### Pilihan B — Menjalankan sendiri (lokal)

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

### Pilihan C — Mode pengembangan

```powershell
npm run dev --workspace backend      # API pada :4000 (muat ulang otomatis)
npm run dev --workspace frontend     # Antarmuka pada :3000 (API → localhost:4000)
```

---

## 🧰 Daftar perintah npm

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
| `node tools/superuser.mjs --path /alamat-baru` | Ganti alamat panel admin (bawaan `/pusat-kendali`) |
| `node tools/impor-logbook.mjs --file "berkas.docx" --user "Nama Akun"` | Impor dokumen Word dari laptop langsung ke sebuah akun (alternatif bila tidak ingin lewat browser) |
| `node tools/test-pemisah-halaman.mjs` | Uji cepat: bagian keuangan pada ekspor DOCX selalu mulai di halaman baru |

---

## ⚙️ Konfigurasi (.env)

Salin `.env.example` menjadi `.env` di akar folder proyek, lalu isi:

| Variabel | Kegunaan |
|---|---|
| `DATABASE_URL` | Alamat koneksi database Neon (PostgreSQL). |
| `IMAGEKIT_PUBLIC_KEY` | Kunci publik ImageKit. |
| `IMAGEKIT_PRIVATE_KEY` | Kunci privat ImageKit — rahasia. |
| `IMAGEKIT_URL_ENDPOINT` | Endpoint URL ImageKit. |
| `IMAGEKIT_FOLDER` | Folder penyimpanan (opsional, bawaan `/logbook`). |
| `APP_ORIGIN` | Opsional — alamat publik aplikasi (mis. `https://logbook.vercel.app`) yang dipakai untuk menyusun tautan penampil Office. Di Vercel otomatis diisi dari domain produksi; di laptop/tunnel boleh dikosongkan. |
| `OLLAMA_URL` | Opsional — server Ollama untuk asisten AI (bawaan `https://ollama.if.unismuh.ac.id`). |
| `OLLAMA_MODEL` | Opsional — model **bawaan**, dipakai saat pengguna memilih "Otomatis" (bawaan `qwen2.5:7b-instruct`). Pengguna bebas memilih model lain sendiri; daftarnya diambil dari `GET <OLLAMA_URL>/api/tags`. |
| `OLLAMA_API_KEY` | Opsional — bila server AI mewajibkan `Authorization: Bearer …`. |
| `AI_MODEL_AWAN` | Opsional — `1` agar model berakhiran `:cloud` ikut bisa dipilih (butuh kredensial awan; di server kampus selalu 401). |
| `AI_NONAKTIF` | Opsional — `1` mematikan seluruh fitur AI. |

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
`http://localhost:4000/docs`) **saat aplikasi dijalankan secara lokal**. Di
pemasangan produksi, `/docs` dan `/openapi.json` sengaja ditutup agar daftar
lengkap endpoint tidak dapat ditelusuri pengunjung.

Seluruh endpoint data memerlukan sesi login. Pemanggilan API mengirim token
melalui header `Authorization: Bearer <token>`, sementara gambar dan tautan
unduhan yang dibuka langsung oleh peramban dikenali lewat cookie HttpOnly
`logbook_sesi` yang dipasang saat login. Token **tidak pernah** diterima
melalui query string, sehingga tidak bocor ke riwayat peramban, log
server/CDN, maupun header `Referer`.

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
| GET | `/api/auth/pendaftaran` | Status pendaftaran akun tim (`{ tim: true/false }`, tanpa login) |
| POST | `/api/auth/login` | Masuk (memperoleh token) |
| GET | `/api/auth/me` | Profil akun yang sedang masuk |
| PUT | `/api/auth/username` | Ganti username (konfirmasi password) |
| PUT | `/api/auth/password` | Ganti password (sesi lain dikeluarkan) |
| GET | `/api/auth/aktivitas` | Riwayat aktivitas akun sendiri |
| GET | `/api/auth/sesi` | Daftar perangkat yang login (+ `membuka`/`layar` = sedang membuka aplikasi) |
| DELETE | `/api/auth/sesi/{id}` | Keluarkan satu perangkat |
| POST | `/api/auth/sesi/lainnya` | Keluarkan semua perangkat lain |
| POST | `/api/auth/denyut` | Denyut tab (tiap ±30 dtk; `?layar=terlihat\|tersembunyi\|` kosong = tab ditutup) |
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
| GET | `/api/export/keuangan-docx` | Unduh Word **khusus keuangan** (Belmawa per kategori + tabel PT terpisah) |
| POST | `/api/export/tautan/{jenis}` | Siapkan berkas ekspor lalu kembalikan tautan CDN (`docx`, `pdf`, `xlsx`, `keuangan-docx`); data tak berubah → tautan lama (`cache: true`), `?segar=1` memaksa bangun ulang |
| POST | `/api/import/izin-unggah` | Izin unggah `.docx` impor **langsung ke ImageKit** (byte tidak lewat server, maks. 300 MB) |
| POST | `/api/import/docx/langsung` | Verifikasi bagian yang diunggah, jalankan impor, hapus berkas sementara |
| POST | `/api/import/docx` | Impor entri + foto dari dokumen Word lewat server (cadangan mode lokal) |
| POST | `/api/import/docx/chunk` \| `/docx/selesai` | Impor berkas besar secara terpotong (cadangan mode lokal) |

**Umum (tanpa login)**

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/health` | Pemeriksaan status + hash commit yang sedang online |
| GET | `/docs` | Dokumentasi Swagger interaktif *(hanya saat dijalankan lokal)* |
| GET | `/openapi.json` | Spesifikasi OpenAPI mentah *(hanya saat dijalankan lokal)* |

**Laporan kemajuan**

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/laporan/info` | Info berkas laporan (nama, ukuran, waktu unggah) |
| POST | `/api/laporan/izin-unggah` | Izin unggah **langsung ke ImageKit** (byte tidak lewat server, maks. 300 MB) |
| POST | `/api/laporan/daftarkan` | Catat berkas hasil unggah langsung (diverifikasi ke metadata ImageKit) |
| GET | `/api/laporan/file` | Tampilkan / unduh `.docx` (302 ke CDN bila satu bagian) |
| GET | `/api/laporan/file/bagian` | Daftar signed URL tiap bagian — dirakit di browser |
| POST / DELETE | `/api/laporan` | Unggah lewat server — cadangan mode lokal (potongan: `/chunk` + `/selesai`) / hapus |
| POST | `/api/laporan/tautan` | Tautan sementara untuk penampil Office |
| GET | `/api/laporan/publik/{kunci}` | Akses berkas melalui tautan sementara — **selalu dilayani server** agar render Word Online tidak berubah |

**Presentasi**

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/presentasi/info` | Info berkas `.pptx` dan tautan Canva |
| POST | `/api/presentasi/izin-unggah` | Izin unggah **langsung ke ImageKit** (byte tidak lewat server, maks. 300 MB) |
| POST | `/api/presentasi/daftarkan` | Catat berkas hasil unggah langsung (diverifikasi ke metadata ImageKit) |
| GET / DELETE | `/api/presentasi/file` | Unduh (302 ke CDN) / hapus `.pptx` (tautan Canva tetap ada) |
| GET | `/api/presentasi/file/bagian` | Daftar signed URL tiap bagian — dirakit di browser |
| POST | `/api/presentasi` | Unggah `.pptx` lewat server — cadangan mode lokal (potongan: `/chunk` + `/selesai`) |
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
| GET | `/api/fasilitator/tim/{id}/laporan-bagian` | Signed URL bagian laporan tim — dirakit di browser |
| GET | `/api/fasilitator/tim/{id}/presentasi-info` \| `/presentasi-file` | Presentasi tim |
| GET | `/api/fasilitator/tim/{id}/presentasi-bagian` | Signed URL bagian presentasi tim — dirakit di browser |
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

**Asisten AI** (Ollama server kampus — dipanggil lewat backend, dibatasi 12×/menit per akun)

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/ai/status` | Fitur aktif? model & server terjangkau? |
| POST | `/api/ai/tanya` | Tanya-jawab tentang logbook (`pesan`, `riwayat[]`; pembimbing: `tim`) |
| POST | `/api/ai/perbaiki-kegiatan` | Usulan deskripsi kegiatan yang lebih rapi (`teks`, `tanggal`, `gaya`) — tim |
| POST | `/api/ai/saran-belanja` | Usulan sumber dana & kategori PKM dari nama item (`item`, `harga`) — tim |

---

## 🗂️ Struktur proyek

```
logbook-app/
├── start.ps1            ← menjalankan aplikasi secara lokal
├── stop.ps1             ← menghentikan proses terkait
├── vercel.json          ← pengaturan hosting serverless (build, rewrite, region)
├── .env                 ← konfigurasi database & penyimpanan berkas (lokal saja)
├── api/index.js         ← titik masuk untuk hosting serverless (Vercel)
├── tools/               ← utilitas: kredensial admin, migrasi data, cek online
├── backend/             ← Express: REST API + Swagger + penyaji frontend
│   └── src/
│       ├── server.js    ← titik masuk & pemasangan seluruh rute
│       ├── db.js        ← koneksi database + pembuatan skema otomatis
│       ├── storage.js   ← seluruh akses data (akun, entri, komentar, ACC)
│       ├── files.js     ← unggah foto, .docx & .pptx ke penyimpanan berkas
│       ├── auth.js      ← sesi login + pembatasan hak akses per peran
│       ├── assets/      ← template-logbook.docx (kerangka dokumen ekspor)
│       ├── export/      ← penyusun berkas docx, pdf, xlsx (+ foto.js: pengambil foto sematan)
│       ├── import/      ← pembaca logbook Word lama
│       ├── ai/          ← klien Ollama + penyusun konteks data tim
│       ├── admin/       ← panel admin (panel.js + routes.js)
│       └── routes/      ← kegiatan, keuangan, laporan, presentasi, ai, dst.
└── frontend/            ← Next.js, dibangun menjadi berkas statis
    ├── app/             ← Dashboard, Kegiatan, Keuangan, Laporan, Presentasi,
    │                       Galeri, Ekspor, Profil
    ├── lib/api.js       ← pemanggil REST API + cache sisi klien
    └── components/      ← Shell, Komentar, Acc, KartuAcc, dsb.
```

> Template `backend/src/assets/template-logbook.docx` hanya berisi **kerangka
> tabel kosong** (judul kolom) — hasil ekspor diisi sepenuhnya dari data akun
> yang sedang masuk.

---

## 🧪 Pengujian otomatis

Server harus dalam keadaan berjalan (bawaan `:4000`) dan `.env` sudah terisi.

| Perintah | Yang diuji |
|---|---|
| `npm run diag --workspace backend` | Seluruh rute terdaftar (`diag:rute`), keutuhan panel admin (`diag:panel`), dan perilaku antarmukanya (`diag:panel-ui`) |
| `npm run diag:panel-api --workspace backend` | Endpoint panel admin: validasi input, pengelolaan akun, audit |
| `npm run diag:pusat-kendali --workspace backend` | Halaman-halaman panel admin, saringan catatan aktivitas, pencatatan login terakhir, dan data pendamping tim |
| `npm run diag:peran --workspace backend` | Alur peran menyeluruh: pendaftaran dengan kode, penolakan 403, penugasan tim, komentar dua arah, lencana belum dibaca, dan ACC dosen |
| `npm run diag:presentasi --workspace backend` | Alur presentasi menyeluruh: unggah `.pptx`, normalisasi tautan Canva, akses pembimbing, komentar & ACC, serta penghapusan terpisah |
| `npm run diag:presentasi-langsung --workspace backend` | Jalur unggah **langsung ke ImageKit**: penerbitan izin, verifikasi metadata, berkas satu bagian & multi-bagian, redirect 302 ke CDN, dan penolakan izin palsu (butuh internet + env `IMAGEKIT_*`) |
| `npm run diag:laporan-langsung --workspace backend` | Jalur langsung untuk laporan `.docx` — termasuk memastikan tautan penampil **Word Online tetap dilayani server** (tidak di-redirect) sehingga hasil rendernya tidak berubah |
| `npm run diag:impor-langsung --workspace backend` | Jalur **impor `.docx` langsung ke ImageKit**: penerbitan izin, verifikasi metadata, impor berjalan, berkas sementara terhapus (sukses maupun gagal), penolakan izin palsu, pagar peran & login (butuh internet + env `IMAGEKIT_*`) |
| `npm run diag:keamanan --workspace backend` | Perbaikan keamanan hasil audit: buka/tutup pendaftaran tim (+ endpoint publik & audit panel), whitelist kunci pengaturan, penolakan origin CORS palsu, unggahan bukan gambar → 400 ramah, pembatas laju per-username, cookie sesi panel, serta **denyut kehadiran** (`/denyut` → `membuka`, beacon tutup → tidak membuka) |
| `npm run diag:ai --workspace backend` | Asisten **AI**: penyusun konteks (angka rekap benar, ukuran terbatas, kata kunci), parser JSON model, status server Ollama, **pemilihan model oleh pengguna** (daftar tersaring, model asing ditolak, `auto` kembali ke bawaan, pilihan tersimpan dipakai), lalu tanya-jawab & perbaikan deskripsi nyata (butuh internet) |
| `npm run diag:ekspor-impor --workspace backend` | Putar-balik **ekspor → impor** beserta foto: foto 2000px dikecilkan CDN jadi sematan 1000px tanpa crop, cache sidik jari (pakai ulang / `?segar=1` / batal saat data berubah), berkas ekspor lama dibuang, PDF & XLSX terbit, dokumen hasil ekspor diimpor ke akun lain lengkap dengan fotonya, dan impor ulang tidak mengunggah foto lagi (butuh internet + env `IMAGEKIT_*`) |
| `node backend/diag-ekspor-foto.mjs` | Pengambil foto sematan (`export/foto.js`): pemilihan resolusi dari jumlah foto, pembaca dimensi JPEG/PNG, pembatas paralel, dan sidik jari cache ekspor (tanpa database) |
| `node backend/diag-keuangan-sumber.mjs` | Fitur **sumber dana PKM**: rute `PATCH /:id/sumber`, pembersihan nilai tak dikenal, perhitungan batas kategori (60/15/30/15%), batas dana PT, serta kesamaan hasil rekap backend ↔ frontend (tanpa database) |
| `node tools/test-ekspor-pdf-xlsx.mjs` | Ekspor **PDF & Excel** memakai data nyata: berkas valid, kolom *Sumber dana* pada sheet Keuangan, dan sheet **Rekap Dana** ikut tercetak |
| `node tools/test-ekspor-keuangan-docx.mjs` | Ekspor **Word khusus keuangan**: paket `.docx` valid & XML well-formed, tabel Belmawa terpisah per kategori (baris pemisah + subtotal), tabel PT sendiri, serta **nota tersemat** (thumbnail + lampiran bernomor, relationship & content-type lengkap, tiap gambar hanya disimpan sekali) |
| `node tools/test-rute-ekspor.mjs` | Seluruh rute ekspor terdaftar, termasuk `GET /keuangan-docx` dan `POST /tautan/:jenis` |
| `node --env-file=.env tools/cek-kode-unik.mjs` | Memastikan kolom **kode unik** sudah termigrasi di database dan tiap entri belanja konsisten (`harga × jumlah + kode unik = total`) |

Akun uji dibuat dan dihapus kembali secara otomatis sehingga data sungguhan
tidak terganggu.

### Perawatan kuota database

Berkas biner (foto, `.docx`, `.pptx`, termasuk potongan unggahan sementara)
disimpan di **ImageKit** (20 GB) — **Neon** (0,5 GB) hanya menyimpan teks dan
katalog kunci sehingga kuotanya awet. Bila ingin merapikan sisa lama:

```bash
npm run bersih:db --workspace backend
```

Perintah ini menghapus potongan unggahan terbengkalai, mengosongkan kolom
base64 lama yang sudah bermigrasi ke ImageKit, lalu `VACUUM FULL` agar
ruangnya benar-benar kembali ke kuota.

---

## 🔒 Keamanan

- Password disimpan sebagai **hash scrypt** (satu arah) — tidak dapat dibaca
  kembali oleh siapa pun, termasuk pengelola aplikasi.
- Seluruh endpoint data memerlukan token login; pengunjung yang hanya mengetahui
  alamat aplikasi hanya akan melihat halaman masuk.
- Pembatasan hak akses per peran diterapkan di server, sehingga akun pembimbing
  tidak dapat mengubah data tim walaupun permintaannya dibuat secara manual.
  Setiap permintaan pembimbing terhadap data sebuah tim juga diperiksa
  penugasannya lebih dulu — termasuk saat memberi ACC — sehingga id tim milik
  orang lain tidak dapat "ditebak" lewat parameter.
- Pendaftaran dibatasi jumlah percobaannya per alamat IP, sehingga kode
  pendaftaran fasilitator/dosen tidak dapat ditebak dengan cara mencoba
  berulang kali. Pendaftaran akun tim dapat **ditutup sepenuhnya** oleh admin.
- Percobaan masuk dibatasi **dua lapis**: per alamat IP *dan* per username yang
  dicoba — serangan dari banyak alamat IP ke satu akun pun tetap terbendung.
  Penggantian username/password juga dibatasi (5 percobaan / 15 menit).
- Panel admin memakai **cookie HttpOnly terpisah** yang dibatasi ke alamat
  panel saja — token panel tidak pernah muncul di URL, riwayat peramban, atau
  log. Aplikasi utama memakai cookie `logbook_sesi` yang berbeda.
- Pengaturan per akun hanya menerima **kunci yang dikenal** (whitelist) dengan
  batas panjang nilai, sehingga tabel pengaturan tidak bisa dijadikan tempat
  penimbunan data sembarangan.
- Pesan galat server (5xx) yang dikirim ke peramban selalu generik — detail
  internal (nama tabel, path berkas) hanya tercatat di log server.
- Tautan penampil Office disusun dari alamat aplikasi yang **tepercaya**
  (`APP_ORIGIN` / domain produksi Vercel), bukan dari header `Host` kiriman
  pemanggil.
- Unggahan berkas besar yang dipotong-potong dibatasi ukuran, jumlah potongan,
  dan format datanya, lalu sisa potongan yang terbengkalai dibersihkan otomatis.
- Sesi kedaluwarsa otomatis setelah 30 hari tidak dipakai, dan mengganti password
  langsung mengakhiri sesi di perangkat lain.
- Halaman **Profil → Perangkat & sesi aktif** memperlihatkan setiap perangkat yang
  sedang masuk ke akun (mis. “Brave · Linux”, terakhir aktif kapan) dan dapat
  mengeluarkannya satu per satu atau sekaligus — berguna saat lupa keluar di
  komputer pinjaman. Perangkat lain yang **saat ini benar-benar membuka
  aplikasi** ditandai lencana **Online** (perangkat yang sedang kamu pakai cukup
  ditandai “perangkat ini”). Data yang disimpan sengaja seminim mungkin: User-Agent
  **tidak** disimpan utuh, dan keterangan jaringan yang ditampilkan kepada pemilik
  akun sudah disamarkan.
- Status **Online / sedang membuka** berasal dari *denyut* yang dikirim tab
  aplikasi tiap ±30 detik selama terbuka (dan dihapus saat tab ditutup). Yang
  disimpan hanya waktu denyut dan apakah tab terlihat/tersembunyi — tanpa
  data lain — dan ikut terhapus bersama sesinya.
- Nama peramban dibaca dari *Client Hints* (`Sec-CH-UA`), sehingga peramban yang
  sengaja menyamar sebagai Chrome di User-Agent — **Brave** — tetap dikenali
  dengan nama aslinya.
- Keterangan sesi hanya hidup selama sesinya: begitu sesi dicabut atau
  kedaluwarsa, catatannya ikut terhapus sehingga tidak ada jejak yang berumur
  panjang. (Alamat MAC tidak pernah bisa dilihat aplikasi web mana pun — alamat
  itu tidak ikut melewati internet.)
- Tersedia pembatasan percobaan masuk (anti tebak-tebakan password) serta header
  keamanan standar.
- Gambar disajikan melalui tautan bertanda tangan berumur pendek dan hanya dapat
  diakses pemilik data atau pembimbing yang berhak.

---

## ❓ Tanya-jawab

**Bisakah saya memakainya untuk timku sendiri?**
Bisa. *Fork* repo ini, buat akun gratis di Vercel + Neon + ImageKit, lalu ikuti
[DEPLOY.md](DEPLOY.md). Seluruh data (akun, foto, dokumen) tersimpan di layanan
milikmu sendiri — tidak ada yang dikirim ke pemilik repo.

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

