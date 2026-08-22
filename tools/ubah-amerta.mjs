/**
 * Ubah data akun "Amerta Sign" (SETELAH backup):
 * - KEGIATAN: seluruh deskripsi ditulis ulang formal, konsisten dengan
 *   keuangan (dataset/GPU/VPS) dan foto per tanggal; persen & menit
 *   diselaraskan dengan rentang pukul di teks.
 * - KEUANGAN: 4x Dataset 925k, 4x Server GPU 90k/jam, VPS 300k/bulan x4,
 *   item lain dirapikan bahasanya.
 * - Persetujuan (ACC dosen) entri yang berubah direset — mengikuti
 *   perilaku aplikasi ("entri berubah -> ACC batal").
 * HANYA menyentuh user_id akun Amerta Sign.
 * Pakai: node tools/ubah-amerta.mjs
 */
import crypto from "node:crypto";
import { q } from "../backend/src/db.js";

const USER = "43076c94-d5be-4a11-b01d-e4704f7fd6cf"; // Amerta Sign
const cekUser = await q("SELECT username FROM users WHERE id = $1", [USER]);
if (cekUser[0]?.username !== "Amerta Sign") {
  console.error("Guard gagal: id bukan akun Amerta Sign — batal."); process.exit(1);
}

const HADIR_SEMUA = "Ketua Tim, Anggota 1, Anggota 2, Anggota 3, dan Anggota 4";
const HADIR_DP = "Dosen Pendamping, " + HADIR_SEMUA;

/* ---------------- KEGIATAN: teks baru per ID ---------------- */
const KEGIATAN = [
  ["6225a3d1-fc62-4d30-8476-57f25f3ed9f7", // 23/5
   "Menerima pengumuman resmi kelolosan pendanaan Program Kreativitas Mahasiswa (PKM) tahun 2026 dari Direktorat Belmawa.", null, null],
  ["42c9e1aa-f870-48fe-87c6-b0cb54dffa99", // 26/5
   `Melaksanakan rapat koordinasi daring (Zoom Meeting) bersama Dosen Pendamping guna membahas progres pembuatan desain publikasi media sosial, penyusunan jadwal kegiatan, serta pembagian tugas kepada seluruh anggota tim. Kegiatan berlangsung pada pukul 21.00–00.00 WITA dan dihadiri oleh ${HADIR_DP}.`, null, null],
  ["15dbce8d-8eec-4d35-95b0-61b4001520d0", // 3/6 — sinkron keuangan VPS 3/6
   `Menghadiri Pertemuan Perdana Penerima Pendanaan dan Insentif PKM 2026 yang diselenggarakan oleh Universitas Muhammadiyah Makassar dan diikuti oleh seluruh tim PKM penerima pendanaan tahun 2026, sekaligus mengaktifkan layanan server hosting VPS untuk kebutuhan pengembangan aplikasi dengan periode sewa 3 Juni – 3 Oktober 2026. Kegiatan berlangsung pada pukul 10.00–16.00 WITA dan dihadiri oleh ${HADIR_SEMUA}.`, null, null],
  ["b48e4da2-88e6-4479-968d-86e7b9fb27a6", // 4/6
   `Menghadiri Pertemuan Pembekalan Tim "Lolos PKM Belmawa 2026" yang diselenggarakan oleh Fakultas Teknik Universitas Muhammadiyah Makassar dan diikuti oleh seluruh tim PKM Fakultas Teknik. Kegiatan berlangsung pada pukul 11.00–13.00 WITA dan dihadiri oleh ${HADIR_SEMUA}.`, null, null],
  ["02c69953-aefe-41b6-909b-02f971ae34d4", // 5/6
   `Melaksanakan produksi video pengenalan program untuk kebutuhan publikasi media sosial, berlokasi di sekitar kampus Universitas Muhammadiyah Makassar. Kegiatan berlangsung pada pukul 10.30–14.30 WITA dan dihadiri oleh ${HADIR_SEMUA}.`, null, null],
  ["95e94255-4825-4c51-91fb-a501e440db98", // 6/6 — sinkron keuangan ads + Canva
   `Melaksanakan pertemuan di Student Center Universitas Muhammadiyah Makassar guna mengelola pemasangan iklan (ads) konten pengenalan program pada akun Instagram tim serta mengaktifkan langganan Canva Pro untuk kebutuhan desain publikasi. Kegiatan berlangsung pada pukul 10.00–13.00 WITA dan dihadiri oleh ${HADIR_SEMUA}.`, null, null],
  ["7e9b3b9a-f78e-40be-a785-5272a639cae6", // 8/6
   `Mengikuti rapat daring (Zoom Meeting) "Bimbingan Teknis Pelaksanaan PKM 2026" yang diselenggarakan oleh Kemahasiswaan Dikti. Kegiatan berlangsung pada pukul 13.00–17.00 WIB dan dihadiri oleh ${HADIR_DP}.`, null, null],
  ["d47e0ab5-29b3-44ec-bd33-5ab2d71c6623", // 10/6
   `Mengikuti rapat daring (Zoom Meeting) "Pendampingan Penerimaan Pendanaan PKM Tahun 2026" yang diselenggarakan oleh PUSPRESMA PTMA (Pusat Prestasi Mahasiswa Perguruan Tinggi Muhammadiyah dan 'Aisyiyah). Kegiatan berlangsung pada pukul 07.00–14.40 WIB dan dihadiri oleh ${HADIR_DP}.`, null, null],
  ["6fdefb44-4703-47d6-a645-e24d7959879f", // 15/6 — menit diselaraskan 07.30–11.30
   `Melaksanakan penyerahan dan penandatanganan Surat Pengantar dari Universitas Muhammadiyah Makassar kepada SLB 1 Makassar sebagai izin pengambilan dataset, yang ditandatangani langsung oleh Kepala Sekolah SLB 1 Makassar. Kegiatan berlangsung pada pukul 07.30–11.30 WITA dan dihadiri oleh ${HADIR_SEMUA}.`, null, 240],
  ["ac905b43-2031-4b46-8acc-2c16569220ad", // 16/6 — menit diselaraskan 20.00–22.00
   `Mengikuti Monitoring dan Evaluasi (Monev) I yang diselenggarakan oleh Universitas Muhammadiyah Makassar secara daring untuk memantau progres dan mengevaluasi setiap tim PKM. Kegiatan berlangsung pada pukul 20.00–22.00 WITA dan dihadiri oleh Dosen Pendamping, Anggota 1, Anggota 2, Anggota 3, dan Anggota 4.`, null, 120],
  ["9590e958-ddae-4463-902c-1fc6fe4975d9", // 17/6
   `Melaksanakan pengambilan dataset di SLB 1 Makassar bersama para guru, dilanjutkan dengan pengolahan awal dataset yang diperoleh. Kegiatan berlangsung pada pukul 08.00–13.00 WITA dan dihadiri oleh ${HADIR_SEMUA}.`, null, null],
  ["461065f4-1d54-4664-8079-7fa2fc79753f", // 26/6 — sinkron keuangan Dataset Angka
   `Melaksanakan penyusunan dan anotasi dataset untuk pelatihan model kecerdasan buatan aplikasi penerjemah bahasa isyarat berbasis BISINDO, disertai pengadaan Dataset BISINDO kategori Angka dari mitra penyedia data. Kegiatan berlangsung di Cafe Zero pada pukul 13.00–16.00 WITA dan dihadiri oleh Anggota 1, Anggota 2, dan Anggota 4.`, null, null],
  ["d15cf35d-83da-4980-a7be-5677f60364d7", // 29/6 — sinkron GPU 3 jam + Dataset Kata 1
   `Melaksanakan pengolahan dataset serta pelatihan model kecerdasan buatan tahap awal menggunakan layanan sewa server GPU selama 3 jam, disertai pengadaan Dataset BISINDO kategori Kata 1. Kegiatan berlangsung di Cafe Zero pada pukul 13.30–18.30 WITA dan dihadiri oleh Ketua Tim, Anggota 1, Anggota 2, dan Anggota 4.`, null, null],
  ["6bc5013d-ad4b-4e78-9d2c-3a89479fa434", // 1/7 — menit diselaraskan 09.00–16.00
   `Mengikuti Monitoring dan Evaluasi (Monev) II yang diselenggarakan oleh Universitas Muhammadiyah Makassar untuk meninjau capaian program seluruh tim PKM penerima pendanaan beserta evaluasinya. Kegiatan berlangsung pada pukul 09.00–16.00 WITA dan dihadiri oleh ${HADIR_SEMUA}.`, null, 420],
  ["1d4b455f-da68-4e86-b7ae-e22ffd35b66a", // 2/7
   `Melaksanakan produksi video konten program untuk kebutuhan publikasi media sosial, berlokasi di kampus Universitas Muhammadiyah Makassar. Kegiatan berlangsung pada pukul 10.00–12.55 WITA dan dihadiri oleh ${HADIR_SEMUA}.`, null, null],
  ["7c13c1b4-b00a-412f-a058-9097a2f254e3", // 4/7 — sinkron keuangan ads 4/7
   `Melaksanakan pertemuan di kafe guna mengelola pemasangan iklan (ads) konten program pada akun Instagram tim, termasuk pembayaran biaya iklan periode berjalan. Kegiatan berlangsung pada pukul 11.00–16.10 WITA dan dihadiri oleh ${HADIR_SEMUA}.`, null, null],
  ["b60e122b-59b3-4328-981c-7f988e3539bc", // 6/7 — sinkron GPU 3 jam
   `Melaksanakan pengolahan dataset serta pelatihan model kecerdasan buatan menggunakan layanan sewa server GPU selama 3 jam untuk aplikasi penerjemah bahasa isyarat berbasis BISINDO. Kegiatan berlangsung pada pukul 13.00–18.00 WITA dan dihadiri oleh ${HADIR_SEMUA}.`, null, null],
  ["4ec80c19-3b58-4e18-86e6-14f221c18d49", // 7/7
   `Melaksanakan penyusunan dan anotasi dataset untuk pelatihan model kecerdasan buatan aplikasi penerjemah bahasa isyarat berbasis BISINDO, sekaligus peninjauan antarmuka aplikasi yang sedang dikembangkan. Kegiatan berlangsung di Cafe Zero pada pukul 13.30–18.00 WITA dan dihadiri oleh Ketua Tim, Anggota 1, Anggota 2, dan Anggota 3.`, null, null],
  ["dbcf14ee-005b-471f-9590-08646f441fd5", // 8/7
   `Melaksanakan pengolahan dataset untuk pelatihan model kecerdasan buatan aplikasi penerjemah bahasa isyarat berbasis BISINDO serta penyempurnaan materi presentasi (PPT). Kegiatan berlangsung pada pukul 15.00–18.00 WITA dan dihadiri oleh ${HADIR_SEMUA}.`, null, null],
  ["21f0e56d-26c3-48a5-9adc-33179a6c5c8d", // 14/7
   `Melaksanakan pemantauan dan evaluasi pengembangan aplikasi bersama Dosen Pendamping, meliputi pemeriksaan program serta tampilan antarmuka aplikasi yang sedang dibangun. Kegiatan berlangsung pada pukul 13.30–16.30 WITA dan dihadiri oleh ${HADIR_DP}.`, null, null],
  ["af9c1106-1755-44e4-afde-78b00554574e", // 16/7
   `Melaksanakan perbaikan aplikasi, penambahan fitur, serta penyusunan materi presentasi (PPT). Kegiatan berlangsung pada pukul 13.30–17.30 WITA dan dihadiri oleh ${HADIR_SEMUA}.`, null, null],
  ["b0142025-87c2-4709-a0ed-fb106446a94e", // 18/7
   `Melaksanakan pengolahan dataset untuk pelatihan model kecerdasan buatan aplikasi penerjemah bahasa isyarat berbasis BISINDO serta penyempurnaan materi presentasi (PPT). Kegiatan berlangsung di Cafe Zero pada pukul 14.00–18.00 WITA dan dihadiri oleh ${HADIR_SEMUA}.`, null, null],
  ["1a824acf-cb78-4e8f-ae51-65091dac38e4", // 22/7
   `Melaksanakan uji coba pertama bersama Dosen Fakultas Teknik Program Studi Informatika guna mengukur capaian pelatihan model serta memeriksa aplikasi untuk mengidentifikasi kebutuhan penyempurnaan. Kegiatan berlangsung pada pukul 13.00–16.00 WITA dan dihadiri oleh Ketua Tim, Anggota 1, dan Anggota 2.`, null, null],
  ["40f1019c-f137-4399-bcf2-620d093ee0c7", // 24/7 — sinkron Dataset Kata 2
   `Melaksanakan perbaikan program aplikasi di Student Center Universitas Muhammadiyah Makassar, disertai pengadaan Dataset BISINDO kategori Kata 2 dari mitra penyedia data. Kegiatan berlangsung pada pukul 12.00–17.00 WITA dan dihadiri oleh Ketua Tim, Anggota 1, Anggota 3, dan Anggota 4.`, null, null],
  ["e1e2f5c4-be1d-4090-a3d0-2a5087c79b7a", // 26/7 — sinkron GPU 5 jam; menit 240→300
   `Melaksanakan perbaikan program aplikasi dan penambahan dataset, disertai pelatihan model kecerdasan buatan menggunakan layanan sewa server GPU selama 5 jam. Kegiatan berlangsung di Cafe Makassar pada pukul 15.00–20.00 WITA dan dihadiri oleh Anggota 1, Anggota 2, dan Anggota 4.`, null, 300],
  ["7737018f-9fea-4731-ae9d-8aa6f970682a", // 27/7
   `Menghadiri Pertemuan Intensif PKM 2026 terkait pembahasan progres yang diselenggarakan oleh Fakultas Teknik Universitas Muhammadiyah Makassar dan diikuti oleh seluruh tim PKM Fakultas Teknik. Kegiatan berlangsung pada pukul 10.00–12.00 WITA dan dihadiri oleh Dosen Pendamping, Anggota 1, Anggota 2, Anggota 3, dan Anggota 4.`, null, null],
  ["838600a5-405d-4470-b248-82a46dcd67b3", // 28/7
   `Melaksanakan perbaikan aplikasi serta penyuntingan materi presentasi (PPT) yang akan digunakan pada Penilaian Kemajuan Pelaksanaan PKM (PKP2). Kegiatan berlangsung pada pukul 13.00–17.00 WITA dan dihadiri oleh ${HADIR_SEMUA}.`, null, null],
  ["7c02cefe-aaa6-4a58-9c57-3d772599b40e", // 30/7
   `Melaksanakan penandatanganan pencairan dana tahap pertama LLDIKTI Wilayah IX di Universitas Muhammadiyah Makassar. Kegiatan berlangsung pada pukul 10.00–12.00 WITA dan dihadiri oleh ${HADIR_SEMUA}.`, null, null],
  ["958a199c-51c7-4a62-b3e9-2ab5d6dd5225", // 31/7
   `Melaksanakan pertemuan tim untuk membahas progres aplikasi serta penyempurnaan materi presentasi (PPT) yang akan digunakan pada PKP2. Kegiatan berlangsung pada pukul 13.00–16.00 WITA dan dihadiri oleh Ketua Tim, Anggota 1, Anggota 2, dan Anggota 4.`, null, null],
  ["dfb18008-dbc0-4ed7-9be6-f3ae46a2ab0c", // 1/8
   `Melaksanakan pengambilan video gerakan bahasa isyarat sebagai bahan animasi penerjemah pada aplikasi yang sedang dikembangkan, berlokasi di Student Center Universitas Muhammadiyah Makassar. Kegiatan berlangsung pada pukul 13.00–17.00 WITA dan dihadiri oleh ${HADIR_SEMUA}.`, null, null],
  // ---- Agustus: deskripsi baru (sebelumnya kosong "-") ----
  ["8b921d41-ebb4-4dd3-b720-6eb791bb6c13", // 2/8, 240 mnt, 7 foto
   `Melaksanakan kurasi dan penyuntingan hasil rekaman video gerakan bahasa isyarat untuk diolah menjadi animasi penerjemah dalam aplikasi. Kegiatan berlangsung pada pukul 13.00–17.00 WITA dan dihadiri oleh ${HADIR_SEMUA}.`, null, null],
  ["44ca6c5d-ffd1-458c-9aa7-7a21f10697c6", // 3/8, 240 mnt
   `Melaksanakan integrasi animasi penerjemah ke dalam aplikasi serta penyesuaian tata letak antarmuka pengguna. Kegiatan berlangsung pada pukul 13.00–17.00 WITA dan dihadiri oleh Ketua Tim, Anggota 1, Anggota 2, dan Anggota 3.`, null, null],
  ["350b125c-15a9-4e8f-9c52-cd340d094e7c", // 5/8, 300 mnt
   `Melaksanakan penyempurnaan dataset serta pelatihan lanjutan model kecerdasan buatan untuk meningkatkan akurasi penerjemahan bahasa isyarat BISINDO. Kegiatan berlangsung pada pukul 13.00–18.00 WITA dan dihadiri oleh Ketua Tim, Anggota 1, Anggota 2, dan Anggota 4.`, null, null],
  ["7a682ffe-9d0b-4dd5-a26d-7c8b690920a2", // 6/8, 240 mnt
   `Melaksanakan pengujian internal fitur penerjemahan aplikasi serta pencatatan galat (bug) untuk ditindaklanjuti pada tahap perbaikan. Kegiatan berlangsung pada pukul 14.00–18.00 WITA dan dihadiri oleh Anggota 1, Anggota 2, Anggota 3, dan Anggota 4.`, null, null],
  ["40e93f4f-e4cb-420c-bf27-40aef21c0342", // 9/8, 420 mnt
   `Melaksanakan rapat koordinasi tim, penyusunan draf laporan kemajuan, serta perbaikan aplikasi berdasarkan hasil pengujian internal. Kegiatan berlangsung pada pukul 10.00–17.00 WITA dan dihadiri oleh ${HADIR_SEMUA}.`, null, null],
  ["eb96721c-6057-40fb-a939-d9352c2421f5", // 10/8, 300 mnt
   `Melaksanakan penyempurnaan antarmuka aplikasi serta perbaikan galat (bug) yang ditemukan pada pengujian sebelumnya. Kegiatan berlangsung pada pukul 13.00–18.00 WITA dan dihadiri oleh Ketua Tim, Anggota 1, dan Anggota 3.`, null, null],
  ["53517076-ea8c-4c77-a631-ec19ecd029e2", // 11/8, 360 mnt
   `Melaksanakan evaluasi hasil pelatihan model kecerdasan buatan serta penyelarasan dataset bersama Dosen Pendamping. Kegiatan berlangsung pada pukul 11.00–17.00 WITA dan dihadiri oleh ${HADIR_DP}.`, null, null],
  ["064233db-f5af-43dc-a61b-f13772bb985f", // 12/8, 300 mnt — sinkron keuangan map 12/8
   `Melaksanakan penyusunan laporan kemajuan beserta kelengkapan administrasinya, termasuk pengadaan map untuk pengarsipan berkas. Kegiatan berlangsung pada pukul 13.00–18.00 WITA dan dihadiri oleh Ketua Tim, Anggota 2, dan Anggota 3.`, null, null],
  ["f1de24d1-2d59-4a57-82ba-777a777d7723", // 14/8, 360 mnt
   `Melaksanakan penyempurnaan model kecerdasan buatan dan aplikasi sebagai persiapan pengujian tahap akhir. Kegiatan berlangsung pada pukul 11.00–17.00 WITA dan dihadiri oleh ${HADIR_SEMUA}.`, null, null],
  ["fc7bbc04-8deb-4683-abc8-993166b33b9f", // 15/8, 300 mnt — sinkron GPU 5 jam
   `Melaksanakan pelatihan model kecerdasan buatan tahap akhir menggunakan layanan sewa server GPU selama 5 jam, dilanjutkan validasi akurasi hasil penerjemahan. Kegiatan berlangsung pada pukul 13.00–18.00 WITA dan dihadiri oleh Ketua Tim, Anggota 1, dan Anggota 2.`, null, null],
  ["d132d497-2641-4b79-9af4-624299b75e51", // 18/8, 360 mnt
   `Melaksanakan uji coba menyeluruh aplikasi penerjemah bahasa isyarat BISINDO serta perbaikan akhir berdasarkan temuan pengujian. Kegiatan berlangsung pada pukul 11.00–17.00 WITA dan dihadiri oleh ${HADIR_SEMUA}.`, null, null],
  ["6d2479ba-bc0b-45dc-b53e-4b8797de6365", // 19/8, 420 mnt
   `Melaksanakan finalisasi laporan kemajuan serta penyusunan materi presentasi untuk PKP2. Kegiatan berlangsung pada pukul 10.00–17.00 WITA dan dihadiri oleh ${HADIR_SEMUA}.`, null, null],
  ["0d22308c-5a9d-4bcf-b6ed-d41e5e4a4fc2", // 20/8, 420 mnt — delta 3→2 (penyeimbang entri baru 20/6)
   `Melaksanakan penyempurnaan akhir dan pengunggahan laporan kemajuan, dilanjutkan gladi presentasi sebagai persiapan PKP2. Kegiatan berlangsung pada pukul 10.00–17.00 WITA dan dihadiri oleh ${HADIR_SEMUA}.`, 2, null],
];

/* Entri kegiatan BARU: pengadaan Dataset Huruf (20/6) — sinkron keuangan */
const KEGIATAN_BARU = [{
  tanggal: "2026-06-20",
  kegiatan: "Melaksanakan pengadaan dan verifikasi Dataset BISINDO kategori Huruf dari mitra penyedia data sebagai bahan pelatihan model kecerdasan buatan aplikasi penerjemah bahasa isyarat. Kegiatan berlangsung secara daring pada pukul 13.00–15.00 WITA dan ditangani oleh Ketua Tim, Anggota 1, dan Anggota 2.",
  capaian_delta: 1, waktu_menit: 120, foto_keys: [],
}];

/* ---------------- KEUANGAN: penyesuaian & entri baru ---------------- */
const KEUANGAN_UBAH = [
  ["9677551a-0039-4e98-8196-45520aece123", { item: "Pembayaran Iklan (Ads) Konten Pengenalan Program", satuan_suffix: "", jumlah: 1 }],
  ["13408a90-dd9a-476c-99bc-ac90ed544833", { item: "Langganan Canva Pro", satuan_suffix: "/Bulan" }],
  ["76731ae4-d5c6-4419-ab1a-ce5b36e84334", { item: "Pembelian Kuota Internet", satuan_suffix: "/Bulan" }],
  ["c86a11b9-1a86-4414-b9e7-34ac4c6bcc1f", { item: "Pembelian Bahan Bakar (Bensin)", satuan_suffix: "/Liter" }],
  ["89cbd44b-ab6b-4696-ac56-830dbd9a75df", { tanggal: "2026-06-20", item: "Pembelian Dataset BISINDO — Huruf", harga_satuan: 925000, satuan_suffix: "/Dataset", jumlah: 1 }],
  ["07b182ab-324e-4320-b959-24f5f83968a9", { item: "Pembayaran Iklan (Ads) Konten Program", satuan_suffix: "", jumlah: 1 }],
  ["abb01feb-39aa-4c5d-bba4-17d1dd3e569c", { item: "Pembelian Kuota Internet", satuan_suffix: "/Bulan" }],
  ["e49f5fd6-1579-43d8-afdc-119192b49462", { item: "Pembelian Bahan Bakar (Bensin)", satuan_suffix: "/Liter" }],
  ["eb4c04fb-6c0b-4ea4-ab6f-83c22fd05190", { tanggal: "2026-06-03", item: "Sewa Server Hosting VPS (3 Juni – 3 Oktober 2026)", harga_satuan: 300000, satuan_suffix: "/Bulan", jumlah: 4 }],
  ["df16e33d-9825-4d62-ab89-99766128ea01", { item: "Pembelian Kuota Internet", satuan_suffix: "/Bulan" }],
  ["a2619251-0168-4cee-8073-f5fdb0660def", { item: "Pembelian Bahan Bakar (Bensin)", satuan_suffix: "/Liter" }],
  ["3a3eb2f2-86a0-4a00-9b57-93312792c90f", { item: "Pembelian Map Berkas", satuan_suffix: "/Lembar" }],
];
const KEUANGAN_BARU = [
  { tanggal: "2026-06-26", item: "Pembelian Dataset BISINDO — Angka",  harga_satuan: 925000, satuan_suffix: "/Dataset", jumlah: 1 },
  { tanggal: "2026-06-29", item: "Pembelian Dataset BISINDO — Kata 1", harga_satuan: 925000, satuan_suffix: "/Dataset", jumlah: 1 },
  { tanggal: "2026-07-24", item: "Pembelian Dataset BISINDO — Kata 2", harga_satuan: 925000, satuan_suffix: "/Dataset", jumlah: 1 },
  { tanggal: "2026-06-29", item: "Sewa Server GPU — Pelatihan Model", harga_satuan: 90000, satuan_suffix: "/Jam", jumlah: 3 },
  { tanggal: "2026-07-06", item: "Sewa Server GPU — Pelatihan Model", harga_satuan: 90000, satuan_suffix: "/Jam", jumlah: 3 },
  { tanggal: "2026-07-26", item: "Sewa Server GPU — Pelatihan Model", harga_satuan: 90000, satuan_suffix: "/Jam", jumlah: 5 },
  { tanggal: "2026-08-15", item: "Sewa Server GPU — Pelatihan Model", harga_satuan: 90000, satuan_suffix: "/Jam", jumlah: 5 },
];

/* ---------------- eksekusi ---------------- */
let nKeg = 0;
for (const [id, teks, delta, menit] of KEGIATAN) {
  const set = ["kegiatan = $1"], vals = [teks];
  if (delta !== null) { set.push(`capaian_delta = $${vals.length + 1}`); vals.push(delta); }
  if (menit !== null) { set.push(`waktu_menit = $${vals.length + 1}`); vals.push(menit); }
  vals.push(id, USER);
  const r = await q(
    `UPDATE kegiatan SET ${set.join(", ")} WHERE id = $${vals.length - 1} AND user_id = $${vals.length} RETURNING id`, vals);
  if (!r.length) console.warn("  ! kegiatan tidak ketemu:", id);
  else { nKeg++; await q("DELETE FROM persetujuan WHERE jenis = 'kegiatan' AND target_id = $1", [id]); }
}
for (const e of KEGIATAN_BARU) {
  await q(
    `INSERT INTO kegiatan (id, user_id, tanggal, kegiatan, capaian_delta, waktu_menit, foto_keys, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [crypto.randomUUID(), USER, e.tanggal, e.kegiatan, e.capaian_delta, e.waktu_menit,
     JSON.stringify(e.foto_keys), new Date().toISOString()]);
  nKeg++;
}

let nKeu = 0;
for (const [id, p] of KEUANGAN_UBAH) {
  const cur = (await q("SELECT * FROM keuangan WHERE id = $1 AND user_id = $2", [id, USER]))[0];
  if (!cur) { console.warn("  ! keuangan tidak ketemu:", id); continue; }
  const e = { ...cur, ...p };
  e.total = Number(e.harga_satuan) * Number(e.jumlah);
  await q(
    `UPDATE keuangan SET tanggal = $1, item = $2, harga_satuan = $3, satuan_suffix = $4,
            jumlah = $5, total = $6 WHERE id = $7 AND user_id = $8`,
    [e.tanggal, e.item, e.harga_satuan, e.satuan_suffix, e.jumlah, e.total, id, USER]);
  await q("DELETE FROM persetujuan WHERE jenis = 'keuangan' AND target_id = $1", [id]);
  nKeu++;
}
for (const e of KEUANGAN_BARU) {
  await q(
    `INSERT INTO keuangan (id, user_id, tanggal, item, harga_satuan, satuan_suffix, jumlah, total, bukti_key, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '', $9)`,
    [crypto.randomUUID(), USER, e.tanggal, e.item, e.harga_satuan, e.satuan_suffix,
     e.jumlah, e.harga_satuan * e.jumlah, new Date().toISOString()]);
  nKeu++;
}

/* ---------------- ringkasan ---------------- */
const tot = await q(
  "SELECT COALESCE(SUM(total),0) AS t, COUNT(*) AS n FROM keuangan WHERE user_id = $1", [USER]);
const cap = await q(
  "SELECT COALESCE(SUM(capaian_delta),0) AS c, COUNT(*) AS n FROM kegiatan WHERE user_id = $1", [USER]);
const dana = await q(
  "SELECT nilai FROM pengaturan WHERE user_id = $1 AND kunci = 'dana_awal'", [USER]);
console.log(`Kegiatan diproses : ${nKeg} (43 diubah + 1 baru = total ${cap[0].n} entri, capaian ${cap[0].c}%)`);
console.log(`Keuangan diproses : ${nKeu} (12 diubah + 7 baru = total ${tot[0].n} entri)`);
console.log(`Total pengeluaran : Rp${Number(tot[0].t).toLocaleString("id-ID")}`);
console.log(`Dana awal         : Rp${Number(dana[0]?.nilai || 0).toLocaleString("id-ID")}`);
console.log(`Sisa dana         : Rp${(Number(dana[0]?.nilai || 0) - Number(tot[0].t)).toLocaleString("id-ID")}`);

