/** Klien API — frontend & API dilayani SATU server, jadi cukup URL relatif.
 *  Dengan begitu aplikasi otomatis bekerja lewat localhost, IP LAN,
 *  maupun URL tunnel publik (https://xxx.trycloudflare.com) tanpa konfigurasi.
 *
 *  Autentikasi: token disimpan di localStorage dan dikirim sebagai header
 *  Authorization. Untuk <img> dan tautan unduhan — yang tidak bisa mengirim
 *  header sendiri — server memasang cookie HttpOnly `logbook_sesi` saat login,
 *  sehingga token TIDAK PERNAH muncul di URL (dulu `?token=…`, yang bocor ke
 *  riwayat browser, log server/CDN, dan header Referer). */
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

/** fetch dengan header Authorization + penanganan 401 terpusat.
 *  `credentials: "same-origin"` memastikan cookie sesi HttpOnly ikut terkirim
 *  (dipakai <img> & tautan unduhan) dan selalu disegarkan oleh server. */
const aFetch = (path, opts = {}) =>
  fetch(`${API_URL}${path}`, {
    ...opts,
    credentials: "same-origin",
    headers: authHeaders(opts.headers || {}),
  }).then(handle);


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

async function uploadChunked(basePath, file, onProgress, extra = {}, selesai = "selesai") {
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
  return aFetch(`${basePath}/${selesai}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, total, ...extra }),
  });
}

const LANGSUNG_MAKS = 3 * 1024 * 1024; // ≤3 MB → satu request multipart

/* ---------- UNGGAH LANGSUNG BROWSER → IMAGEKIT (hemat trafik server) ----------
 * Server hanya menerbitkan "izin" (beberapa ratus byte) lalu memverifikasi
 * hasilnya; byte berkas berjalan langsung dari browser ke ImageKit. Untuk
 * berkas 170 MB ini menghemat ratusan MB trafik Vercel per unggahan. */

/** Unggah SATU bagian ke ImageKit; kembalikan { key, fileId }. */
async function unggahBagianIK(dasar, izin, key, potong) {
  const fd = new FormData();
  fd.append("file", potong, key);
  fd.append("fileName", key);
  fd.append("folder", dasar.folder);
  fd.append("useUniqueFileName", "false");
  fd.append("publicKey", dasar.publicKey);
  fd.append("token", izin.token);
  fd.append("expire", String(izin.expire));
  fd.append("signature", izin.signature);
  const res = await fetch(dasar.uploadUrl, { method: "POST", body: fd });
  if (!res.ok) {
    let pesan = `HTTP ${res.status}`;
    try { pesan = (await res.json())?.message || pesan; } catch {}
    throw new Error(`Unggah ke penyimpanan gagal: ${pesan}`);
  }
  const info = await res.json();
  if (!info?.fileId) throw new Error("Penyimpanan tidak mengembalikan fileId");
  return { key, fileId: info.fileId };
}

/**
 * Unggah berkas dokumen (.pptx/.docx) langsung ke ImageKit.
 * @returns hasil pendaftaran, atau null bila server meminta jalur lama
 *   (mode lokal tanpa ImageKit).
 */
async function unggahDokumenLangsung(dasarPath, file, onProgress) {
  const izinRes = await aFetch(`${dasarPath}/izin-unggah`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nama: file.name, ukuran: file.size }),
  });
  if (izinRes?.mode !== "langsung") return null; // → fallback jalur server

  const { partMax, jumlah, bagian, izin, stem, tanda } = izinRes;
  const terunggah = [];
  for (let i = 0; i < jumlah; i++) {
    const potong = file.slice(i * partMax, (i + 1) * partMax);
    terunggah.push(await unggahBagianIK(izinRes, izin[i], bagian[i], potong));
    // sisakan 1 langkah untuk verifikasi server
    onProgress?.(Math.round(((i + 1) / (jumlah + 1)) * 100));
  }
  return aFetch(`${dasarPath}/daftarkan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nama: file.name, stem, jumlah, tanda, bagian: terunggah }),
  });
}

/** Unggah presentasi (.pptx) langsung ke ImageKit. */
const unggahPresentasiLangsung = (file, onProgress) =>
  unggahDokumenLangsung("/api/presentasi", file, onProgress);

/** Unggah laporan kemajuan (.docx) langsung ke ImageKit. */
const unggahLaporanLangsung = (file, onProgress) =>
  unggahDokumenLangsung("/api/laporan", file, onProgress);

/**
 * Rakit berkas dari daftar signed URL CDN menjadi satu Blob — byte ditarik
 * langsung dari ImageKit, tidak melewati server kita sama sekali.
 */
async function rakitDariUrl(urls, onProgress, mime) {
  const bagian = [];
  for (let i = 0; i < urls.length; i++) {
    const res = await fetch(urls[i], { cache: "no-store" });
    if (!res.ok) throw new Error(`Bagian #${i + 1} gagal diambil (HTTP ${res.status})`);
    bagian.push(await res.arrayBuffer());
    onProgress?.(Math.round(((i + 1) / urls.length) * 100));
  }
  return new Blob(bagian, { type: mime });
}

const MIME_PPTX =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const MIME_DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Ambil berkas dokumen sebagai Blob.
 * Utama : daftar signed URL CDN (`…/bagian`) lalu dirakit di browser.
 * Cadangan: lewat server (mode lokal, atau bila CDN menolak CORS).
 */
async function ambilDokumenBlob(pathBagian, pathFile, onProgress, mime) {
  try {
    const info = await aFetch(pathBagian, { cache: "no-store" });
    if (info?.urls?.length) {
      return { nama: info.nama || "", blob: await rakitDariUrl(info.urls, onProgress, mime) };
    }
  } catch {
    // lanjut ke cadangan lewat server
  }
  const res = await fetch(`${API_URL}${pathFile}`, {
    headers: authHeaders(), cache: "no-store", credentials: "same-origin",
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  onProgress?.(100);
  return { nama: "", blob: await res.blob() };
}

/** Berkas presentasi (.pptx) sebagai Blob. */
const ambilPresentasiBlob = (pathBagian, pathFile, onProgress) =>
  ambilDokumenBlob(pathBagian, pathFile, onProgress, MIME_PPTX);

/** Berkas laporan (.docx) sebagai Blob. */
const ambilLaporanBlob = (pathBagian, pathFile, onProgress) =>
  ambilDokumenBlob(pathBagian, pathFile, onProgress, MIME_DOCX);


export const api = {
  // ---- Auth ----
  register: (username, password, opts = {}) =>
    fetch(`${API_URL}/api/auth/register`, {
      method: "POST",
      credentials: "same-origin", // simpan cookie sesi yang dikirim server
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, ...opts }),
    }).then(parse),
  login: (username, password) =>
    fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      credentials: "same-origin", // simpan cookie sesi yang dikirim server
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

  // ---- Perangkat & sesi aktif (kendali keamanan milik pengguna sendiri) ----
  sesi: {
    /** Daftar perangkat yang sedang login: [{ id, perangkat, ip, terakhir, ini_perangkat }]. */
    list: () => aFetch("/api/auth/sesi", { cache: "no-store" }),
    /** Keluarkan satu perangkat (id dari daftar — bukan token). */
    cabut: (id) => aFetch(`/api/auth/sesi/${encodeURIComponent(id)}`, { method: "DELETE" }),
    /** Keluarkan semua perangkat lain; sesi yang sedang dipakai tetap aktif. */
    cabutLainnya: () => aFetch("/api/auth/sesi/lainnya", { method: "POST" }),
  },

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

  // ---- Ekspor ----
  /**
   * Siapkan berkas ekspor & minta tautannya: { mode: "cdn"|"server", url, nama }.
   * Mode "cdn" → berkas dititipkan server ke ImageKit dan diunduh browser
   * LANGSUNG dari CDN, jadi tidak terbentur batas respons Vercel (±4,5 MB)
   * dan tidak memakan kuota bandwidth serverless. Lihat lib/unduh.js.
   */
  eksporTautan: (jenis) =>
    aFetch(`/api/export/tautan/${encodeURIComponent(jenis)}`, { method: "POST" }),


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
  /**
   * Unggah laporan. Jalur utama: LANGSUNG ke ImageKit (byte tidak lewat
   * server → trafik Vercel nyaris nol). Jalur cadangan: lewat server
   * (mode lokal tanpa ImageKit, atau bila unggahan langsung gagal).
   */
  uploadLaporan: async (file, onProgress) => {
    try {
      const hasil = await unggahLaporanLangsung(file, onProgress);
      if (hasil) return hasil;
    } catch (e) {
      // Berkas besar TIDAK boleh jatuh ke jalur server (batas body Vercel).
      if (file.size > LANGSUNG_MAKS * 32) throw e;
    }
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
  /** Berkas laporan sebagai Blob — ditarik dari CDN bila memungkinkan. */
  laporanBerkas: (onProgress) =>
    ambilLaporanBlob("/api/laporan/file/bagian", "/api/laporan/file", onProgress),
  /** Ambil berkas laporan sebagai ArrayBuffer (untuk dirender docx-preview). */
  laporanFile: async (onProgress) => {
    const { blob } = await ambilLaporanBlob(
      "/api/laporan/file/bagian", "/api/laporan/file", onProgress
    );
    return blob.arrayBuffer();
  },

  // ---- Presentasi (.pptx + tautan Canva — boleh keduanya, hapus terpisah) ----
  presentasiInfo: () => aFetch("/api/presentasi/info", { cache: "no-store" }),
  /**
   * Unggah presentasi. Jalur utama: LANGSUNG ke ImageKit (byte tidak lewat
   * server → trafik Vercel nyaris nol). Jalur cadangan: lewat server
   * (mode lokal tanpa ImageKit, atau bila unggahan langsung gagal).
   */
  uploadPresentasi: async (file, onProgress) => {
    try {
      const hasil = await unggahPresentasiLangsung(file, onProgress);
      if (hasil) return hasil;
    } catch (e) {
      // Berkas besar TIDAK boleh jatuh ke jalur server (batas body Vercel).
      if (file.size > LANGSUNG_MAKS * 32) throw e;
    }
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
  /** Berkas presentasi sebagai Blob — ditarik dari CDN bila memungkinkan. */
  presentasiBerkas: (onProgress) =>
    ambilPresentasiBlob("/api/presentasi/file/bagian", "/api/presentasi/file", onProgress),
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
    /** Berkas laporan tim sebagai Blob — ditarik dari CDN bila memungkinkan. */
    laporanBerkas: (timId, onProgress) =>
      ambilLaporanBlob(
        `/api/fasilitator/tim/${timId}/laporan-bagian`,
        `/api/fasilitator/tim/${timId}/laporan-file`,
        onProgress
      ),
    /** Berkas laporan tim sebagai ArrayBuffer (untuk dirender docx-preview). */
    laporanFile: async (timId, onProgress) => {
      const { blob } = await ambilLaporanBlob(
        `/api/fasilitator/tim/${timId}/laporan-bagian`,
        `/api/fasilitator/tim/${timId}/laporan-file`,
        onProgress
      );
      return blob.arrayBuffer();
    },
    presentasiInfo: (timId) =>
      aFetch(`/api/fasilitator/tim/${timId}/presentasi-info`, { cache: "no-store" }),
    presentasiTautan: (timId) =>
      aFetch(`/api/fasilitator/tim/${timId}/presentasi-tautan`, { method: "POST" }),
    /** Berkas presentasi tim sebagai Blob — ditarik dari CDN bila memungkinkan. */
    presentasiBerkas: (timId, onProgress) =>
      ambilPresentasiBlob(
        `/api/fasilitator/tim/${timId}/presentasi-bagian`,
        `/api/fasilitator/tim/${timId}/presentasi-file`,
        onProgress
      ),
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

/**
 * URL gambar di server.
 *
 * KEAMANAN: token TIDAK lagi ditempel di URL. Dulu setiap <img> memuat
 * `?token=…` berisi token login penuh, sehingga token ikut tercatat di
 * riwayat browser, log server, log CDN, dan header Referer. Sekarang browser
 * mengirim cookie HttpOnly `logbook_sesi` secara otomatis — token tidak
 * pernah terlihat di URL dan tidak bisa dibaca JavaScript.
 *
 * @param {string} key  kunci berkas
 * @param {number} [lebar] bila diisi, server mengirim versi kecil selebar
 *   sekian piksel (hemat kuota & bandwidth) — lihat thumbUrl().
 */
export const fotoUrl = (key, lebar = 0) =>
  `${API_URL}/api/files/${encodeURIComponent(key)}${lebar ? `?w=${lebar}` : ""}`;

/**
 * URL thumbnail — dipakai daftar, galeri, dan timeline yang hanya menampilkan
 * foto berukuran kecil. Gambar 1600px (±300 KB) diganti versi ±300px
 * (±20–40 KB): hemat sekitar 80–90% bandwidth tanpa perubahan tampilan.
 * Lightbox tetap memakai fotoUrl() resolusi penuh.
 */
export const thumbUrl = (key, lebar = 320) => fotoUrl(key, lebar);

/** URL unduhan ekspor (tautan <a> memakai cookie sesi, bukan token di URL). */
export const exportUrl = (path) => `${API_URL}${path}`;



export const fmtRupiah = (n) => "Rp" + Number(n || 0).toLocaleString("id-ID");

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export const fmtTgl = (iso) => {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
};

export const fmtDurasi = (menit) =>
  menit >= 60 ? `${Math.floor(menit / 60)} j ${menit % 60} mnt` : `${menit} mnt`;

