/** Ekspor Excel — rekap kegiatan & keuangan (exceljs). */
import ExcelJS from "exceljs";
import * as store from "../storage.js";

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const fmtTgl = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
};

// Palet warna — selaras dengan UI aplikasi
const C = {
  indigo: "FF4F46E5",
  indigoDark: "FF3730A3",
  indigoBg: "FFEEF2FF",
  zebra: "FFF8FAFC",
  white: "FFFFFFFF",
  ink: "FF0F172A",
  muted: "FF64748B",
  line: "FFE2E8F0",
  green: "FF059669",
  greenBg: "FFECFDF5",
  rose: "FFE11D48",
  roseBg: "FFFFF1F2",
  amberBg: "FFFFFBEB",
};

const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const tipis = { style: "thin", color: { argb: C.line } };
const BORDER = { top: tipis, left: tipis, bottom: tipis, right: tipis };

/** Baris judul besar di atas tabel (merge sel + banner indigo). */
function judulSheet(ws, teks, sub, lebar) {
  ws.mergeCells(1, 1, 1, lebar);
  const j = ws.getCell(1, 1);
  j.value = teks;
  j.font = { bold: true, size: 15, color: { argb: C.white } };
  j.fill = fill(C.indigo);
  j.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 30;
  ws.mergeCells(2, 1, 2, lebar);
  const s = ws.getCell(2, 1);
  s.value = sub;
  s.font = { size: 9, color: { argb: C.white } };
  s.fill = fill(C.indigoDark);
  s.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(2).height = 16;
  ws.addRow([]); // jarak
}

/** Style baris header tabel. */
function styleHeader(row) {
  row.eachCell((c) => {
    c.fill = fill(C.indigo);
    c.font = { bold: true, size: 10, color: { argb: C.white } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = BORDER;
  });
  row.height = 24;
}

/** Zebra stripe + border untuk baris data. */
function styleData(row, genap) {
  row.eachCell({ includeEmpty: true }, (c) => {
    c.border = BORDER;
    if (genap) c.fill = fill(C.zebra);
    if (!c.alignment) c.alignment = { vertical: "middle" };
  });
  if (!row.height || row.height < 18) row.height = 18;
}

export async function buildXlsx(userId, namaTim = "") {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Logbook Amerta Sign";
  wb.created = new Date();

  const [kegiatan, keuangan, danaAwalStr] = await Promise.all([
    store.listKegiatan(userId),
    store.listKeuangan(userId),
    store.getSetting(userId, "dana_awal", "0"),
  ]);
  const danaAwal = Number(danaAwalStr) || 0;
  const pengeluaran = keuangan.reduce((s, e) => s + e.total, 0);
  const capaian = kegiatan.length ? kegiatan[kegiatan.length - 1].capaian_total : 0;
  const totalMenit = kegiatan.reduce((s, e) => s + e.waktu_menit, 0);
  const sisaDana = danaAwal - pengeluaran;
  const tglEkspor = new Date().toLocaleDateString("id-ID",
    { day: "numeric", month: "long", year: "numeric" });
  const sub = `${namaTim ? `Tim ${namaTim} · ` : ""}Diekspor otomatis · ${tglEkspor}`;

  // ================= Sheet 1: Ringkasan (dashboard mini) =================
  const s0 = wb.addWorksheet("Ringkasan", {
    properties: { tabColor: { argb: C.indigo } },
    views: [{ showGridLines: false }],
  });
  s0.columns = [{ width: 3 }, { width: 30 }, { width: 26 }, { width: 3 }];
  judulSheet(s0, "RINGKASAN LOGBOOK", sub, 4);

  const metrik = [
    ["Capaian total", `${capaian}%`, C.indigoBg, C.indigoDark],
    ["Jumlah kegiatan", `${kegiatan.length} entri`, C.indigoBg, C.indigoDark],
    ["Total waktu", totalMenit >= 60
      ? `${Math.floor(totalMenit / 60)} jam ${totalMenit % 60} menit` : `${totalMenit} menit`,
      C.amberBg, C.ink],
    ["Jumlah transaksi belanja", `${keuangan.length} transaksi`, C.amberBg, C.ink],
    ["Dana awal", danaAwal, C.zebra, C.ink],
    ["Total pengeluaran", pengeluaran, C.roseBg, C.rose],
    ["Sisa dana", sisaDana, sisaDana >= 0 ? C.greenBg : C.roseBg,
      sisaDana >= 0 ? C.green : C.rose],
  ];
  metrik.forEach(([label, nilai, bg, warna]) => {
    const r = s0.addRow(["", label, nilai, ""]);
    const cl = r.getCell(2), cv = r.getCell(3);
    cl.font = { bold: true, size: 10, color: { argb: C.muted } };
    cv.font = { bold: true, size: 12, color: { argb: warna } };
    cl.fill = fill(bg); cv.fill = fill(bg);
    cl.border = BORDER; cv.border = BORDER;
    cl.alignment = { vertical: "middle", indent: 1 };
    cv.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
    if (typeof nilai === "number") cv.numFmt = '"Rp"#,##0';
    r.height = 26;
  });

  // ================= Sheet 2: Kegiatan =================
  const s1 = wb.addWorksheet("Kegiatan", {
    properties: { tabColor: { argb: "FF0369A1" } },
    views: [{ state: "frozen", ySplit: 4 }],
  });
  s1.columns = [
    { key: "no", width: 5 },
    { key: "tgl", width: 18 },
    { key: "keg", width: 64 },
    { key: "cd", width: 15 },
    { key: "ct", width: 15 },
    { key: "wm", width: 14 },
    { key: "jf", width: 12 },
  ];
  judulSheet(s1, "LOGBOOK KEGIATAN", sub, 7);
  const h1 = s1.addRow(["No", "Tanggal", "Kegiatan", "Capaian entri (%)",
    "Capaian total (%)", "Waktu (menit)", "Jumlah foto"]);
  styleHeader(h1);
  kegiatan.forEach((e, i) => {
    const r = s1.addRow({ no: i + 1, tgl: fmtTgl(e.tanggal), keg: e.kegiatan,
      cd: e.capaian_delta, ct: e.capaian_total, wm: e.waktu_menit,
      jf: e.foto_keys.length });
    styleData(r, i % 2 === 1);
    r.getCell("no").alignment = { vertical: "middle", horizontal: "center" };
    r.getCell("keg").alignment = { wrapText: true, vertical: "top" };
    ["cd", "ct", "wm", "jf"].forEach((k) =>
      { r.getCell(k).alignment = { vertical: "middle", horizontal: "center" }; });
  });
  s1.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + kegiatan.length, column: 7 } };

  // ================= Sheet 3: Keuangan =================
  const s2 = wb.addWorksheet("Keuangan", {
    properties: { tabColor: { argb: C.rose } },
    views: [{ state: "frozen", ySplit: 4 }],
  });
  s2.columns = [
    { key: "no", width: 5 },
    { key: "tgl", width: 18 },
    { key: "item", width: 42 },
    { key: "hs", width: 18 },
    { key: "sf", width: 12 },
    { key: "jml", width: 9 },
    { key: "tot", width: 17 },
    { key: "bk", width: 10 },
  ];
  judulSheet(s2, "LOGBOOK KEUANGAN", sub, 8);
  const h2 = s2.addRow(["No", "Tanggal", "Item", "Harga satuan", "Satuan",
    "Jumlah", "Total", "Ada bukti"]);
  styleHeader(h2);
  keuangan.forEach((e, i) => {
    const nBukti = (e.bukti_keys || []).length;
    const r = s2.addRow({ no: i + 1, tgl: fmtTgl(e.tanggal), item: e.item,
      hs: e.harga_satuan, sf: e.satuan_suffix || "", jml: e.jumlah,
      tot: e.total, bk: nBukti > 1 ? `Ya (${nBukti})` : nBukti ? "Ya" : "-" });
    styleData(r, i % 2 === 1);
    r.getCell("no").alignment = { vertical: "middle", horizontal: "center" };
    r.getCell("item").alignment = { wrapText: true, vertical: "middle" };
    ["jml", "bk", "sf"].forEach((k) =>
      { r.getCell(k).alignment = { vertical: "middle", horizontal: "center" }; });
    ["hs", "tot"].forEach((k) => { r.getCell(k).numFmt = '"Rp"#,##0'; });
    if (nBukti) r.getCell("bk").font = { color: { argb: C.green }, bold: true };
  });
  s2.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + keuangan.length, column: 8 } };

  // baris total menonjol
  const totRow = s2.addRow({ item: "TOTAL PENGELUARAN", tot: pengeluaran });
  totRow.eachCell({ includeEmpty: true }, (c) => {
    c.fill = fill(C.indigoBg);
    c.border = BORDER;
  });
  totRow.getCell("item").font = { bold: true, size: 11, color: { argb: C.indigoDark } };
  totRow.getCell("tot").font = { bold: true, size: 11, color: { argb: C.indigoDark } };
  totRow.getCell("tot").numFmt = '"Rp"#,##0';
  totRow.height = 24;
  const sisaRow = s2.addRow({ item: "SISA DANA (dana awal − pengeluaran)", tot: sisaDana });
  sisaRow.eachCell({ includeEmpty: true }, (c) => {
    c.fill = fill(sisaDana >= 0 ? C.greenBg : C.roseBg);
    c.border = BORDER;
  });
  const warnaSisa = sisaDana >= 0 ? C.green : C.rose;
  sisaRow.getCell("item").font = { bold: true, size: 11, color: { argb: warnaSisa } };
  sisaRow.getCell("tot").font = { bold: true, size: 11, color: { argb: warnaSisa } };
  sisaRow.getCell("tot").numFmt = '"Rp"#,##0';
  sisaRow.height = 24;

  return Buffer.from(await wb.xlsx.writeBuffer());
}
