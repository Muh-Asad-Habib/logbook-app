/**
 * Validasi ketat hasil ekspor: setiap bagian XML dalam .docx harus
 * well-formed (fast-xml-parser — validator XML sungguhan).
 * Jalankan: node backend/diag-validate.mjs
 */
import fs from "node:fs";
import JSZip from "jszip";
import { XMLValidator } from "fast-xml-parser";

const p = new URL("../tools/hasil-ekspor-uji.docx", import.meta.url);
const zip = await JSZip.loadAsync(fs.readFileSync(p));

let gagal = 0;
for (const nama of Object.keys(zip.files)) {
  if (!/\.(xml|rels)$/i.test(nama)) continue;
  const isi = await zip.file(nama).async("string");
  const hasil = XMLValidator.validate(isi);
  if (hasil !== true) {
    gagal += 1;
    console.log(`❌ ${nama}: ${JSON.stringify(hasil.err)}`);
  } else {
    console.log(`✅ ${nama}`);
  }
}
console.log(gagal ? `\n${gagal} BAGIAN XML RUSAK` : "\nSEMUA BAGIAN XML VALID — dokumen aman dibuka di Word");
process.exit(gagal ? 1 : 0);

