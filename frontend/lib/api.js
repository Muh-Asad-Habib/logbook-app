/** Klien API — frontend & API dilayani SATU server, jadi cukup URL relatif.
 *  Dengan begitu aplikasi otomatis bekerja lewat localhost, IP LAN,
 *  maupun URL tunnel publik (https://xxx.trycloudflare.com) tanpa konfigurasi.
 *
 *  Autentikasi: token disimpan di localStorage dan dikirim sebagai
 *  header Authorization (atau ?token= untuk <img>/link unduhan). */
import { useEffect, useReducer } from "react";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

/* ---------- Sesi login (token + profil) ---------- */
const TOKEN_KEY = "logbook_token";
const USER_KEY = "logbook_user";

export const getToken = () =>
  typeof window === "undefined" ? "" : localStorage.getItem(TOKEN_KEY) || "";

export const getUser = () => {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
};

export function setAuth(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user || null));
  clearCache(); // jangan tampilkan data akun sebelumnya
}

/** Perbarui profil tersimpan tanpa menyentuh token (mis. setelah ganti username). */
export function setUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user || null));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  clearCache();
}

function authHeaders(extra = {}) {
  const t = getToken();
  return t ? { ...extra, Authorization: `Bearer ${t}` } : { ...extra };
}

/** Sesi tidak valid → bersihkan token & arahkan ke halaman login. */
function gotoLogin() {
  if (typeof window === "undefined") return;
  if (location.pathname.replace(/\/$/, "") === "/login") return;
  clearAuth();
  location.href = "/login";
}

async function parse(res) {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      msg = (await res.json()).error || msg;
    } catch {}
    if (res.status === 413) {
      msg = "Ukuran unggahan melebihi batas server (±4,5 MB per permintaan) — " +
            "kurangi jumlah/ukuran foto lalu coba lagi.";
    }
    throw new Error(msg);
  }
  return res.json();
}

async function handle(res) {
  if (res.status === 401) gotoLogin(); // sesi habis/invalid → login ulang
  return parse(res);
}

/** fetch dengan header Authorization + penanganan 401 terpusat. */
const aFetch = (path, opts = {}) =>
  fetch(`${API_URL}${path}`, { ...opts, headers: authHeaders(opts.headers || {}) }).then(handle);

/* ---------- Cache data antar-halaman (stale-while-revalidate) ----------
 * Data disimpan di memori selama aplikasi terbuka: pindah menu langsung
 * menampilkan data terakhir TANPA menunggu jaringan (tanpa skeleton),
 * lalu data disegarkan di latar belakang. */
const cache = new Map();     // path -> data terakhir
const errors = new Map();    // path -> Error terakhir (bila fetch gagal)
const inflight = new Map();  // path -> Promise yang sedang berjalan (dedupe)
const listeners = new Map(); // path -> Set<callback re-render>

const emit = (path) => {
  const set = listeners.get(path);
  if (set) for (const fn of set) fn();
};

/** Kosongkan seluruh cache (dipakai saat ganti akun/login/logout). */
export function clearCache() {
  cache.clear();
  errors.clear();
  inflight.clear();
  for (const path of listeners.keys()) emit(path);
}

const getJson = (path) => aFetch(path, { cache: "no-store" });

/** Ambil ulang data path & beri tahu semua komponen pemakainya. */
export function revalidate(path) {
  if (inflight.has(path)) return inflight.get(path);
  const p = getJson(path)
    .then((data) => {
      cache.set(path, data);
      errors.delete(path);
      emit(path);
      return data;
    })
    .catch((e) => {
      errors.set(path, e);
      emit(path);
      throw e;
    })
    .finally(() => inflight.delete(path));
  inflight.set(path, p);
  return p;
}

/** Muat data lebih awal (untuk prefetch saat aplikasi dibuka). */
export function preload(path) {
  if (!cache.has(path) && !inflight.has(path)) revalidate(path).catch(() => {});
}

/** Segarkan semua data utama (dipanggil setelah tambah/ubah/hapus). */
export function refreshData() {
  ["/api/kegiatan", "/api/keuangan", "/api/statistik", "/api/export/info"]
    .forEach((p) => revalidate(p).catch(() => {}));
}

/** Hook data ber-cache: render instan dari cache, refresh di latar. */
export function useApi(path) {
  const [, rerender] = useReducer((n) => n + 1, 0);
  useEffect(() => {
    let set = listeners.get(path);
    if (!set) listeners.set(path, (set = new Set()));
    set.add(rerender);
    revalidate(path).catch(() => {}); // segarkan di latar (dedupe otomatis)
    return () => { set.delete(rerender); };
  }, [path]);
  return { data: cache.get(path), error: errors.get(path) };
}

export const api = {
  // ---- Auth ----
  register: (username, password) =>
    fetch(`${API_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).then(parse),
  login: (username, password) =>
    fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).then(parse),
  me: () => aFetch("/api/auth/me", { cache: "no-store" }),
  logout: () => aFetch("/api/auth/logout", { method: "POST" }).catch(() => {}),
  updateUsername: (username, password) =>
    aFetch("/api/auth/username", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }),
  updatePassword: (password_lama, password_baru) =>
    aFetch("/api/auth/password", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password_lama, password_baru }),
    }),
  aktivitas: (n = 30) => aFetch(`/api/auth/aktivitas?n=${n}`, { cache: "no-store" }),

  // ---- Kegiatan ----
  listKegiatan: () => aFetch("/api/kegiatan", { cache: "no-store" }),
  addKegiatan: (formData) => aFetch("/api/kegiatan", { method: "POST", body: formData }),
  updateKegiatan: (id, formData) => aFetch(`/api/kegiatan/${id}`, { method: "PUT", body: formData }),
  deleteKegiatan: (id) => aFetch(`/api/kegiatan/${id}`, { method: "DELETE" }),

  // ---- Keuangan ----
  listKeuangan: () => aFetch("/api/keuangan", { cache: "no-store" }),
  addKeuangan: (formData) => aFetch("/api/keuangan", { method: "POST", body: formData }),
  updateKeuangan: (id, formData) => aFetch(`/api/keuangan/${id}`, { method: "PUT", body: formData }),
  deleteKeuangan: (id) => aFetch(`/api/keuangan/${id}`, { method: "DELETE" }),

  // ---- Pengaturan & statistik ----
  getSetting: (kunci) => aFetch(`/api/pengaturan/${kunci}`, { cache: "no-store" }),
  setSetting: (kunci, nilai) =>
    aFetch(`/api/pengaturan/${kunci}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nilai }),
    }),
  statistik: () => aFetch("/api/statistik", { cache: "no-store" }),

  // ---- Impor ----
  /**
   * Impor .docx. File kecil dikirim sekali jalan; file besar otomatis
   * dipotong ±2 MB per request (batas keras Vercel ±4,5 MB → dulu 413).
   * @param {File|null} file  berkas .docx (null → server pakai template bawaan)
   * @param {(persen:number)=>void} [onProgress]
   */
  importDocx: async (file, onProgress) => {
    const LANGSUNG_MAKS = 3 * 1024 * 1024; // ≤3 MB → satu request multipart
    if (!file || file.size <= LANGSUNG_MAKS) {
      const fd = new FormData();
      if (file) fd.append("file", file);
      return aFetch("/api/import/docx", { method: "POST", body: fd });
    }
    const CHUNK = 2 * 1024 * 1024; // biner per potongan (base64 ≈ 2,7 MB)
    const id = `imp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const total = Math.ceil(file.size / CHUNK);
    for (let i = 0; i < total; i++) {
      const potong = file.slice(i * CHUNK, (i + 1) * CHUNK);
      const b64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1] || "");
        r.onerror = () => reject(new Error("Gagal membaca berkas"));
        r.readAsDataURL(potong);
      });
      await aFetch("/api/import/docx/chunk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, idx: i, data: b64 }),
      });
      onProgress?.(Math.round(((i + 1) / (total + 1)) * 100));
    }
    return aFetch("/api/import/docx/selesai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, total }),
    });
  },
};

/** URL gambar di server (perlu token karena <img> tidak bisa kirim header). */
export const fotoUrl = (key) =>
  `${API_URL}/api/files/${encodeURIComponent(key)}?token=${encodeURIComponent(getToken())}`;

/** URL unduhan ekspor (link <a> juga tidak bisa kirim header). */
export const exportUrl = (path) =>
  `${API_URL}${path}?token=${encodeURIComponent(getToken())}`;

export const fmtRupiah = (n) => "Rp" + Number(n || 0).toLocaleString("id-ID");

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export const fmtTgl = (iso) => {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
};

export const fmtDurasi = (menit) =>
  menit >= 60 ? `${Math.floor(menit / 60)} j ${menit % 60} mnt` : `${menit} mnt`;

