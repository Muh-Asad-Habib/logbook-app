/** Ekspor Excel — rekap kegiatan & keuangan (exceljs). */
import ExcelJS from "exceljs";
import * as store from "../storage.js";

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const fmtTgl = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
};

const HEAD_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
const HEAD_FONT = { bold: true, color: { argb: "FFFFFFFF" } };

function styleHeader(row) {
  row.eachCell((c) => {
    c.fill = HEAD_FILL;
    c.font = HEAD_FONT;
    c.alignment = { vertical: "middle", horizontal: "center" };
  });
  row.height = 20;
}

export async function buildXlsx(userId) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Logbook";

  const [kegiatan, keuangan, danaAwalStr] = await Promise.all([
    store.listKegiatan(userId),
    store.listKeuangan(userId),
    store.getSetting(userId, "dana_awal", "0"),
  ]);
  const danaAwal = Number(danaAwalStr) || 0;
  const pengeluaran = keuangan.reduce((s, e) => s + e.total, 0);

  // ---- Sheet Kegiatan ----
  const s1 = wb.addWorksheet("Kegiatan");
  s1.columns = [
    { header: "No", key: "no", width: 5 },
    { header: "Tanggal", key: "tgl", width: 18 },
    { header: "Kegiatan", key: "keg", width: 70 },
    { header: "Capaian entri (%)", key: "cd", width: 16 },
    { header: "Capaian total (%)", key: "ct", width: 16 },
    { header: "Waktu (menit)", key: "wm", width: 14 },
    { header: "Jumlah foto", key: "jf", width: 12 },
  ];
  styleHeader(s1.getRow(1));
  kegiatan.forEach((e, i) => {
    s1.addRow({ no: i + 1, tgl: fmtTgl(e.tanggal), keg: e.kegiatan,
      cd: e.capaian_delta, ct: e.capaian_total, wm: e.waktu_menit,
      jf: e.foto_keys.length });
  });
  s1.getColumn("keg").alignment = { wrapText: true, vertical: "top" };

  // ---- Sheet Keuangan ----
  const s2 = wb.addWorksheet("Keuangan");
  s2.columns = [
    { header: "No", key: "no", width: 5 },
    { header: "Tanggal", key: "tgl", width: 18 },
    { header: "Item", key: "item", width: 46 },
    { header: "Harga satuan (Rp)", key: "hs", width: 18 },
    { header: "Satuan", key: "sf", width: 12 },
    { header: "Jumlah", key: "jml", width: 9 },
    { header: "Total (Rp)", key: "tot", width: 16 },
    { header: "Ada bukti", key: "bk", width: 10 },
  ];
  styleHeader(s2.getRow(1));
  keuangan.forEach((e, i) => {
    s2.addRow({ no: i + 1, tgl: fmtTgl(e.tanggal), item: e.item,
      hs: e.harga_satuan, sf: e.satuan_suffix || "", jml: e.jumlah,
      tot: e.total, bk: e.bukti_key ? "Ya" : "-" });
  });
  ["hs", "tot"].forEach((k) => { s2.getColumn(k).numFmt = "#,##0"; });
  const totRow = s2.addRow({ item: "TOTAL PENGELUARAN", tot: pengeluaran });
  totRow.font = { bold: true };

  // ---- Sheet Ringkasan ----
  const s3 = wb.addWorksheet("Ringkasan");
  s3.columns = [{ width: 28 }, { width: 24 }];
  const capaian = kegiatan.length ? kegiatan[kegiatan.length - 1].capaian_total : 0;
  const totalMenit = kegiatan.reduce((s, e) => s + e.waktu_menit, 0);
  const rows = [
    ["Capaian total", `${capaian}%`],
    ["Jumlah kegiatan", kegiatan.length],
    ["Total waktu (menit)", totalMenit],
    ["Jumlah transaksi belanja", keuangan.length],
    ["Total pengeluaran (Rp)", pengeluaran],
    ["Dana awal (Rp)", danaAwal],
    ["Sisa dana (Rp)", danaAwal - pengeluaran],
  ];
  s3.addRow(["RINGKASAN LOGBOOK", ""]);
  s3.getRow(1).font = { bold: true, size: 13 };
  rows.forEach(([k, v]) => {
    const r = s3.addRow([k, v]);
    r.getCell(1).font = { bold: true };
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

