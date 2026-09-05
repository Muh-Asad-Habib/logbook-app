# Pengetahuan PKM untuk Asisten Logbook

Diperbarui: 5 September 2026.

## Cara kerja

Ini **retrieval lokal (RAG ringan), bukan pelatihan ulang model Ollama**. Ringkasan faktual dari sumber resmi disimpan di `backend/src/ai/pkm-knowledge.js`. Indeks kata kunci dimuat sekali; setiap pertanyaan memilih paling banyak enam potongan (sekitar 4.800 karakter) sesuai tahun/skema. PDF tidak diunduh saat pengguna mengirim pertanyaan. Lama keseluruhan jawaban tetap bergantung pada model dan server Ollama.

Data angka tim dihitung oleh kode, bukan oleh model. Rujukan yang dipilih server dikembalikan terpisah dari teks model dan dapat dibuka pada jawaban AI. Daftar tersebut menunjukkan bahan rujukan yang tersedia bagi jawaban, bukan jaminan bahwa setiap kalimat model pasti benar.

## Sumber yang telah diperiksa

Nomor halaman di indeks merujuk **urutan fisik halaman PDF**, bukan nomor cetak yang bisa berulang dalam buku gabungan.

| Tahun | Sumber resmi dan halaman ringkasan awal |
|---|---|
| 2022 | [Penawaran/panduan resmi](https://simbelmawa.kemdiktisaintek.go.id/portal/penawaran-program-kreativitas-mahasiswa-tahun-2022/), buku Penjelasan Umum, halaman PDF 10 |
| 2023 | [Pedoman resmi](https://simbelmawa.kemdiktisaintek.go.id/portal/pedoman-pkm-tahun-2023-diktiridtek/), Pedoman Umum, halaman PDF 11 |
| 2024 | [Panduan resmi](https://simbelmawa.kemdiktisaintek.go.id/portal/unduh/panduan-pkm-2024/), Panduan Umum, halaman PDF 10 |
| 2025 | [Panduan resmi](https://simbelmawa.kemdiktisaintek.go.id/portal/unduh/panduan-pkm-2025/), dokumen Google Drive **yang ditautkan portal**, Panduan Umum versi pembaruan, halaman PDF 9 |
| 2026 | [Panduan resmi](https://simbelmawa.kemdiktisaintek.go.id/portal/unduh/panduan-pkm-2026/), buku gabungan 411 halaman; halaman PDF 8–11, 47–48, 166, 204–205, 208–209 |

Arsip asli yang diunduh untuk pemeriksaan berada di `artifacts/pkm-sources/` dan tidak dimasukkan ke Git. Untuk arsip 2022–2024, tautan pada portal lama memakai domain `simbelmawa.kemdikbud.go.id`; dokumen berhasil diperiksa melalui path yang sama pada domain resmi baru `simbelmawa.kemdiktisaintek.go.id`.

Cakupan ringkasan: kriteria/perubahan tahunan 2022–2026; pengenalan sepuluh skema 2026; luaran; media sosial; RAB K/PM/PI 2026; beberapa larangan belanja dan struktur laporan PM 2026. **Belum merupakan salinan atau pembahasan lengkap setiap juknis, lampiran, surat revisi, kontrak, PKP2, dan PIMNAS lima tahun.** Detail yang tidak masuk indeks harus dinyatakan belum diverifikasi, bukan dilengkapi dari ingatan model.

Contoh perbedaan yang penting: rentang pendanaan RE/RSH/K/PM/PI dalam tabel umum 2022 adalah Rp5–7 juta, 2023/2024 Rp6–10 juta, 2025 Rp5–8 juta, dan 2026 Rp6–8 juta. Angka tersebut tidak boleh diterapkan lintas tahun tanpa memeriksa dokumen terkait.

## Skema untuk semua tim dampingan

Buka **Profil → Profil & rujukan PKM**:

- Akun tim menetapkan skema, tahun pelaksanaan, dan judul sesuai proposal/surat pendanaan.
- Pendamping dapat memilih setiap tim yang ditugaskan untuk memeriksa profilnya; pendamping tidak mengubah metadata tim lain.
- Server tetap memeriksa penugasan pada setiap permintaan. Profil dan data tim tidak dicache sebagai jawaban bersama lintas akun.
- Sistem hanya mencari kode eksplisit seperti `PKM-PM` pada judul/nama/catatan. Ini **indikasi yang perlu konfirmasi**, bukan klasifikasi otomatis dari nama usaha, gambar, atau jenis belanja.
- `dikonfirmasi_tim` berarti ditetapkan pengguna, **bukan verifikasi surat pendanaan oleh server**. Tanpa skema/tahun yang cukup, AI tidak boleh mengklaim tim pasti masuk skema tertentu.

Metadata disimpan sebagai satu JSON pada pengaturan `pkm_profil`; tidak memerlukan migrasi tabel. `GET /api/ai/profil-pkm?tim=...` mengikuti akses tim; `PUT /api/ai/profil-pkm` khusus pemilik akun tim.

## Basis persentase dan kehati-hatian

Statistik aplikasi menghitung persentase transaksi kategori dari **Belmawa yang diterima**. Tabel RAB dalam panduan 2026 yang diperiksa menyebut **jumlah dana yang diusulkan**, dengan sumber Belmawa/PT/instansi lain. Dua basis ini tidak otomatis identik. Prompt lama yang menyatakan batas PKM selalu dari Belmawa telah dihapus.

AI tidak boleh memvonis transaksi melanggar/aman hanya dari persentase statistik, tanpa skema, tahun, RAB yang disahkan, serta bukti terkait. Kategori belanja juga bukan izin otomatis membiayai barang/jasa. Perubahan ini tidak mengubah perhitungan atau isi transaksi yang sudah tersimpan; model diberi batas penafsiran yang lebih tepat.

## Memperbarui pengetahuan

1. Ambil panduan/surat revisi dari portal penerbit resmi; pastikan tahun dan skemanya.
2. Baca dokumen, bukan hanya cuplikan mesin pencari. Catat URL dan halaman fisik PDF.
3. Tambahkan ringkasan faktual dengan `tahun`, `skema`, `halaman`, serta sumber yang tepat. Jangan menyalin aturan tahun lain sebagai default.
4. Tambahkan tes untuk perbedaan aturan dan hal yang tidak boleh digeneralisasi.
5. Jalankan `npm run test:pradeploy`, build, dan audit browser sebelum menerbitkan.

Tes `tools/test-pkm.mjs` memakai store/model tiruan serta server lokal; tidak membaca `.env`, tidak mengubah database, dan tidak memanggil Ollama. Tes ini memeriksa pemilihan tahun/skema, indikasi tanpa tebakan nama, basis angka, penyimpanan per tim, dan penolakan akses pendamping ke tim yang tidak ditugaskan.

