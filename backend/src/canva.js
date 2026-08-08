/**
 * Integrasi Canva Connect API — jalur "kirim tautan saja".
 *
 * Alur:
 *  1. Pengguna menghubungkan akun Canva SEKALI (OAuth 2.0 + PKCE).
 *  2. Aplikasi menukar code → access/refresh token (disimpan per pengguna).
 *  3. Saat konversi: id desain diambil dari tautan Canva tersimpan →
 *     minta Canva mengekspor PPTX (job ekspor, di-poll sampai selesai) →
 *     unduh hasilnya → diteruskan ke pipeline penanaman font (pptx-canva.js).
 *
 * Persiapan sekali (pemilik aplikasi): buat integrasi di
 * https://www.canva.com/developers/integrations → salin Client ID & Secret ke
 * .env (CANVA_CLIENT_ID, CANVA_CLIENT_SECRET) dan daftarkan redirect URL:
 *   https://<domain-app>/api/presentasi/canva-connect/callback
 * Scope minimum: design:content:read
 */
import crypto from "node:crypto";
import { q } from "./db.js";

const AUTH_URL = "https://www.canva.com/api/oauth/authorize";
const TOKEN_URL = "https://api.canva.com/rest/v1/oauth/token";
const API = "https://api.canva.com/rest/v1";
const SCOPE = "design:content:read";
const UMUR_STATE_MS = 10 * 60 * 1000; // form OAuth harus selesai ≤ 10 menit

export const canvaSiap = () =>
  !!(process.env.CANVA_CLIENT_ID && process.env.CANVA_CLIENT_SECRET);

const basicAuth = () =>
  "Basic " + Buffer.from(
    `${process.env.CANVA_CLIENT_ID}:${process.env.CANVA_CLIENT_SECRET}`
  ).toString("base64");

/** Ambil id desain dari tautan Canva apa pun (…/design/<ID>/…). */
export function idDesainDariUrl(url) {
  const m = String(url || "").match(/canva\.com\/design\/([A-Za-z0-9_-]{8,})/);
  return m ? m[1] : "";
}

/* ================= OAuth (PKCE) ================= */

const b64url = (buf) => buf.toString("base64")
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/**
 * Mulai OAuth: buat state + PKCE verifier (disimpan di DB — aman untuk
 * serverless yang tak punya memori bersama), kembalikan URL persetujuan.
 */
export async function mulaiOAuth(userId, redirectUri) {
  const state = b64url(crypto.randomBytes(24));
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  await q("DELETE FROM canva_oauth_state WHERE user_id = $1 OR created_at < $2",
    [userId, Date.now() - UMUR_STATE_MS]);
  await q(
    `INSERT INTO canva_oauth_state (state, user_id, verifier, created_at)
     VALUES ($1, $2, $3, $4)`,
    [state, userId, verifier, Date.now()]
  );
  const p = new URLSearchParams({
    response_type: "code",
    client_id: process.env.CANVA_CLIENT_ID,
    scope: SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: "s256",
    redirect_uri: redirectUri,
  });
  return `${AUTH_URL}?${p}`;
}

/** Selesaikan OAuth: cocokkan state, tukar code → token, simpan per pengguna. */
export async function selesaikanOAuth(state, code, redirectUri) {
  const rows = await q(
    "SELECT user_id, verifier, created_at FROM canva_oauth_state WHERE state = $1",
    [state]
  );
  const s = rows[0];
  await q("DELETE FROM canva_oauth_state WHERE state = $1", [state]).catch(() => {});
  if (!s || Date.now() - Number(s.created_at) > UMUR_STATE_MS) {
    throw Object.assign(new Error("Sesi OAuth kedaluwarsa — ulangi dari tombol Hubungkan Canva"), { status: 400 });
  }
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    code_verifier: s.verifier,
    redirect_uri: redirectUri,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw Object.assign(
      new Error(`Canva menolak penukaran token: ${data.error_description || data.error || res.status}`),
      { status: 502 }
    );
  }
  await simpanToken(s.user_id, data);
  return s.user_id;
}

async function simpanToken(userId, data) {
  const exp = Date.now() + Math.max(60, Number(data.expires_in || 0) - 60) * 1000;
  await q(
    `INSERT INTO canva_oauth (user_id, access_token, refresh_token, exp, updated_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET access_token = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token, exp = EXCLUDED.exp,
       updated_at = EXCLUDED.updated_at`,
    [userId, data.access_token, data.refresh_token || "", exp, new Date().toISOString()]
  );
}

export async function statusKoneksi(userId) {
  const rows = await q("SELECT exp FROM canva_oauth WHERE user_id = $1", [userId]);
  return { terhubung: rows.length > 0, siap: canvaSiap() };
}

export async function putuskanKoneksi(userId) {
  const rows = await q(
    "DELETE FROM canva_oauth WHERE user_id = $1 RETURNING user_id", [userId]);
  return rows.length > 0;
}

/** Access token yang masih hidup — refresh otomatis bila hampir kedaluwarsa. */
async function tokenAktif(userId) {
  const rows = await q(
    "SELECT access_token, refresh_token, exp FROM canva_oauth WHERE user_id = $1",
    [userId]
  );
  const t = rows[0];
  if (!t) {
    throw Object.assign(new Error("Akun Canva belum terhubung — klik Hubungkan Canva dahulu"), { status: 401 });
  }
  if (Date.now() < Number(t.exp)) return t.access_token;
  // refresh
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: t.refresh_token,
    scope: SCOPE,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    await putuskanKoneksi(userId).catch(() => {});
    throw Object.assign(
      new Error("Sesi Canva kedaluwarsa — hubungkan ulang akun Canva"), { status: 401 });
  }
  await simpanToken(userId, data);
  return data.access_token;
}

/* ================= Ekspor desain ================= */

const POLL_MS = 1500;
const POLL_MAKS_MS = 45 * 1000;

/**
 * Ekspor desain Canva menjadi PPTX lewat Connect API.
 * @returns {Promise<Buffer>} isi berkas .pptx hasil ekspor Canva
 */
export async function eksporPptx(userId, designId) {
  const token = await tokenAktif(userId);
  const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const buat = await fetch(`${API}/exports`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ design_id: designId, format: { type: "pptx" } }),
  });
  const awal = await buat.json().catch(() => ({}));
  if (!buat.ok || !awal.job?.id) {
    const pesan = awal.message || awal.error || `HTTP ${buat.status}`;
    throw Object.assign(
      new Error(`Canva menolak permintaan ekspor: ${pesan}. ` +
        "Pastikan desain milik akun Canva yang terhubung."), { status: 502 });
  }

  // Poll sampai job selesai
  let job = awal.job;
  const mulai = Date.now();
  while (job.status === "in_progress") {
    if (Date.now() - mulai > POLL_MAKS_MS) {
      throw Object.assign(new Error("Ekspor Canva terlalu lama — coba lagi"), { status: 504 });
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
    const cek = await fetch(`${API}/exports/${job.id}`, { headers: H });
    const data = await cek.json().catch(() => ({}));
    if (!cek.ok || !data.job) {
      throw Object.assign(new Error("Gagal memeriksa status ekspor Canva"), { status: 502 });
    }
    job = data.job;
  }
  if (job.status !== "success" || !job.urls?.length) {
    throw Object.assign(
      new Error(`Ekspor Canva gagal: ${job.error?.message || job.status}`), { status: 502 });
  }

  const unduh = await fetch(job.urls[0]);
  if (!unduh.ok) {
    throw Object.assign(new Error("Gagal mengunduh hasil ekspor dari Canva"), { status: 502 });
  }
  return Buffer.from(await unduh.arrayBuffer());
}

