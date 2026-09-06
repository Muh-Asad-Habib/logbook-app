# Perlindungan repo dan deployment

- `.gitignore` menjaga berkas lokal agar tidak ikut staging biasa; `.vercelignore` mengatur upload CLI Vercel secara terpisah.
- `.env`, private key, database, unggahan, arsip, keluaran tes, dokumen pribadi, dan metadata editor tidak boleh masuk repo. Template ekspor anonim dan ikon publik adalah aset aplikasi yang disengaja.
- `tools/check-repo.mjs --secrets` memeriksa **isi index Git**, bukan hanya working tree. Pemindai Gitleaks wajib tersedia melalui PATH, `GITLEAKS_PATH`, atau lokasi alat audit lokal pada Windows. Nilai temuan tidak ditampilkan.
- Aktifkan hook setelah clone: `git config core.hooksPath .githooks`. Hook pre-commit memeriksa privasi/rahasia; hook commit-msg menolak atribusi bot Copilot sesuai kebijakan pemilik repo. Hook lokal dapat dilewati, sehingga pemeriksaan sebelum push tetap diperlukan.
- Jalankan `npm run check:repo` sebelum commit/push dan Gitleaks pada seluruh riwayat untuk audit berkala. Tidak ada pemindai yang menjamin mendeteksi semua bentuk data pribadi; tetap tinjau diff dan aset biner.

## Pembersihan riwayat

Riwayat diperiksa, catatan lokal `vv.txt` dihapus dari commit, metadata penulis template DOCX dianonimkan tanpa mengubah isi tabel, dan atribusi Copilot dihapus. Author/committer manusia tetap dipertahankan. Temuan token pada dokumentasi lama terverifikasi sebagai placeholder; contoh lama diperbaiki agar memakai variabel lingkungan. Cadangan riwayat disimpan secara lokal **di luar repo**, bukan branch/tag cadangan yang dapat ter-push.

Riwayat yang ditulis ulang mengubah hash commit. Clone lama harus diselaraskan dengan riwayat baru; jangan merge atau push ulang riwayat lama. GitHub dapat memerlukan waktu memperbarui cache kontributor. Force push tidak dapat menghapus salinan yang sudah berada di fork, clone pihak lain, atau cache penyedia.

## Bekerja tanpa laptop menyala

Konfigurasi Vercel menjalankan tes pradeploy dan build di cloud. **Setelah unggahan kode selesai**, proses build/deployment dan hosting tidak membutuhkan laptop lokal. Penyuntingan file melalui sesi IDE serta upload yang belum selesai tetap membutuhkan laptop dan koneksi. Jika tes cloud gagal, deployment baru tidak menggantikan versi produksi yang sehat.
