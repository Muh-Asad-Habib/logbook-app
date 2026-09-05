// Ringkasan faktual, bukan salinan buku. Halaman = nomor halaman fisik PDF.
// Sumber diunduh/dibaca 5 September 2026; arsip PDF tidak masuk repo.
export const SKEMA_PKM = Object.freeze({
  'PKM-RE': 'Riset Eksakta', 'PKM-RSH': 'Riset Sosial Humaniora',
  'PKM-K': 'Kewirausahaan', 'PKM-PM': 'Pengabdian kepada Masyarakat',
  'PKM-PI': 'Penerapan Iptek', 'PKM-KC': 'Karsa Cipta',
  'PKM-KI': 'Karya Inovatif', 'PKM-VGK': 'Video Gagasan Konstruktif',
  'PKM-AI': 'Artikel Ilmiah', 'PKM-GFT': 'Gagasan Futuristik Tertulis',
});
export const SUMBER_PKM = Object.freeze({
  2022: { tahun: 2022, judul: 'PKM 2022 — Penjelasan Umum',
    url: 'https://simbelmawa.kemdiktisaintek.go.id/portal/wp-content/uploads/2022/03/1.-PKM-Penjelasan-Umum.pdf',
    portal: 'https://simbelmawa.kemdiktisaintek.go.id/portal/penawaran-program-kreativitas-mahasiswa-tahun-2022/' },
  2023: { tahun: 2023, judul: 'Pedoman Umum PKM 2023',
    url: 'https://simbelmawa.kemdiktisaintek.go.id/portal/wp-content/uploads/2023/02/1.-Pedoman-Umum-PKM-2023-1.pdf',
    portal: 'https://simbelmawa.kemdiktisaintek.go.id/portal/pedoman-pkm-tahun-2023-diktiridtek/' },
  2024: { tahun: 2024, judul: 'Panduan Umum PKM 2024',
    url: 'https://simbelmawa.kemdiktisaintek.go.id/portal/wp-content/uploads/2024/11/1.-Panduan-Umum-PKM-2024.pdf',
    portal: 'https://simbelmawa.kemdiktisaintek.go.id/portal/unduh/panduan-pkm-2024/' },
  2025: { tahun: 2025, judul: 'Panduan Umum PKM 2025 (pembaruan terbitan)',
    url: 'https://drive.google.com/file/d/1u2tL4iCCYVsrqTa7w3J90-BVqMEEAbqr/view',
    portal: 'https://simbelmawa.kemdiktisaintek.go.id/portal/unduh/panduan-pkm-2025/' },
  2026: { tahun: 2026, judul: 'Panduan PKM 2026 — umum dan sepuluh bidang',
    url: 'https://simbelmawa.kemdiktisaintek.go.id/portal/wp-content/uploads/2026/03/PANDUAN-PKM-2026_versi_full.pdf',
    portal: 'https://simbelmawa.kemdiktisaintek.go.id/portal/unduh/panduan-pkm-2026/' },
});

const umum = (tahun, halaman, teks) => ({ id: `umum-${tahun}`, tahun, halaman, skema: [], teks });
const bidang = (skema, halaman, teks) => ({ id: `bidang-${skema}`, tahun: 2026, halaman, skema: [skema], teks });
export const PENGETAHUAN_PKM = Object.freeze([
  umum(2022, [10], 'PKM 2022 diperuntukkan bagi mahasiswa D3, D4, S1 yang terdaftar di PDDikti. Tabel kriteria RE, RSH, K, PM dan PI mencantumkan kelompok 3–5 mahasiswa dan pendanaan Rp5–7 juta. PKM-PM menyasar mitra non-profit, PKM-PI mitra profit. Luaran PKM-K meliputi laporan kemajuan, laporan akhir dan produk usaha. Ini ketentuan 2022, bukan rentang pendanaan tahun lain.'),
  umum(2023, [11], 'Kriteria PKM 2023 untuk RE, RSH, K, PM, PI dan KC: mahasiswa D3/D4/S1, kelompok 3–5 orang, pendanaan Rp6–10 juta. Tabel luaran telah mencantumkan akun media sosial. PKM-PM untuk mitra non-profit, PKM-PI mitra profit; PKM-K berorientasi produk usaha. Gunakan pedoman 2023 ketika membahas peserta tahun 2023.'),
  umum(2024, [10], 'Kriteria PKM 2024 untuk RE, RSH, K, PM, PI dan KC mencantumkan kelompok 3–5 mahasiswa D3/D4/S1 serta pendanaan Rp6–10 juta. Luaran meliputi laporan kemajuan, laporan akhir dan akun media sosial, ditambah luaran khusus bidang. PKM-K: produk dan aktivitas usaha; PM/PI: buku pedoman mitra; KC: prototipe/produk fungsional. Rentang ini tidak boleh dianggap aturan 2025/2026.'),
  umum(2025, [9], 'Panduan umum PKM 2025 mencantumkan mahasiswa D3/D4/S1 terdaftar PDDikti; kelompok 3–5 orang. Pendanaan RE, RSH, K, PM, PI dan KC adalah Rp5–8 juta. Luaran khusus PKM-K berupa buku dokumentasi produk dan aktivitas usaha; PM/PI buku pedoman mitra; KC prototipe/produk fungsional. PKM-PM untuk mitra non-komersial, PI untuk mitra komersial. Rincian RAB harus diperiksa pada buku skema 2025, bukan mengambil batas 2026.'),
  umum(2026, [9, 10], 'PKM 2026 ditujukan kepada mahasiswa D3/D4/S1 yang tercatat di PDDikti. Tabel sepuluh bidang mencantumkan kelompok 3–5 mahasiswa. Delapan bidang pendanaan RE, RSH, K, PM, PI, KC, KI dan VGK memiliki rentang Rp6–8 juta; AI dan GFT merupakan insentif Rp1,5 juta. Luaran berbeda antarbidang. Mahasiswa belum lulus pada tahun pelaksanaan dan tidak sedang pendidikan profesi/koas. Jangan menentukan skema hanya dari nama tim.'),
  { id: 'sejarah-2022-2023', tahun: 2026, halaman: [8], skema: [], teks: 'Riwayat yang dicatat panduan 2026: pada 2022 buku RE/RSH dipisah; PKM-GT menjadi GFT dan GFK menjadi VGK. Sejak 2023 luaran wajib PKM pendanaan ditambah konten media sosial. Ini informasi sejarah, bukan dasar menyamakan seluruh aturan anggaran 2022–2026.' },
  { id: 'medsos-2026', tahun: 2026, halaman: [11], skema: ['PKM-RE','PKM-RSH','PKM-K','PKM-PM','PKM-PI','PKM-KC','PKM-KI','PKM-VGK'], teks: 'PKM pendanaan 2026 wajib memiliki akun media sosial khusus topik tim, minimal satu platform (misalnya Instagram, TikTok, X, Facebook atau YouTube). Kontennya edukasi/publikasi/promosi pelaksanaan atau hasil kegiatan. Anggaran seluruh unggahan dengan iklan berbayar paling banyak Rp500.000. Jadwal ads serentak mengikuti pengumuman resmi, bukan tanggal yang dikarang AI.' },
  bidang('PKM-RE', [9], 'PKM-RE menghasilkan informasi baru melalui riset eksakta berbasis iptek. Luaran 2026: laporan kemajuan, laporan akhir, artikel ilmiah dan akun media sosial. Topik riset harus dibedakan dari sekadar membuat prototipe.'),
  bidang('PKM-RSH', [9], 'PKM-RSH merupakan riset sosial-humaniora untuk memperoleh informasi baru. Luaran 2026: laporan kemajuan, laporan akhir, artikel ilmiah dan akun media sosial. Jangan menukar persyaratan skema riset dengan pengabdian atau usaha.'),
  bidang('PKM-K', [9], 'PKM-K berfokus pada produk/jasa berbasis iptek sebagai komoditas usaha mahasiswa. Luaran 2026: laporan kemajuan, laporan akhir, katalog produk/jasa dan akun media sosial. Usaha mahasiswa berbeda dari penerapan iptek pada usaha mitra (PKM-PI).'),
  bidang('PKM-PM', [9], 'PKM-PM menawarkan solusi iptek/teknologi/manajemen kepada mitra non-komersial. Luaran 2026: laporan kemajuan, laporan akhir, buku panduan mitra dan akun media sosial. Tujuan serta jenis mitra dalam proposal harus diperiksa; nama tim saja tidak membuktikan PKM-PM.'),
  bidang('PKM-PI', [10], 'PKM-PI menerapkan solusi iptek/teknologi/manajemen pada mitra komersial. Luaran 2026: laporan kemajuan, laporan akhir, buku pedoman mitra dan akun media sosial. Bedakan usaha mitra dengan usaha mahasiswa pada PKM-K.'),
  bidang('PKM-KC', [10], 'PKM-KC berfokus pada konstruksi karsa yang fungsional. Luaran 2026: laporan kemajuan, laporan akhir, prototipe dan akun media sosial. Jangan menyamakan prototipe KC dengan produk skala penuh siap produksi pada KI.'),
  bidang('PKM-KI', [10], 'PKM-KI menghasilkan karya fungsional inovatif dan solutif berbasis iptek, skala penuh serta siap diproduksi massal. Luaran 2026 mencakup laporan kemajuan/akhir, produk fungsional skala penuh beserta dokumen teknis, serta akun media sosial.'),
  bidang('PKM-VGK', [10], 'PKM-VGK menghasilkan gagasan berupa video terkait isu dalam sepuluh tema PKM tematik. Luaran 2026 mencakup laporan kemajuan, laporan akhir, video YouTube dan akun media sosial. Nama lamanya GFK tidak boleh diperlakukan sebagai skema aktif yang berbeda.'),
  bidang('PKM-AI', [10], 'PKM-AI adalah Artikel Ilmiah hasil kegiatan akademik mahasiswa, bukan fitur kecerdasan buatan aplikasi. Pada tabel 2026 jalurnya insentif Rp1,5 juta dengan luaran artikel ilmiah; bukan program pelaksanaan pendanaan delapan bidang.'),
  bidang('PKM-GFT', [10], 'PKM-GFT adalah artikel gagasan berisi konsep perubahan futuristik. Tabel 2026 mencantumkan insentif Rp1,5 juta dengan luaran artikel gagasan; berbeda dari VGK yang menghasilkan video.'),
  { id: 'rab-pm-2026', tahun: 2026, halaman: [204, 205], skema: ['PKM-PM'], teks: 'RAB PKM-PM 2026: Belmawa Rp6–8 juta; dana pendamping PT maksimum Rp2 juta; mitra/sponsor lain maksimum Rp1 juta. Komposisi operasional minimal 80%, administrasi maksimal 20%. Batas kategori RAB: bahan 60%, sewa/jasa 15%, transport lokal 30%, lain-lain 15%; masing-masing maksimum, bukan dijumlahkan menjadi alokasi 120%. Buku menyebut dasar persentase jumlah dana yang diusulkan, dengan tabel sumber Belmawa/PT/instansi lain. Jangan otomatis menggantinya dengan dana Belmawa diterima atau menyatakan pelanggaran tanpa RAB yang disahkan.' },
  { id: 'rab-k-2026', tahun: 2026, halaman: [47, 48], skema: ['PKM-K'], teks: 'RAB PKM-K 2026 mencantumkan Belmawa Rp6–8 juta, pendamping PT maksimum Rp2 juta, sponsor lain maksimum Rp1 juta, operasional minimal 80% dan administrasi maksimal 20%. Tabel RAB: bahan maksimum 60%, sewa/jasa 15%, transport lokal 30%, lain-lain 15% dari jumlah dana yang diusulkan. Total alokasi tetap 100%. Batas pada rencana anggaran tidak sama dengan persentase transaksi dari dana Belmawa diterima; butuh RAB yang disahkan untuk penilaian kepatuhan.' },
  { id: 'rab-pi-2026', tahun: 2026, halaman: [166], skema: ['PKM-PI'], teks: 'Tabel RAB PKM-PI 2026: bahan maksimal 60%, sewa/jasa 15%, transportasi lokal 30%, lain-lain 15% dari jumlah dana yang diusulkan. Setiap baris memisahkan Belmawa/PT/instansi lain. Persentase merupakan maksimum per kategori, sedangkan total alokasi tetap 100%. Jangan memutuskan pelanggaran dari statistik logbook saja tanpa basis RAB yang tepat.' },
  { id: 'larangan-pm-2026', tahun: 2026, halaman: [204], skema: ['PKM-PM'], teks: 'PKM-PM 2026 melarang pada usulan RAB: honorarium/konsumsi/hadiah bagi tim, pendamping atau narasumber; sewa PC/laptop/printer/ponsel/kamera/tempat; alat/bahan di atas Rp1 juta per item; penyimpanan data; kuota di atas Rp100 ribu per bulan per tim; lisensi lebih dari enam bulan; seminar/publikasi hasil PKM di jurnal. Penggandaan/penjilidan laporan juga dilarang dengan pengecualian yang disebut untuk PTS atau PTN yang mewajibkan hardcopy. Langganan software tidak otomatis boleh hanya karena diberi kategori bahan.' },
  { id: 'laporan-pm-2026', tahun: 2026, halaman: [208, 209], skema: ['PKM-PM'], teks: 'Laporan kemajuan PKM-PM 2026 memakai Times New Roman 12, spasi 1,15, A4 satu kolom, margin kiri 4 cm dan sisi lain 3 cm. Tidak memakai sampul/pengesahan pada berkas laporan kemajuan. Isi mencakup pendahuluan, target luaran, metode, hasil yang dicapai, potensi hasil, rencana lanjutan, pustaka dan lampiran penggunaan dana/bukti kegiatan. Validasi dilakukan pendamping. Data luaran harus nyata; jangan mengarang capaian atau bukti.' },
]);

