/** Ekspor PDF — rekap logbook siap cetak (pdfkit, tanpa dependensi native). */
import path from "node:path";
import PDFDocument from "pdfkit";
import * as store from "../storage.js";
import { getFileBuffer, compressForEmbed } from "../files.js";

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const fmtTgl = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
};
const fmtRp = (n) => "Rp" + Number(n || 0).toLocaleString("id-ID");
const fmtDur = (m) => (m >= 60 ? `${Math.floor(m / 60)} j ${m % 60} mnt` : `${m} mnt`);

// Palet warna — selaras dengan UI aplikasi (indigo) + warna aksen per metrik
const INDIGO = "#4f46e5";
const INDIGO_DARK = "#3730a3";
const INDIGO_BG = "#eef2ff";
const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#e2e8f0";
const ZEBRA = "#f8fafc";
const GREEN = "#059669";
const AMBER = "#d97706";
const ROSE = "#e11d48";
const SKY = "#0369a1";

export async function buildPdf(userId, namaTim = "") {
  // Ambil data + seluruh foto (dari cloud/lokal) lebih dulu, baru menggambar
  const [kegiatan, keuangan, danaAwalStr] = await Promise.all([
    store.listKegiatan(userId),
    store.listKeuangan(userId),
    store.getSetting(userId, "dana_awal", "0"),
  ]);
  const danaAwal = Number(danaAwalStr) || 0;

  const semuaKey = [
    ...kegiatan.flatMap((e) => (e.foto_keys || []).slice(0, 8)),
    ...keuangan.flatMap((e) => e.bukti_keys || []),
  ];
  const bufferMap = new Map();
  await Promise.all(
    [...new Set(semuaKey)].map(async (k) => {
      const ext = path.extname(k).toLowerCase();
      if (![".jpg", ".jpeg", ".png"].includes(ext)) return; // pdfkit hanya JPEG/PNG
      const buf = await getFileBuffer(k);
      // dikecilkan utk sematan dokumen — jaga total berkas < batas respons Vercel
      if (buf) bufferMap.set(k, await compressForEmbed(buf));
    })
  );

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 46, bufferPages: true });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = doc.page.width - 92; // lebar area konten
    const X = 46;

    const pengeluaran = keuangan.reduce((s, e) => s + e.total, 0);
    const capaian = kegiatan.length ? kegiatan[kegiatan.length - 1].capaian_total : 0;
    const totalMenit = kegiatan.reduce((s, e) => s + e.waktu_menit, 0);
    const sisaDana = danaAwal - pengeluaran;

    const pastikanRuang = (butuh) => {
      if (doc.y + butuh > doc.page.height - 64) doc.addPage();
    };

    // ================= Header (banner indigo dua lapis) =================
    doc.rect(0, 0, doc.page.width, 124).fill(INDIGO);
    doc.rect(0, 118, doc.page.width, 6).fill(INDIGO_DARK);
    // lingkaran dekoratif transparan di kanan atas
    doc.save().opacity(0.08).circle(doc.page.width - 60, 20, 70).fill("#ffffff")
      .circle(doc.page.width - 130, 95, 40).fill("#ffffff").restore();

    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(20)
      .text("LOGBOOK KEGIATAN & KEUANGAN", X, 30);
    doc.font("Helvetica").fontSize(11).opacity(0.92)
      .text(namaTim ? `Tim ${namaTim} · Rekap kegiatan & keuangan` : "Rekap kegiatan & keuangan tim",
        X, 58);
    // pill tanggal ekspor
    const tglStr = `Diekspor ${new Date().toLocaleDateString("id-ID",
      { day: "numeric", month: "long", year: "numeric" })}`;
    doc.opacity(1).fontSize(8.5);
    const pillW = doc.widthOfString(tglStr) + 20;
    doc.roundedRect(X, 82, pillW, 18, 9).fillOpacity(0.18).fill("#ffffff").fillOpacity(1);
    doc.fillColor("#ffffff").text(tglStr, X + 10, 87);
    doc.y = 146;

    // ================= Kartu ringkasan (aksen warna per metrik) =================
    const boks = [
      ["CAPAIAN TOTAL", `${capaian}%`, INDIGO],
      ["KEGIATAN", `${kegiatan.length} entri`, SKY],
      ["TOTAL WAKTU", fmtDur(totalMenit), AMBER],
      ["PENGELUARAN", fmtRp(pengeluaran), ROSE],
      ["DANA AWAL", fmtRp(danaAwal), MUTED],
      ["SISA DANA", fmtRp(sisaDana), sisaDana >= 0 ? GREEN : ROSE],
    ];
    const bw = (W - 20) / 3;
    const topY = doc.y;
    boks.forEach(([label, nilai, warna], i) => {
      const bx = X + (i % 3) * (bw + 10);
      const by = topY + Math.floor(i / 3) * 60;
      doc.roundedRect(bx, by, bw, 50, 8).fill(ZEBRA);
      doc.roundedRect(bx, by, bw, 50, 8).lineWidth(0.8).stroke(LINE);
      // aksen batang kiri berwarna
      doc.roundedRect(bx, by + 8, 3.5, 34, 2).fill(warna);
      doc.fillColor(MUTED).font("Helvetica").fontSize(7.5)
        .text(label, bx + 14, by + 11);
      doc.fillColor(warna).font("Helvetica-Bold").fontSize(14)
        .text(nilai, bx + 14, by + 24, { width: bw - 26 });
    });
    doc.y = topY + 2 * 60 + 10;

    // ================= Judul bagian (badge nomor + garis) =================
    const judulBagian = (nomor, teks) => {
      pastikanRuang(46);
      const jy = doc.y + 4;
      doc.roundedRect(X, jy, 22, 22, 6).fill(INDIGO);
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(11)
        .text(nomor, X, jy + 6, { width: 22, align: "center" });
      doc.fillColor(INDIGO_DARK).font("Helvetica-Bold").fontSize(13)
        .text(teks, X + 30, jy + 5);
      doc.moveTo(X, jy + 28).lineTo(X + W, jy + 28).lineWidth(1.4).stroke(INDIGO);
      doc.y = jy + 38;
    };

    // ================= Bagian 1: Kegiatan =================
    judulBagian("1", "LOGBOOK KEGIATAN");

    const BATAS_BAWAH = () => doc.page.height - 64; // sama dengan pastikanRuang

    for (const [i, e] of kegiatan.entries()) {
      // Ukur kebutuhan entri (judul+teks+foto) supaya tidak ada ruang kosong
      // besar: entri dipindah utuh HANYA bila muat di satu halaman penuh;
      // selebihnya cukup pastikan kepala entri + 1 baris foto muat.
      const fotos = (e.foto_keys || []).slice(0, 8).filter((k) => bufferMap.get(k));
      const fw = 88, fh = 66, gap = 8;
      const perBaris = Math.max(1, Math.floor((W - 22 + gap) / (fw + gap)));
      const barisFoto = Math.ceil(fotos.length / perBaris);
      doc.font("Helvetica").fontSize(9.5);
      const tinggiTeks = doc.heightOfString(e.kegiatan, { width: W - 22, lineGap: 1.6 });
      const butuh = 20 + tinggiTeks + 7 + (barisFoto ? barisFoto * (fh + gap) + 6 : 0) + 12;
      const muatSatuHalaman = doc.page.height - 64 - 46; // area konten halaman kosong
      pastikanRuang(Math.min(butuh, muatSatuHalaman));

      const y0 = doc.y;
      // badge nomor entri
      doc.circle(X + 8, y0 + 7, 8).fill(INDIGO_BG);
      doc.fillColor(INDIGO).font("Helvetica-Bold").fontSize(8)
        .text(String(i + 1), X, y0 + 3.5, { width: 16, align: "center" });
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(10.5)
        .text(fmtTgl(e.tanggal), X + 22, y0 + 1);
      // chip meta di kanan
      const meta = `+${e.capaian_delta}%  ·  total ${e.capaian_total}%  ·  ${fmtDur(e.waktu_menit)}`;
      doc.font("Helvetica").fontSize(8.5);
      const mw = doc.widthOfString(meta) + 16;
      doc.roundedRect(X + W - mw, y0 - 1, mw, 16, 8).fill(INDIGO_BG);
      doc.fillColor(INDIGO_DARK).text(meta, X + W - mw + 8, y0 + 3);
      doc.y = y0 + 20;

      doc.fillColor(INK).font("Helvetica").fontSize(9.5)
        .text(e.kegiatan, X + 22, doc.y, { width: W - 22, lineGap: 1.6 });
      doc.y += 7;

      // foto (dibariskan; pindah halaman dihitung dari posisi BARIS foto, bukan
      // doc.y — dulu memakai doc.y basi sehingga baris kedua tergambar melewati
      // batas bawah halaman → tampak "kosong" besar lalu lompat halaman)
      if (fotos.length) {
        if (doc.y + fh + 14 > BATAS_BAWAH()) doc.addPage();
        let fx = X + 22, fy = doc.y;
        for (const k of fotos) {
          try {
            const buf = bufferMap.get(k);
            if (!buf) continue;
            if (fx + fw > X + W) {
              fx = X + 22;
              fy += fh + gap;
              if (fy + fh > BATAS_BAWAH()) { doc.addPage(); fy = doc.y; }
            }
            // cover + clip → semua thumbnail berukuran PENUH 88×66 yang
            // seragam (bukan letterbox yang menyisakan ruang kosong dalam
            // bingkai saat fotonya potret)
            doc.save();
            doc.roundedRect(fx, fy, fw, fh, 4).clip();
            doc.image(buf, fx, fy, { cover: [fw, fh], align: "center", valign: "center" });
            doc.restore();
            doc.roundedRect(fx, fy, fw, fh, 4).lineWidth(0.8).stroke(LINE);
            fx += fw + gap;
          } catch {}
        }
        doc.y = fy + fh + 10;
      }
      doc.moveTo(X, doc.y).lineTo(X + W, doc.y).lineWidth(0.5).stroke(LINE);
      doc.y += 12;
    }
    if (kegiatan.length === 0) {
      doc.fillColor(MUTED).fontSize(9.5).text("Belum ada kegiatan.", X, doc.y);
      doc.y += 18;
    }

    // ================= Bagian 2: Keuangan =================
    pastikanRuang(130);
    judulBagian("2", "LOGBOOK KEUANGAN");

    const cols = [
      { t: "Tanggal", w: 0.16 }, { t: "Item", w: 0.34 },
      { t: "Harga satuan", w: 0.18, kanan: true }, { t: "Jml", w: 0.07, kanan: true },
      { t: "Total", w: 0.15, kanan: true }, { t: "Bukti", w: 0.10 },
    ];
    const drawHeader = () => {
      const hy = doc.y;
      doc.roundedRect(X, hy, W, 22, 4).fill(INDIGO);
      let cx = X;
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8);
      for (const c of cols) {
        doc.text(c.t.toUpperCase(), cx + 6, hy + 7,
          { width: c.w * W - 12, align: c.kanan ? "right" : "left" });
        cx += c.w * W;
      }
      doc.y = hy + 26;
    };
    drawHeader();

    let genap = false;
    for (const e of keuangan) {
      pastikanRuang(46);
      if (doc.y < 70) drawHeader(); // halaman baru → ulangi header
      const ry = doc.y;
      const vals = [fmtTgl(e.tanggal), e.item,
        `${fmtRp(e.harga_satuan)}${e.satuan_suffix || ""}`, String(e.jumlah), fmtRp(e.total)];
      // ukur tinggi baris dulu untuk zebra stripe
      doc.font("Helvetica").fontSize(8.5);
      let maxH = 12;
      vals.forEach((v, vi) => {
        const h = doc.heightOfString(v, { width: cols[vi].w * W - 12 });
        maxH = Math.max(maxH, h);
      });
      const buktiBufs = (e.bukti_keys || [])
        .map((k) => bufferMap.get(k))
        .filter(Boolean);
      // thumbnail 30pt + jarak 4pt, bertumpuk vertikal di kolom Bukti
      if (buktiBufs.length) maxH = Math.max(maxH, buktiBufs.length * 34 - 2);
      if (genap) doc.rect(X, ry - 1, W, maxH + 9).fill(ZEBRA);
      genap = !genap;

      let cx = X;
      doc.fillColor(INK).font("Helvetica").fontSize(8.5);
      vals.forEach((v, vi) => {
        if (vi === 4) doc.font("Helvetica-Bold"); // kolom Total ditebalkan
        doc.text(v, cx + 6, ry + 4,
          { width: cols[vi].w * W - 12, align: cols[vi].kanan ? "right" : "left" });
        if (vi === 4) doc.font("Helvetica");
        cx += cols[vi].w * W;
      });
      // bukti thumbnail — cover + clip agar seragam memenuhi kotaknya;
      // lebih dari satu bukti ditumpuk vertikal dalam kolom
      try {
        const bw = cols[5].w * W - 12, bh = 30;
        let by = ry + 3;
        for (const buf of buktiBufs) {
          doc.save();
          doc.roundedRect(cx + 4, by, bw, bh, 3).clip();
          doc.image(buf, cx + 4, by, { cover: [bw, bh] });
          doc.restore();
          doc.roundedRect(cx + 4, by, bw, bh, 3).lineWidth(0.6).stroke(LINE);
          by += bh + 4;
        }
      } catch {}
      doc.y = ry + maxH + 8;
      doc.moveTo(X, doc.y - 3).lineTo(X + W, doc.y - 3).lineWidth(0.4).stroke(LINE);
    }
    if (keuangan.length === 0) {
      doc.fillColor(MUTED).fontSize(9.5).text("Belum ada transaksi.", X + 6, doc.y + 2);
      doc.y += 20;
    }

    // ================= Kotak total pengeluaran =================
    pastikanRuang(64);
    const ty = doc.y + 8;
    const tw = 250;
    doc.roundedRect(X + W - tw, ty, tw, 52, 8).fill(INDIGO_BG);
    doc.roundedRect(X + W - tw, ty, tw, 52, 8).lineWidth(0.8).stroke(INDIGO);
    doc.fillColor(INDIGO_DARK).font("Helvetica").fontSize(8)
      .text("TOTAL PENGELUARAN", X + W - tw + 14, ty + 9);
    doc.fillColor(INDIGO_DARK).font("Helvetica-Bold").fontSize(14)
      .text(fmtRp(pengeluaran), X + W - tw + 14, ty + 20);
    doc.fillColor(MUTED).font("Helvetica").fontSize(7.5)
      .text(`Dana awal ${fmtRp(danaAwal)}  ·  Sisa dana ${fmtRp(sisaDana)}`,
        X + W - tw + 14, ty + 38);
    doc.y = ty + 60;

    // ================= Footer setiap halaman =================
    // PENTING: teks footer berada DI BAWAH margin bawah halaman — tanpa
    // penanganan, pdfkit "melanjutkan" teks itu ke HALAMAN BARU otomatis
    // (continueOnNewPage) sehingga dokumen dipenuhi halaman kosong di akhir.
    // Solusi: nolkan margin bawah sementara + matikan lineBreak.
    const range = doc.bufferedPageRange();
    for (let p = 0; p < range.count; p++) {
      doc.switchToPage(p);
      const mb = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const fy = doc.page.height - 40;
      doc.moveTo(X, fy - 6).lineTo(X + W, fy - 6).lineWidth(0.5).stroke(LINE);
      doc.fillColor(MUTED).font("Helvetica").fontSize(7.5)
        .text(namaTim ? `Logbook ${namaTim}` : "Logbook", X, fy,
          { width: W / 3, align: "left", lineBreak: false });
      doc.text(`Halaman ${p + 1} dari ${range.count}`, X, fy,
        { width: W, align: "center", lineBreak: false });
      doc.text(new Date().toLocaleDateString("id-ID"), X, fy,
        { width: W, align: "right", lineBreak: false });
      doc.page.margins.bottom = mb;
    }
    doc.end();
  });
}
