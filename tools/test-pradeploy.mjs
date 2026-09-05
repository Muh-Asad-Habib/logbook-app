import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import express from "express";
import helmet from "helmet";
import { buatCsp } from "../backend/src/security-headers.js";

const source = await readFile(new URL("../frontend/public/sw.js", import.meta.url), "utf8");
const vercel = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));

// Evaluasi worker dengan cache dan jaringan tiruan; tidak mengakses layanan nyata.
function worker({ offline = false, response, cacheHit, keys = [] } = {}) {
  const events = {}, writes = [], deleted = [];
  const ctx = vm.createContext({
    URL, Response,
    self: {
      location: { origin: "https://logbook.test" },
      addEventListener: (name, fn) => { events[name] = fn; },
      skipWaiting: async () => {}, clients: { claim: async () => {} },
    },
    caches: {
      keys: async () => keys,
      delete: async (key) => { deleted.push(key); return true; },
      open: async () => ({ addAll: async () => {}, put: async (req) => { writes.push(req.url); } }),
      match: async () => cacheHit,
    },
    fetch: async () => {
      if (offline) throw new Error("offline");
      return response || new Response("<h1>Logbook</h1>", { headers: { "Content-Type": "text/html" } });
    },
  });
  vm.runInContext(source, ctx);
  return {
    writes, deleted,
    async activate() {
      let done;
      events.activate({ waitUntil: (p) => { done = p; } });
      await done;
    },
    async request(path, { method = "GET", mode = "navigate" } = {}) {
      let result;
      events.fetch({
        request: { url: new URL(path, "https://logbook.test").href, method, mode, headers: new Headers({ accept: "text/html" }) },
        respondWith: (p) => { result = p; },
      });
      const res = await result;
      await new Promise((resolve) => setImmediate(resolve));
      return res;
    },
  };
}

test("CSP mengizinkan API upload dan CDN ImageKit, bukan semua HTTPS", () => {
  const csp = buatCsp({}).directives;
  assert.deepEqual(csp.connectSrc, ["'self'", "https://upload.imagekit.io", "https://ik.imagekit.io"]);
  assert.deepEqual(csp.objectSrc, ["'none'"]);
  assert.deepEqual(csp.frameAncestors, ["'none'"]);
  assert.ok(!("upgradeInsecureRequests" in csp));
  assert.deepEqual(buatCsp({ VERCEL: "1" }).directives.upgradeInsecureRequests, []);
});

test("CSP domain CDN kustom hanya menerima origin HTTPS tanpa kredensial", () => {
  assert.ok(buatCsp({ IMAGEKIT_URL_ENDPOINT: "https://cdn.example.test/folder?q=1" }).directives.connectSrc.includes("https://cdn.example.test"));
  for (const value of ["", "bukan-url", "http://cdn.example.test", "https://user:pass@cdn.example.test", "https://cdn.example.test; script-src *"]) {
    assert.equal(buatCsp({ IMAGEKIT_URL_ENDPOINT: value }).directives.connectSrc.length, 3);
  }
});

test("Helmet menghasilkan header CSP yang dipakai server tanpa database", async () => {
  const app = express();
  app.use(helmet({ contentSecurityPolicy: buatCsp({}) }));
  app.get("/", (_req, res) => res.send("test"));
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    const res = await fetch(`http://127.0.0.1:${server.address().port}/`);
    assert.match(res.headers.get("content-security-policy"), /connect-src 'self' https:\/\/upload\.imagekit\.io https:\/\/ik\.imagekit\.io;/);
    await res.text();
  } finally {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
});

test("Worker aktivasi menghapus hanya cache Logbook versi lama", async () => {
  const w = worker({ keys: ["logbook-sw-v1-shell", "logbook-sw-v1-statis", "logbook-sw-v2-shell", "logbook-sw-v2-statis", "aplikasi-lain"] });
  await w.activate();
  assert.deepEqual(w.deleted, ["logbook-sw-v1-shell", "logbook-sw-v1-statis"]);
});

test("Worker tidak menangani panel, health, API, CDN, atau permintaan tulis", async () => {
  const w = worker();
  for (const path of ["/pusat-kendali", "/panel-rahasia/akun", "/health", "/docs", "/api/auth/sesi", "/sw.js", "https://ik.imagekit.io/test"]) {
    assert.equal(await w.request(path), undefined, path);
  }
  assert.equal(await w.request("/kegiatan", { method: "POST" }), undefined);
  assert.deepEqual(w.writes, []);
});

test("Worker tetap menyimpan kerangka frontend HTML yang sah", async () => {
  const w = worker();
  for (const path of ["/", "/login", "/kegiatan", "/keuangan/", "/laporan.html", "/profil?tab=akun"]) {
    assert.equal((await w.request(path)).status, 200);
  }
  assert.equal(w.writes.length, 6);
});

test("Worker tidak menyimpan respons privat, no-store, JSON, redirect, atau galat", async () => {
  for (const response of [
    new Response("html", { headers: { "Content-Type": "text/html", "Cache-Control": "no-store" } }),
    new Response("html", { headers: { "Content-Type": "text/html", "Cache-Control": "private, max-age=60" } }),
    new Response("{}", { headers: { "Content-Type": "application/json" } }),
    new Response("error", { status: 500, headers: { "Content-Type": "text/html" } }),
    { ok: true, redirected: true, headers: new Headers({ "Content-Type": "text/html" }) },
  ]) {
    const w = worker({ response });
    await w.request("/kegiatan");
    assert.deepEqual(w.writes, []);
  }
});

test("Worker offline memakai cache dan memberi 503 jika precache juga kosong", async () => {
  const cached = new Response("offline shell");
  assert.equal(await (await worker({ offline: true, cacheHit: cached }).request("/kegiatan")).text(), "offline shell");
  const res = await worker({ offline: true }).request("/kegiatan");
  assert.equal(res.status, 503);
  assert.match(await res.text(), /Tidak ada koneksi/);
});

test("Vercel memakai instalasi terkunci, ekspor frontend, dan revalidasi worker", () => {
  assert.equal(vercel.installCommand, "npm ci");
  assert.equal(vercel.outputDirectory, "frontend/out");
  assert.equal(vercel.functions["api/index.js"].includeFiles, "backend/src/**");
  assert.ok(vercel.headers.some((rule) => rule.source === "/sw.js" && rule.headers.some((h) => h.key === "Cache-Control" && h.value === "no-cache")));
});

