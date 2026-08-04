/**
 * Cek apakah versi yang ONLINE di Vercel sama dengan commit terakhir di laptop.
 *
 * Dipakai untuk menjawab pertanyaan "sudah ke-deploy belum?" tanpa membuka
 * dashboard: /health kini mengembalikan penanda deploy + commit.
 *
 * Jalankan:  npm run cek:online
 *            node tools/cek-online.mjs https://domain-lain.vercel.app
 */
import { execSync } from "node:child_process";

const URL_DASAR = (process.argv[2] || process.env.LOGBOOK_URL || "https://URL-KAMU.vercel.app")
  .replace(/\/$/, "");

const commitLokal = (() => {
  try {
    return execSync("git rev-parse --short=7 HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
})();

const ambil = async (path) => {
  const t0 = Date.now();
  // Cache-buster + no-store: hasil harus mencerminkan deploy TERKINI,
  // bukan salinan CDN dari pengecekan sebelumnya.
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${URL_DASAR}${path}${sep}_cek=${Date.now()}`, {
    redirect: "manual",
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  });
  return { status: res.status, ms: Date.now() - t0, res };
};

console.log(`Memeriksa ${URL_DASAR} …\n`);

let gagal = 0;
try {
  const { res, status, ms } = await ambil("/health");
  if (status !== 200) throw new Error(`/health membalas HTTP ${status}`);
  const h = await res.json();
  console.log(`server      : ok (${ms} ms, region ${h.region || "-"})`);
  console.log(`deploy      : ${h.deploy}`);
  console.log(`commit live : ${h.commit || "(tidak tercatat)"}`);
  console.log(`commit lokal: ${commitLokal || "(bukan repo git)"}`);
  if (h.commit && commitLokal) {
    if (h.commit === commitLokal) {
      console.log("status      : ✅ ONLINE = commit terakhir");
    } else {
      gagal += 1;
      console.log("status      : ⚠️  TERTINGGAL — jalankan `npm run deploy`");
    }
  }
} catch (e) {
  gagal += 1;
  console.log(`server      : ❌ ${e.message}`);
}

// Halaman & pagar peran — memastikan build frontend + API benar-benar hidup
const cek = [
  ["/", 200], ["/login", 200], ["/kegiatan", 200], ["/laporan", 200],
  ["/presentasi", 200],
  ["/openapi.json", 200], ["/api/fasilitator/tim", 401], ["/api/komentar/belum-dibaca", 401],
  ["/api/presentasi/info", 401],
];
console.log("");
for (const [path, harap] of cek) {
  try {
    const { status, ms } = await ambil(path);
    const ok = status === harap;
    if (!ok) gagal += 1;
    console.log(`${ok ? "✅" : "❌"} ${path.padEnd(28)} ${status} (harap ${harap}, ${ms} ms)`);
  } catch (e) {
    gagal += 1;
    console.log(`❌ ${path.padEnd(28)} ${e.message}`);
  }
}

console.log(gagal ? `\n${gagal} MASALAH DITEMUKAN` : "\nSEMUA SEHAT & VERSI TERBARU 🎉");
process.exit(gagal ? 1 : 0);

