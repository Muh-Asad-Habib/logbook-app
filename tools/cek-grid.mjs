// Cek lebar kolom foto template (sekali pakai)
import JSZip from "jszip";
import fs from "node:fs";
const z = await JSZip.loadAsync(fs.readFileSync("backend/src/assets/template-logbook.docx"));
const xml = await z.file("word/document.xml").async("string");
const tbls = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || [];
tbls.slice(0, 2).forEach((t, i) => {
  const grid = (t.match(/<w:gridCol[^>]*w:w="(\d+)"/g) || [])
    .map((g) => Number(g.match(/w:w="(\d+)"/)[1]));
  const cm = grid.map((w) => (w / 567).toFixed(2));
  console.log(`Tabel ${i + 1} kolom(cm): ${cm.join(" | ")} -> foto landscape: ${(grid.at(-1) / 567 - 0.42).toFixed(2)} cm`);
});

