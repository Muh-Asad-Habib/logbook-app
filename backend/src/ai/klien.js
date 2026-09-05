/**
 * Klien Ollama — pemanggil model bahasa di server kampus
 * (https://ollama.if.unismuh.ac.id) untuk asisten logbook.
 *
 * Dipanggil HANYA dari backend: data tim disuntik sebagai konteks di sini,
 * browser tidak pernah berbicara langsung ke Ollama (CSP connect-src 'self'
 * tetap ketat, kunci API — bila ada — tidak bocor, dan pembatas laju kita
 * yang berlaku, bukan server kampus yang kebanjiran).
 *
 * Konfigurasi (.env — semuanya opsional):
 *   OLLAMA_URL      alamat server (bawaan: https://ollama.if.unismuh.ac.id)
 *   OLLAMA_MODEL    nama model   (bawaan: qwen2.5:7b-instruct — cepat, bahasa
 *                   Indonesia baik, patuh format JSON)
 *   OLLAMA_API_KEY  bila server mewajibkan header Authorization
 *   AI_NONAKTIF=1   matikan fitur AI sepenuhnya
 */
import "./../config.js"; // memuat .env lebih dulu

const URL_DEFAULT = "https://ollama.if.unismuh.ac.id";
const MODEL_DEFAULT = "qwen2.5:7b-instruct";

const cfg = () => ({
  url: String(process.env.OLLAMA_URL || URL_DEFAULT).replace(/\/+$/, ""),
  model: String(process.env.OLLAMA_MODEL || MODEL_DEFAULT),
  apiKey: String(process.env.OLLAMA_API_KEY || ""),
  nonaktif: /^(1|true|ya)$/i.test(String(process.env.AI_NONAKTIF || "")),
});

/** Apakah fitur AI diaktifkan di pemasangan ini? */
export const aiAktif = () => !cfg().nonaktif;

/** Nama model & host — untuk ditampilkan di UI (tanpa kunci apa pun). */
export function infoAI() {
  const c = cfg();
  let host = "";
  try { host = new URL(c.url).host; } catch {}
  return { aktif: !c.nonaktif, model: c.model, host };
}

const headers = () => {
  const h = { "Content-Type": "application/json" };
  const { apiKey } = cfg();
  if (apiKey) h.Authorization = `Bearer ${apiKey}`;
  return h;
};

/**
 * Batas waktu panggilan model. Vercel memberi 60 dtk per fungsi
 * (vercel.json → maxDuration); sisakan ruang untuk menyusun konteks & respons.
 */
const TIMEOUT_MS = 50_000;

/**
 * Kesalahan yang aman ditampilkan ke pengguna (status HTTP disertakan).
 * `aman` menandai bahwa pesannya memang ditulis untuk dibaca pengguna, supaya
 * penangan galat pusat tidak menggantinya dengan "gangguan server" — penting
 * sekarang karena pengguna memilih modelnya sendiri dan berhak tahu persis
 * apa yang salah ("model X tidak tersedia", "server AI terlalu lama", dst.).
 */
class AIError extends Error {
  constructor(pesan, status = 502) {
    super(pesan);
    this.status = status;
    this.aman = true;
  }
}

/**
 * Panggil endpoint /api/chat Ollama (non-streaming).
 * @param {{role: "system"|"user"|"assistant", content: string}[]} messages
 * @param {{temperature?: number, maxTokens?: number, json?: boolean, model?: string}} [opt]
 *   `model` mengganti model bawaan untuk SATU panggilan ini — pemanggil wajib
 *   memvalidasinya lebih dulu lewat modelTersedia() supaya nama sembarangan
 *   tidak diteruskan ke server kampus.
 * @returns {Promise<{teks: string, model: string, durasiMs: number}>}
 */
export async function chat(messages, { temperature = 0.3, maxTokens = 700, json = false, model = "" } = {}) {
  const c = cfg();
  if (c.nonaktif) throw new AIError("Fitur AI dinonaktifkan pada pemasangan ini", 503);
  const dipakai = String(model || "").trim() || c.model;
  const mulai = Date.now();
  let res;
  try {
    res = await fetch(`${c.url}/api/chat`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        model: dipakai,
        stream: false,
        messages,
        ...(json ? { format: "json" } : {}),
        options: { temperature, num_predict: maxTokens },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const timeout = e?.name === "TimeoutError" || e?.name === "AbortError";
    throw new AIError(
      timeout
        ? "Server AI terlalu lama menjawab — coba pertanyaan yang lebih singkat"
        : "Server AI tidak dapat dihubungi saat ini",
      504,
    );
  }
  if (!res.ok) {
    const isi = await res.text().catch(() => "");
    if (res.status === 404 && /model/i.test(isi)) {
      throw new AIError(`Model "${dipakai}" tidak tersedia di server AI`, 502);
    }
    throw new AIError(`Server AI membalas ${res.status}`, 502);
  }
  const data = await res.json().catch(() => null);
  const teks = String(data?.message?.content || "").trim();
  if (!teks) throw new AIError("Server AI membalas kosong", 502);
  return { teks, model: dipakai, durasiMs: Date.now() - mulai };
}

/**
 * Ambil objek JSON dari jawaban model — toleran terhadap pembungkus
 * ```json … ``` atau teks tambahan di sekitarnya.
 */
export function parseJsonModel(teks) {
  const s = String(teks || "").trim();
  try { return JSON.parse(s); } catch {}
  const m = s.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch {}
  }
  return null;
}

/* ---------- daftar model & status server (di-cache 5 menit per instance) ---------- */
let _status = { t: 0, data: null };
let _model = { t: 0, data: null };
const STATUS_CACHE_MS = 5 * 60_000;

/**
 * Model PENYEMAT (embedding) seperti nomic-embed-text / bge-m3 ikut terdaftar
 * di /api/tags, tetapi tidak bisa diajak mengobrol — /api/chat akan gagal.
 * Model seperti itu disembunyikan dari pilihan supaya pengguna tidak memilih
 * sesuatu yang pasti error.
 *
 * Begitu pula model berakhiran `:cloud`: itu hanya penerus ke layanan awan
 * Ollama dan menuntut kredensial tersendiri — di server kampus konsisten
 * membalas 401. Bila pemasanganmu memang punya kredensialnya, setel
 * `AI_MODEL_AWAN=1` agar model awan ikut ditawarkan.
 */
const izinkanAwan = () => /^(1|true|ya)$/i.test(String(process.env.AI_MODEL_AWAN || ""));
const bisaNgobrol = (m) =>
  !/bert/i.test(m.keluarga) &&
  !/(^|[-_/])(embed|embedding|bge|gte|e5|minilm)/i.test(m.nama) &&
  (izinkanAwan() || !/:cloud$/i.test(m.nama));

/**
 * Daftar model yang benar-benar terpasang di server AI (GET /api/tags).
 * Dipakai untuk MENGISI pilihan model di antarmuka sekaligus MEMVALIDASI
 * pilihan pengguna — nama model sembarangan tidak boleh diteruskan ke server
 * kampus (bisa memicu pengunduhan model raksasa / memboroskan sumber daya).
 *
 * @returns {Promise<{nama: string, label: string, ukuran: number, keluarga: string, parameter: string}[]>}
 *   Terurut menaik berdasarkan ukuran (model kecil = jawaban lebih cepat);
 *   model tanpa ukuran (mis. yang dilayani awan) diletakkan paling akhir.
 */
export async function daftarModel() {
  if (Date.now() - _model.t < STATUS_CACHE_MS && _model.data) return _model.data;
  let out = [];
  try {
    const res = await fetch(`${cfg().url}/api/tags`, {
      headers: headers(), signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      const j = await res.json().catch(() => ({}));
      out = (j?.models || [])
        .map((m) => ({
          nama: String(m?.name || ""),
          label: String(m?.name || "").replace(/:latest$/, ""),
          ukuran: Number(m?.size) || 0,
          keluarga: String(m?.details?.family || ""),
          parameter: String(m?.details?.parameter_size || ""),
        }))
        .filter((m) => m.nama && bisaNgobrol(m))
        .sort((a, b) => (a.ukuran || Infinity) - (b.ukuran || Infinity));
    }
  } catch {}
  // Hanya cache hasil yang berisi — server sempoyongan sesaat tidak boleh
  // membuat daftar pilihan kosong selama 5 menit.
  if (out.length) _model = { t: Date.now(), data: out };
  return out;
}

/**
 * Apakah nama model boleh dipakai? Cocokkan dengan daftar di server, termasuk
 * bentuk tanpa tag (`qwen2.5:7b-instruct` vs `qwen2.5:7b-instruct:latest`).
 * @returns {Promise<string>} nama model yang sah (siap dikirim), "" bila tidak.
 */
export async function modelTersedia(nama) {
  const n = String(nama || "").trim();
  if (!n) return "";
  const daftar = await daftarModel();
  if (!daftar.length) return ""; // daftar tak terbaca → jangan tebak-tebakan
  const cocok = daftar.find((m) => m.nama === n || m.label === n || m.nama === `${n}:latest`);
  return cocok ? cocok.nama : "";
}

/**
 * Periksa ketersediaan server & model (GET /api/tags). Ringan, di-cache.
 * @returns {Promise<{tersedia: boolean, modelAda: boolean, model: string, host: string, aktif: boolean}>}
 */
export async function statusAI() {
  const info = infoAI();
  if (!info.aktif) return { ...info, tersedia: false, modelAda: false };
  if (Date.now() - _status.t < STATUS_CACHE_MS && _status.data) return _status.data;
  const daftar = await daftarModel();
  const tersedia = daftar.length > 0;
  const modelAda = daftar.some((m) => m.nama === info.model || m.nama === `${info.model}:latest`);
  _status = { t: Date.now(), data: { ...info, tersedia, modelAda } };
  return _status.data;
}

