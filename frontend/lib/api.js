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
  localStorage.removeItem(TIM_AKTIF_KEY);
  clearCache();
}

/* ---------- Peran pendamping (fasilitator & dosen pendamping) ---------- */
const TIM_AKTIF_KEY = "logbook_tim_aktif";

/** Peran akun yang login: "tim" | "fasilitator" | "dosen". */
export const getRole = () => getUser()?.role || "tim";

/**
 * Apakah user yang login berperan PENDAMPING (fasilitator atau dosen)?
 * Keduanya memakai tampilan baca-saja + komentar yang sama.
 */
export const isPendamping = () => {
  const r = getRole();
  return r === "fasilitator" || r === "dosen";
};

/** Khusus dosen pendamping — satu-satunya peran yang boleh memberi ACC. */
export const isDosen = () => getRole() === "dosen";

/** Nama lama; kini mencakup dosen juga (mode baca-saja yang identik). */
export const isFasilitator = isPendamping;

/** Tim yang sedang dipilih fasilitator (id akun tim). */
export const getTimAktif = () =>
  typeof window === "undefined" ? "" : localStorage.getItem(TIM_AKTIF_KEY) || "";

/** Simpan tim aktif + beri tahu halaman (event) supaya data dimuat ulang. */
export function setTimAktif(timId) {
  localStorage.setItem(TIM_AKTIF_KEY, String(timId || ""));
  clearCache();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("tim-aktif-berubah", { detail: timId }));
  }
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

/* ---------- Unggah terpotong (chunked) ----------
 * Vercel menolak body > ±4,5 MB per request. File besar dipotong ±2 MB
 * (base64) lalu dirakit kembali di server. Dipakai impor DOCX & laporan. */
const CHUNK = 2 * 1024 * 1024;

async function uploadChunked(basePath, file, onProgress, extra = {}) {
  const id = `up-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const total = Math.ceil(file.size / CHUNK);
  for (let i = 0; i < total; i++) {
    const potong = file.slice(i * CHUNK, (i + 1) * CHUNK);
    const b64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] || "");
      r.onerror = () => reject(new Error("Gagal membaca berkas"));
      r.readAsDataURL(potong);
    });
    await aFetch(`${basePath}/chunk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, idx: i, data: b64 }),
    });
    onProgress?.(Math.round(((i + 1) / (total + 1)) * 100));
  }
  return aFetch(`${basePath}/selesai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, total, ...extra }),
  });
}

const LANGSUNG_MAKS = 3 * 1024 * 1024; // ≤3 MB → satu request multipart

export const api = {
  // ---- Auth ----
  register: (username, password, opts = {}) =>
    fetch(`${API_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, ...opts }),
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
    if (!file || file.size <= LANGSUNG_MAKS) {
      const fd = new FormData();
      if (file) fd.append("file", file);
      return aFetch("/api/import/docx", { method: "POST", body: fd });
    }
    return uploadChunked("/api/import/docx", file, onProgress);
  },

  // ---- Laporan kemajuan (.docx — satu file, unggahan baru mengganti lama) ----
  laporanInfo: () => aFetch("/api/laporan/info", { cache: "no-store" }),
  uploadLaporan: async (file, onProgress) => {
    if (file.size <= LANGSUNG_MAKS) {
      const fd = new FormData();
      fd.append("file", file);
      return aFetch("/api/laporan", { method: "POST", body: fd });
    }
    return uploadChunked("/api/laporan", file, onProgress, { nama: file.name });
  },
  deleteLaporan: () => aFetch("/api/laporan", { method: "DELETE" }),
  /** Tautan publik sementara (30 mnt) — dipakai penampil Microsoft Office. */
  laporanTautan: () => aFetch("/api/laporan/tautan", { method: "POST" }),
  /** Ambil berkas laporan sebagai ArrayBuffer (untuk dirender docx-preview). */
  laporanFile: async () => {
    const res = await fetch(`${API_URL}/api/laporan/file`, {
      headers: authHeaders(), cache: "no-store",
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { msg = (await res.json()).error || msg; } catch {}
      throw new Error(msg);
    }
    return res.arrayBuffer();
  },

  // ---- Presentasi (.pptx + tautan Canva — boleh keduanya, hapus terpisah) ----
  presentasiInfo: () => aFetch("/api/presentasi/info", { cache: "no-store" }),
  uploadPresentasi: async (file, onProgress) => {
    if (file.size <= LANGSUNG_MAKS) {
      const fd = new FormData();
      fd.append("file", file);
      return aFetch("/api/presentasi", { method: "POST", body: fd });
    }
    return uploadChunked("/api/presentasi", file, onProgress, { nama: file.name });
  },
  deletePresentasiFile: () => aFetch("/api/presentasi/file", { method: "DELETE" }),
  /** Tautan publik sementara (30 mnt) — dipakai penampil Microsoft Office. */
  presentasiTautan: () => aFetch("/api/presentasi/tautan", { method: "POST" }),
  /** Simpan tautan Canva (dinormalisasi server ke bentuk embed). */
  setCanva: (url) =>
    aFetch("/api/presentasi/canva", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    }),
  deleteCanva: () => aFetch("/api/presentasi/canva", { method: "DELETE" }),

  // ---- Kode tim (akun tim) — hubungkan pendamping tanpa bantuan admin ----
  tim: {
    /** Kode milik tim yang login: { kode, kode_tampil }. */
    kode: () => aFetch("/api/tim/kode", { cache: "no-store" }),
    /** Cetak ulang kode — kode lama langsung tidak berlaku. */
    resetKode: () => aFetch("/api/tim/kode/reset", { method: "POST" }),
    /** Fasilitator & dosen yang sedang mendampingi tim ini. */
    pendamping: () => aFetch("/api/tim/pendamping", { cache: "no-store" }),
    keluarkan: (id) => aFetch(`/api/tim/pendamping/${id}`, { method: "DELETE" }),
  },

  // ---- Fasilitator (read-only terhadap tim yang di-assign) ----
  fasilitator: {
    tim: () => aFetch("/api/fasilitator/tim", { cache: "no-store" }),
    /** Gabung ke tim memakai kode yang dibagikan tim itu sendiri. */
    gabung: (kode) =>
      aFetch("/api/fasilitator/gabung", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kode }),
      }),
    /** Keluar dari sebuah tim (melepas assignment milik sendiri). */
    keluar: (timId) => aFetch(`/api/fasilitator/tim/${timId}`, { method: "DELETE" }),
    kegiatan: (timId) => aFetch(`/api/fasilitator/tim/${timId}/kegiatan`, { cache: "no-store" }),
    keuangan: (timId) => aFetch(`/api/fasilitator/tim/${timId}/keuangan`, { cache: "no-store" }),
    statistik: (timId) => aFetch(`/api/fasilitator/tim/${timId}/statistik`, { cache: "no-store" }),
    ringkasan: (timId) => aFetch(`/api/fasilitator/tim/${timId}/ringkasan`, { cache: "no-store" }),
    laporanInfo: (timId) => aFetch(`/api/fasilitator/tim/${timId}/laporan-info`, { cache: "no-store" }),
    laporanTautan: (timId) =>
      aFetch(`/api/fasilitator/tim/${timId}/laporan-tautan`, { method: "POST" }),
    laporanFile: async (timId) => {
      const res = await fetch(`${API_URL}/api/fasilitator/tim/${timId}/laporan-file`, {
        headers: authHeaders(), cache: "no-store",
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { msg = (await res.json()).error || msg; } catch {}
        throw new Error(msg);
      }
      return res.arrayBuffer();
    },
    presentasiInfo: (timId) =>
      aFetch(`/api/fasilitator/tim/${timId}/presentasi-info`, { cache: "no-store" }),
    presentasiTautan: (timId) =>
      aFetch(`/api/fasilitator/tim/${timId}/presentasi-tautan`, { method: "POST" }),
  },

  // ---- Komentar (fasilitator ↔ tim, 2 arah) ----
  komentar: {
    /** list("kegiatan", targetId, timId?) — timId hanya untuk fasilitator. */
    list: (jenis, targetId, timId) => {
      const p = new URLSearchParams({ jenis });
      if (targetId != null && targetId !== "") p.set("target_id", targetId);
      if (timId) p.set("tim", timId);
      return aFetch(`/api/komentar?${p}`, { cache: "no-store" });
    },
    jumlah: (jenis, timId) => {
      const p = new URLSearchParams({ jenis });
      if (timId) p.set("tim", timId);
      return aFetch(`/api/komentar/jumlah?${p}`, { cache: "no-store" });
    },
    tambah: (data) =>
      aFetch("/api/komentar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    ubah: (id, isi) =>
      aFetch(`/api/komentar/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isi }),
      }),
    hapus: (id) => aFetch(`/api/komentar/${id}`, { method: "DELETE" }),
    selesai: (id, selesai = true) =>
      aFetch(`/api/komentar/${id}/selesai`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selesai }),
      }),
    belumDibaca: () => aFetch("/api/komentar/belum-dibaca", { cache: "no-store" }),
    tandaiDibaca: (ids) =>
      aFetch("/api/komentar/tandai-dibaca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      }),
  },

  // ---- ACC / pengesahan oleh dosen pendamping ----
  persetujuan: {
    /** Peta status per entri: { [target_id]: { status, catatan, dosen_username } }. */
    list: (jenis, timId) => {
      const p = new URLSearchParams();
      if (jenis) p.set("jenis", jenis);
      if (timId) p.set("tim", timId);
      return aFetch(`/api/persetujuan?${p}`, { cache: "no-store" });
    },
    /** Rekap per jenis (disetujui/revisi/menunggu) untuk kartu ringkasan. */
    ringkas: (timId) => {
      const p = new URLSearchParams();
      if (timId) p.set("tim", timId);
      return aFetch(`/api/persetujuan/ringkas?${p}`, { cache: "no-store" });
    },
    /** Set status: "disetujui" | "revisi" | "menunggu" (khusus dosen). */
    set: (data) =>
      aFetch("/api/persetujuan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
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

