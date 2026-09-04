/**
 * Uji perilaku UI panel tanpa peramban (sekali pakai).
 * Menyiapkan DOM tiruan seadanya lalu MENJALANKAN skrip inline panel,
 * sehingga bug seperti "regex path salah escape", "fungsi belum
 * terdefinisi", atau "render halaman melempar error" ketahuan lebih awal.
 */
import { PANEL_HTML } from "./src/admin/panel.js";

const buka = PANEL_HTML.lastIndexOf("<script>") + "<script>".length;
const kode = PANEL_HTML.slice(buka, PANEL_HTML.lastIndexOf("</" + "script>"));

let lulus = 0, gagal = 0;
const cek = (nama, ok, info = "") => {
  if (ok) { lulus++; console.log(`  OK    ${nama}`); }
  else { gagal++; console.log(`  GAGAL ${nama} ${info}`); }
};

/* ---- 1. regex path harus keluar sebagai \/ bukan \\/ ---- */
cek("regex pemotong path tidak double-escape",
  kode.includes('replace(/\\/+$/, "")') && !kode.includes("\\\\/+$"),
  kode.slice(kode.indexOf("var B = "), kode.indexOf("var B = ") + 60));
cek("regex nama halaman benar",
  kode.includes("/\\/(akun|sesi|audit|pengaturan)$/"));

/* ---- 2. jalankan skrip di DOM tiruan ---- */
const dibuat = [];
function elemenPalsu(id = "") {
  const el = {
    id, tagName: "DIV", dataset: {}, style: {}, value: "", textContent: "",
    innerHTML: "", scrollTop: 0, offsetTop: 0, nodeType: 1, parentElement: null,
    classList: {
      _s: new Set(),
      add(...c) { c.forEach((x) => this._s.add(x)); },
      remove(...c) { c.forEach((x) => this._s.delete(x)); },
      toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
    appendChild() {}, remove() {}, focus() {}, select() {}, close() {}, show() {},
    showModal() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return ""; },
    hasAttribute() { return false; }, matches() { return true; }, closest() { return null; },
    addEventListener() {}, removeEventListener() {}, querySelector() { return null; },
    querySelectorAll() { return []; }, getBoundingClientRect() { return {}; },
  };
  dibuat.push(el);
  return el;
}
const cache = new Map();
const ambil = (sel) => {
  if (!cache.has(sel)) cache.set(sel, elemenPalsu(sel.replace(/^#/, "")));
  return cache.get(sel);
};

const document_ = {
  documentElement: elemenPalsu("html"),
  body: elemenPalsu("body"),
  querySelector: (s) => ambil(s),
  querySelectorAll: () => [],
  getElementById: (id) => ambil("#" + id),
  createElement: () => elemenPalsu(),
  addEventListener: () => {},
  activeElement: { tagName: "BODY" },
};
const window_ = {
  addEventListener: () => {}, scrollTo: () => {}, scrollY: 0,
  EventSource: undefined, performance: { now: () => 0 },
  requestAnimationFrame: () => {}, setInterval: () => 0, setTimeout: () => 0,
  clearTimeout: () => {}, clearInterval: () => {},
};

const jejakFetch = [];
const sandbox = {
  document: document_, window: window_,
  location: { pathname: "/pusat-kendali/sesi", search: "", href: "" },
  history: { pushState: () => {} },
  sessionStorage: { getItem: () => "", setItem: () => {}, removeItem: () => {} },
  localStorage: { getItem: () => null, setItem: () => {} },
  fetch: (u) => { jejakFetch.push(u); return new Promise(() => {}); },
  console, performance: { now: () => 0 },
  requestAnimationFrame: () => {}, setInterval: () => 0, setTimeout: () => 0,
  clearTimeout: () => {}, clearInterval: () => {},
  confirm: () => false, prompt: () => "", alert: () => {},
  EventSource: undefined, Promise, Date, Math, Number, String, Object, Array, JSON,
  encodeURIComponent, RegExp, isNaN, parseInt, parseFloat, HTMLDialogElement: class {},
};

let api;
try {
  const nama = Object.keys(sandbox);
  const fn = new Function(...nama, kode + "\n;return { B: B, HAL: HAL, urlHal: urlHal, keHalaman: keHalaman, render: render, renderSesi: renderSesi, kartuAkunSesi: kartuAkunSesi, barisPerangkat: barisPerangkat, sesiPerAkun: sesiPerAkun, akunOnline: akunOnline, setMode: function(m){ MODE_SESI = m; }, bentang: function(id){ BUKA_SESI[id] = true; }, setState: function(u, s){ USERS = u; SESI = s; PERTAMA = false; } };");

  api = fn(...nama.map((n) => sandbox[n]));
  cek("skrip panel berjalan tanpa error", true);
} catch (e) {
  cek("skrip panel berjalan tanpa error", false, e.message);
  process.exit(1);
}

/* ---- 3. alamat dasar & halaman dibaca dari URL ---- */
cek("B membuang nama halaman dari path", api.B === "/pusat-kendali", api.B);
cek("halaman awal diambil dari URL (/sesi)", api.HAL === "sesi", api.HAL);
cek("urlHal('ringkas') = akar panel", api.urlHal("ringkas") === "/pusat-kendali", api.urlHal("ringkas"));
cek("urlHal('audit') = /pusat-kendali/audit", api.urlHal("audit") === "/pusat-kendali/audit", api.urlHal("audit"));

/* ---- 4. kartu akun pada halaman sesi ---- */
const users = [
  { id: "t1", username: "Tim Alfa", role: "tim", createdAt: "2026-01-05T00:00:00.000Z",
    loginTerakhir: new Date().toISOString(), pengampu: [{ id: "f1", username: "Bu Rina", role: "fasilitator" }] },
  { id: "t2", username: "Tim Beta", role: "tim", createdAt: "2026-02-01T00:00:00.000Z",
    loginTerakhir: "", pengampu: [] },
  { id: "f1", username: "Bu Rina", role: "fasilitator", createdAt: "2026-01-01T00:00:00.000Z",
    loginTerakhir: "2026-08-01T10:00:00.000Z", n_tim_diampu: 3, pengampu: [] },
];
const sesi = [
  { id: "aa11", user_id: "t1", username: "Tim Alfa", role: "tim", perangkat: "Brave · Linux",
    ip: "203.0.113.7", penuh: true, dibuat: "2026-08-20T02:00:00.000Z", terakhir: new Date().toISOString(),
    membuka: true, layar: "terlihat" },
];
api.setState(users, sesi);

const peta = api.sesiPerAkun();
cek("sesi dikelompokkan per akun", peta.t1 && peta.t1.length === 1, JSON.stringify(Object.keys(peta)));
cek("akunOnline hanya berisi yang punya sesi",
  api.akunOnline().length === 1 && api.akunOnline()[0] === "t1", JSON.stringify(api.akunOnline()));

const kartuOnline = api.kartuAkunSesi(users[0], sesi);
cek("kartu akun MEMBUKA: badge online + jumlah perangkat",
  kartuOnline.includes('class="st on"') && kartuOnline.includes("1 perangkat") &&
  kartuOnline.includes("sedang membuka aplikasi"));
cek("kartu akun online: nama pendamping tampil", kartuOnline.includes("pendamping: Bu Rina"));
cek("kartu akun online: tombol cabut semua ada", kartuOnline.includes('data-act="sesi"'));

// Login tapi tab aplikasi TIDAK terbuka → bukan "online", melainkan "login"
const sesiDiam = [{ ...sesi[0], membuka: false, layar: "" }];
const kartuDiam = api.kartuAkunSesi(users[0], sesiDiam);
cek("kartu akun LOGIN SAJA: badge redup, bukan online",
  kartuDiam.includes('class="st dim"') && !kartuDiam.includes('class="st on"') &&
  kartuDiam.includes("login, tidak membuka"));
cek("baris perangkat: lencana 'tidak membuka'",
  api.barisPerangkat(sesiDiam[0]).includes("tidak membuka"));
cek("baris perangkat: lencana 'tab di latar' saat tersembunyi",
  api.barisPerangkat({ ...sesi[0], layar: "tersembunyi" }).includes("tab di latar"));
cek("baris perangkat: lencana 'sedang membuka' saat terlihat",
  api.barisPerangkat(sesi[0]).includes("sedang membuka"));

const kartuOffline = api.kartuAkunSesi(users[1], []);
cek("kartu akun offline: berlabel offline", kartuOffline.includes('class="st off"') && kartuOffline.includes("offline"));
cek("kartu akun offline: 'belum pernah login'", kartuOffline.includes("belum pernah login"));
cek("kartu akun offline: tanpa tombol cabut", !kartuOffline.includes('data-act="sesi"'));

const kartuFas = api.kartuAkunSesi(users[2], []);
cek("kartu pendamping: jumlah tim diampu", kartuFas.includes("mengampu 3 tim"));
cek("kartu pendamping: login terakhir ditampilkan", kartuFas.includes("login terakhir"));
cek("kartu pendamping: pintasan atur tim diampu", kartuFas.includes('data-act="tim"'));
cek("kartu tim: pintasan atur pendamping", kartuOnline.includes('data-act="fas"'));

api.bentang("t1");
const kartuBuka = api.kartuAkunSesi(users[0], sesi);
cek("kartu dibentangkan: daftar perangkat tampil", kartuBuka.includes("Brave · Linux"));
cek("kartu offline dibentangkan: diberi penjelasan",
  api.kartuAkunSesi(users[1], []).length > 0);

/* ---- 5. render tiap halaman tidak melempar error ---- */
for (const h of ["ringkas", "akun", "sesi", "audit", "pengaturan"]) {
  try { api.keHalaman(h, false); cek(`render halaman ${h}`, true); }
  catch (e) { cek(`render halaman ${h}`, false, e.message); }
}

/* ---- 6. kedua mode halaman sesi bisa digambar ---- */
api.keHalaman("sesi", false);
for (const m of ["semua", "akun"]) {
  try { api.setMode(m); api.renderSesi(); cek(`mode sesi "${m}" digambar`, true); }
  catch (e) { cek(`mode sesi "${m}" digambar`, false, e.message); }
}

console.log(`\n== HASIL: ${lulus} lulus, ${gagal} gagal ==`);
process.exit(gagal ? 1 : 0);

