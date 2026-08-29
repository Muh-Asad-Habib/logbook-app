/**
 * Uji cepat rute ekspor: memastikan modul rute termuat dan endpoint
 * /api/export/tautan/:jenis terdaftar dengan jenis yang benar.
 * Jalankan: node tools/test-rute-ekspor.mjs
 */
import router from "../backend/src/routes/export.js";

let gagal = 0;
const cek = (nama, kondisi) => {
  console.log(`${kondisi ? "[ok]  " : "[GAGAL]"} ${nama}`);
  if (!kondisi) gagal += 1;
};

const rute = router.stack
  .filter((l) => l.route)
  .map((l) => `${Object.keys(l.route.methods).join(",").toUpperCase()} ${l.route.path}`);

console.log("Rute terdaftar:\n  " + rute.join("\n  ") + "\n");

cek("POST /tautan/:jenis terdaftar", rute.includes("POST /tautan/:jenis"));
cek("GET /docx tetap ada (jalur cadangan)", rute.includes("GET /docx"));
cek("GET /pdf tetap ada (jalur cadangan)", rute.includes("GET /pdf"));
cek("GET /xlsx tetap ada (jalur cadangan)", rute.includes("GET /xlsx"));
cek("GET /keuangan-docx (ekspor khusus keuangan) terdaftar",
  rute.includes("GET /keuangan-docx"));
cek("GET /info tetap ada", rute.includes("GET /info"));

console.log(gagal ? `\n${gagal} PENGUJIAN GAGAL` : "\nSEMUA PENGUJIAN LULUS");
process.exit(gagal ? 1 : 0);

