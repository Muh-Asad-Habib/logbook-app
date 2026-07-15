 /** Ekspor PDF — rekap logbook siap cetak (pdfkit, tanpa dependensi native). */
import path from "node:path";
import PDFDocument from "pdfkit";
import * as store from "../storage.js";
import { getFileBuffer } from "../files.js";

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const fmtTgl = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
};
const fmtRp = (n) => "Rp" + Number(n || 0).toLocaleString("id-ID");
const fmtDur = (m) => (m >= 60 ? `${Math.floor(m / 60)} j ${m % 60} mnt` : `${m} mnt`);

const INDIGO = "#4f46e5";
const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#e2e8f0";

export async function buildPdf(userId) {
  // Ambil data + seluruh foto (dari cloud/lokal) lebih dulu, baru menggambar
  const [kegiatan, keuangan, danaAwalStr] = await Promise.all([
    store.listKegiatan(userId),
    store.listKeuangan(userId),
    store.getSetting(userId, "dana_awal", "0"),
  ]);
  const danaAwal = Number(danaAwalStr) || 0;

  const semuaKey = [
    ...kegiatan.flatMap((e) => (e.foto_keys || []).slice(0, 8)),
    ...keuangan.map((e) => e.bukti_key).filter(Boolean),
  ];
  const bufferMap = new Map();
  await Promise.all(
    [...new Set(semuaKey)].map(async (k) => {
      const ext = path.extname(k).toLowerCase();
      if (![".jpg", ".jpeg", ".png"].includes(ext)) return; // pdfkit hanya JPEG/PNG
      const buf = await getFileBuffer(k);
      if (buf) bufferMap.set(k, buf);
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

    const pastikanRuang = (butuh) => {
      if (doc.y + butuh > doc.page.height - 60) doc.addPage();
    };

    // ================= Header =================
    doc.rect(0, 0, doc.page.width, 118).fill(INDIGO);
    doc.fill("#ffffff").font("Helvetica-Bold").fontSize(19)
      .text("LOGBOOK KEGIATAN DAN KEUANGAN", X, 34);
    doc.font("Helvetica").fontSize(10.5).opacity(0.85)
      .text("Rekap kegiatan & keuangan tim", X, 62);
    doc.opacity(1).fontSize(8.5)
      .text(`Diekspor otomatis · ${new Date().toLocaleDateString("id-ID",
        { day: "numeric", month: "long", year: "numeric" })}`, X, 80);
    doc.y = 140;

    // ================= Ringkasan =================
    const boks = [
      ["Capaian total", `${capaian}%`],
      ["Kegiatan", `${kegiatan.length} entri`],
      ["Total waktu", fmtDur(totalMenit)],
      ["Pengeluaran", fmtRp(pengeluaran)],
      ["Dana awal", fmtRp(danaAwal)],
      ["Sisa dana", fmtRp(danaAwal - pengeluaran)],
    ];
    const bw = (W - 20) / 3;
    boks.forEach(([label, nilai], i) => {
      const bx = X + (i % 3) * (bw + 10);
      const by = doc.y + Math.floor(i / 3) * 58;
      doc.roundedRect(bx, by, bw, 48, 8).lineWidth(0.8).stroke(LINE);
      doc.fill(MUTED).font("Helvetica").fontSize(7.5)
        .text(label.toUpperCase(), bx + 12, by + 10);
      doc.fill(INK).font("Helvetica-Bold").fontSize(13)
        .text(nilai, bx + 12, by + 22, { width: bw - 24 });
    });
    doc.y += 2 * 58 + 8;

    // ================= Bagian 1: Kegiatan =================
    doc.fill(INDIGO).font("Helvetica-Bold").fontSize(13)
      .text("1. LOGBOOK KEGIATAN", X, doc.y);
    doc.moveTo(X, doc.y + 4).lineTo(X + W, doc.y + 4).lineWidth(1.2).stroke(INDIGO);
    doc.y += 16;

    for (const [i, e] of kegiatan.entries()) {
      pastikanRuang(80);
      const y0 = doc.y;
      doc.fill(INDIGO).font("Helvetica-Bold").fontSize(10)
        .text(`${i + 1}. ${fmtTgl(e.tanggal)}`, X, y0);
      doc.fill(MUTED).font("Helvetica").fontSize(8.5)
        .text(`+${e.capaian_delta}%  ·  total ${e.capaian_total}%  ·  ${fmtDur(e.waktu_menit)}`,
          X + 150, y0 + 1);
      doc.y = y0 + 15;
      doc.fill(INK).font("Helvetica").fontSize(9.5)
        .text(e.kegiatan, X, doc.y, { width: W, lineGap: 1.5 });
      doc.y += 6;

      // foto (maks 4 per baris)
      const fotos = e.foto_keys.slice(0, 8);
      if (fotos.length) {
        const fw = 88, fh = 66, gap = 8;
        let fx = X, fy = doc.y;
        pastikanRuang(fh + 14);
        fy = doc.y;
        for (const k of fotos) {
          try {
            const buf = bufferMap.get(k);
            if (!buf) continue;
            if (fx + fw > X + W) { fx = X; fy += fh + gap; pastikanRuang(fh + 14); if (doc.y > fy) fy = doc.y; }
            doc.image(buf, fx, fy, { fit: [fw, fh], align: "center", valign: "center" });
            doc.roundedRect(fx, fy, fw, fh, 4).lineWidth(0.6).stroke(LINE);
            fx += fw + gap;
          } catch {}
        }
        doc.y = fy + fh + 10;
      }
      doc.moveTo(X, doc.y).lineTo(X + W, doc.y).lineWidth(0.5).stroke(LINE);
      doc.y += 10;
    }
    if (kegiatan.length === 0) {
      doc.fill(MUTED).fontSize(9.5).text("Belum ada kegiatan.", X, doc.y);
      doc.y += 18;
    }

    // ================= Bagian 2: Keuangan =================
    pastikanRuang(120);
    doc.fill(INDIGO).font("Helvetica-Bold").fontSize(13)
      .text("2. LOGBOOK KEUANGAN", X, doc.y + 6);
    doc.moveTo(X, doc.y + 4).lineTo(X + W, doc.y + 4).lineWidth(1.2).stroke(INDIGO);
    doc.y += 16;

    // header tabel
    const cols = [
      { t: "Tanggal", w: 0.16 }, { t: "Item", w: 0.34 }, { t: "Harga satuan", w: 0.18 },
      { t: "Jml", w: 0.07 }, { t: "Total", w: 0.15 }, { t: "Bukti", w: 0.10 },
    ];
    const drawHeader = () => {
      const hy = doc.y;
      doc.rect(X, hy, W, 20).fill("#eef2ff");
      let cx = X;
      doc.fill(INDIGO).font("Helvetica-Bold").fontSize(8);
      for (const c of cols) {
        doc.text(c.t.toUpperCase(), cx + 6, hy + 6, { width: c.w * W - 10 });
        cx += c.w * W;
      }
      doc.y = hy + 24;
    };
    drawHeader();

    for (const e of keuangan) {
      pastikanRuang(46);
      if (doc.y < 70) drawHeader(); // halaman baru → ulangi header
      const ry = doc.y;
      const vals = [fmtTgl(e.tanggal), e.item,
        `${fmtRp(e.harga_satuan)}${e.satuan_suffix || ""}`, String(e.jumlah), fmtRp(e.total)];
      let cx = X;
      doc.fill(INK).font("Helvetica").fontSize(8.5);
      let maxH = 12;
      vals.forEach((v, vi) => {
        const cw = cols[vi].w * W - 10;
        const h = doc.heightOfString(v, { width: cw });
        maxH = Math.max(maxH, h);
        doc.text(v, cx + 6, ry + 4, { width: cw });
        cx += cols[vi].w * W;
      });
      // bukti thumbnail
      try {
        if (e.bukti_key) {
          const buf = bufferMap.get(e.bukti_key);
          if (buf) {
            doc.image(buf, cx + 4, ry + 3, { fit: [cols[5].w * W - 12, 30] });
            maxH = Math.max(maxH, 32);
          }
        }
      } catch {}
      doc.y = ry + maxH + 8;
      doc.moveTo(X, doc.y - 3).lineTo(X + W, doc.y - 3).lineWidth(0.4).stroke(LINE);
    }

    pastikanRuang(30);
    doc.font("Helvetica-Bold").fontSize(9.5).fill(INK)
      .text(`TOTAL PENGELUARAN: ${fmtRp(pengeluaran)}`, X, doc.y + 4, { width: W, align: "right" });
    doc.font("Helvetica").fontSize(8.5).fill(MUTED)
      .text(`Dana awal ${fmtRp(danaAwal)}  ·  Sisa dana ${fmtRp(danaAwal - pengeluaran)}`,
        X, doc.y + 4, { width: W, align: "right" });

    // nomor halaman
    const range = doc.bufferedPageRange();
    for (let p = 0; p < range.count; p++) {
      doc.switchToPage(p);
      doc.fill(MUTED).font("Helvetica").fontSize(7.5)
        .text(`Halaman ${p + 1} dari ${range.count}`, X, doc.page.height - 36,
          { width: W, align: "center" });
    }
    doc.end();
  });
}

