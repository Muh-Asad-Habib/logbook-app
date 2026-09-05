/**
 * Diagnosa PENGAMBIL FOTO SEMATAN & CACHE EKSPOR (tanpa database, tanpa server):
 *  - dimUntukJumlah: resolusi turun bertahap sesuai jumlah foto
 *  - ukuranGambar: header JPEG & PNG terbaca, format lain → null
 *  - extDariByte: jpeg/png/gif dikenali dari byte, cadangan dari nama
 *  - jalankanTerbatas: paralel dibatasi & hasil berurutan walau ada yang gagal
 *  - ambilFotoEmbed mode LOKAL: foto kecil di-upscale, dedup kunci ganda
 *  - sidik jari ekspor: berubah bila data berubah, stabil bila tidak
 *
 * Jalankan dari folder backend:  node diag-ekspor-foto.mjs
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import sharp from "sharp";

// Paksa mode LOKAL & folder unggahan sementara SEBELUM modul dimuat.
// Harus string KOSONG (bukan delete): config.js memuat .env dan hanya mengisi
// variabel yang masih undefined — kalau dihapus, kunci ImageKit dari .env
// akan masuk lagi dan uji ini diam-diam berjalan di mode cloud.
process.env.IMAGEKIT_PRIVATE_KEY = "";
process.env.IMAGEKIT_URL_ENDPOINT = "";
process.env.IMAGEKIT_PUBLIC_KEY = "";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lb-diag-"));

const { config } = await import("./src/config.js");
config.uploadsDir = tmp;
const { jalankanTerbatas } = await import("./src/files.js");
const { dimUntukJumlah, ukuranGambar, extDariByte, ambilFotoEmbed, bolehDiPdf } =
  await import("./src/export/foto.js");

let lulus = 0, gagal = 0;
const cek = (nama, kondisi, info = "") => {
  if (kondisi) { lulus++; console.log(`  OK    ${nama}`); }
  else { gagal++; console.log(`  GAGAL ${nama} ${info}`); }
};

try {
  console.log("== dimUntukJumlah ==");
  cek("≤60 foto → 1000px/85", dimUntukJumlah(60).dim === 1000 && dimUntukJumlah(1).mutu === 85);
  cek("61–150 → 800px/80", dimUntukJumlah(61).dim === 800 && dimUntukJumlah(150).mutu === 80);
  cek(">150 → 640px/76", dimUntukJumlah(151).dim === 640 && dimUntukJumlah(999).mutu === 76);

  console.log("\n== ukuranGambar & extDariByte ==");
  const jpg = await sharp({ create: { width: 320, height: 200, channels: 3, background: "#4f46e5" } }).jpeg().toBuffer();
  const png = await sharp({ create: { width: 64, height: 128, channels: 4, background: "#0000" } }).png().toBuffer();
  const uJ = ukuranGambar(jpg), uP = ukuranGambar(png);
  cek("JPEG 320×200 terbaca", uJ?.w === 320 && uJ?.h === 200, JSON.stringify(uJ));
  cek("PNG 64×128 terbaca", uP?.w === 64 && uP?.h === 128, JSON.stringify(uP));
  cek("buffer acak → null", ukuranGambar(Buffer.from("bukan gambar sama sekali, sungguh")) === null);
  cek("extDariByte jpeg/png", extDariByte(jpg) === "jpeg" && extDariByte(png) === "png");
  cek("extDariByte gif dari byte", extDariByte(Buffer.from("GIF89a")) === "gif");
  cek("extDariByte cadangan nama .jpg → jpeg", extDariByte(Buffer.alloc(0), "x.jpg") === "jpeg");
  cek("bolehDiPdf: jpeg/png ya, gif tidak", bolehDiPdf(jpg) && bolehDiPdf(png) && !bolehDiPdf(Buffer.from("GIF89a")));

  console.log("\n== jalankanTerbatas ==");
  let aktif = 0, puncak = 0;
  const hasil = await jalankanTerbatas([1, 2, 3, 4, 5, 6, 7, 8], 3, async (x) => {
    aktif++; puncak = Math.max(puncak, aktif);
    await new Promise((r) => setTimeout(r, 15 + (x % 3) * 10));
    aktif--;
    if (x === 5) throw new Error("sengaja");
    return x * 2;
  });
  cek("paralel tidak melebihi 3", puncak <= 3 && puncak >= 2, String(puncak));
  cek("hasil berurutan, yang gagal → undefined",
    hasil.length === 8 && hasil[0] === 2 && hasil[3] === 8 && hasil[4] === undefined && hasil[7] === 16,
    JSON.stringify(hasil));
  cek("daftar kosong → []", (await jalankanTerbatas([], 4, async () => 1)).length === 0);

  console.log("\n== ambilFotoEmbed (mode lokal) ==");
  const kecil = await sharp({ create: { width: 240, height: 180, channels: 3, background: "#db2777" } }).jpeg().toBuffer();
  const besar = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: "#0ea5e9" } }).jpeg().toBuffer();
  fs.writeFileSync(path.join(tmp, "kecil.jpg"), kecil);
  fs.writeFileSync(path.join(tmp, "besar.jpg"), besar);
  fs.writeFileSync(path.join(tmp, "tegak.png"), png);
  const peta = await ambilFotoEmbed(["kecil.jpg", "besar.jpg", "kecil.jpg", "tegak.png", "hilang.jpg"], { dim: 1000, mutu: 85 });
  cek("kunci ganda disatukan, yang hilang dilewati", peta.size === 3, String(peta.size));
  const k = peta.get("kecil.jpg"), b = peta.get("besar.jpg"), t = peta.get("tegak.png");
  cek("foto kecil di-upscale (≥ 700px)", k && Math.max(ukuranGambar(k.buffer).w, ukuranGambar(k.buffer).h) >= 700,
    JSON.stringify(ukuranGambar(k?.buffer)));
  cek("dimensi asli foto kecil dilaporkan 240×180 (rasio tampil)", k?.w === 240 && k?.h === 180);
  cek("foto besar diturunkan ke ≤ 1000px", b && Math.max(ukuranGambar(b.buffer).w, ukuranGambar(b.buffer).h) <= 1000,
    JSON.stringify(ukuranGambar(b?.buffer)));
  cek("PNG tetap PNG", t && extDariByte(t.buffer) === "png");

  console.log("\n== sidik jari cache ekspor ==");
  const sidik = (keg, keu, dana, nama) => {
    const h = crypto.createHash("sha256");
    h.update("v").update("|").update(nama).update(JSON.stringify(dana));
    for (const e of keg) h.update(JSON.stringify([e.id, e.tanggal, e.kegiatan, e.capaian_delta, e.waktu_menit, e.foto_keys]));
    for (const e of keu) h.update(JSON.stringify([e.id, e.item, e.total, e.sumber, e.kategori, e.bukti_keys]));
    return h.digest("hex").slice(0, 32);
  };
  const keg = [{ id: "a", tanggal: "2026-07-01", kegiatan: "x", capaian_delta: 5, waktu_menit: 60, foto_keys: ["f1"] }];
  const keu = [{ id: "b", item: "y", total: 1000, sumber: "belmawa", kategori: "bahan", bukti_keys: [] }];
  const s1 = sidik(keg, keu, { belmawa: 1 }, "Tim");
  cek("stabil bila data sama", s1 === sidik(keg, keu, { belmawa: 1 }, "Tim"));
  cek("berubah bila foto ditambah", s1 !== sidik([{ ...keg[0], foto_keys: ["f1", "f2"] }], keu, { belmawa: 1 }, "Tim"));
  cek("berubah bila kategori belanja diubah", s1 !== sidik(keg, [{ ...keu[0], kategori: "sewa" }], { belmawa: 1 }, "Tim"));
  cek("berubah bila dana diubah", s1 !== sidik(keg, keu, { belmawa: 2 }, "Tim"));
  cek("berubah bila nama tim diubah (nama berkas)", s1 !== sidik(keg, keu, { belmawa: 1 }, "Tim B"));

  console.log(`\n== HASIL: ${lulus} lulus, ${gagal} gagal ==`);
} catch (err) {
  console.error("ERROR:", err);
  gagal++;
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(gagal ? 1 : 0);
}




