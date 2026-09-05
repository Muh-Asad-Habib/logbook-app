import { PENGETAHUAN_PKM, SKEMA_PKM, SUMBER_PKM } from './pkm-knowledge.js';
export { SKEMA_PKM, SUMBER_PKM };
export const KUNCI_PROFIL_PKM = 'pkm_profil';
const YEARS = Object.keys(SUMBER_PKM).map(Number);
const kode = (s) => String(s || '').toUpperCase().replace(/\s+/g, '-');

export function validasiProfilPkm(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Profil PKM tidak valid');
  if (input.skema != null && typeof input.skema !== 'string') throw new Error('Skema PKM harus berupa teks');
  if (input.tahun != null && !['string', 'number'].includes(typeof input.tahun)) throw new Error('Tahun PKM tidak valid');
  const skema = kode(input.skema);
  const tahun = input.tahun === '' || input.tahun == null ? null : Number(input.tahun);
  if (skema && !Object.hasOwn(SKEMA_PKM, skema)) throw new Error('Pilih skema PKM yang tersedia');
  if (tahun !== null && !YEARS.includes(tahun)) throw new Error('Tahun PKM harus 2022–2026');
  if (input.judul != null && typeof input.judul !== 'string') throw new Error('Judul proposal harus berupa teks');
  const judul = String(input.judul || '').trim();
  if (judul.length > 240) throw new Error('Judul proposal maksimal 240 karakter');
  return { skema, tahun, judul };
}

export function skemaEksplisit(teks) {
  const matches = String(teks || '').toUpperCase().matchAll(/\bPKM[\s-]*(RE|RSH|PM|PI|KC|KI|VGK|AI|GFT|K)\b/g);
  return [...new Set([...matches].map((m) => `PKM-${m[1]}`))];
}

export function bacaProfilPkm(raw, { namaTim = '', kegiatan = [] } = {}) {
  let profil = { skema: '', tahun: null, judul: '' };
  try { if (raw) profil = validasiProfilPkm(typeof raw === 'string' ? JSON.parse(raw) : raw); } catch { /* metadata lama/tidak sah tidak dijadikan dasar */ }
  // Hanya kode eksplisit, bukan klasifikasi spekulatif dari nama/jenis belanja.
  const teks = [profil.judul, namaTim, ...kegiatan.map((e) => String(e.kegiatan || '').slice(0, 500))].join('\n').slice(0, 150000);
  const indikasi = skemaEksplisit(teks);
  return { ...profil, indikasi, status: profil.skema && profil.tahun ? 'dikonfirmasi_tim' : 'perlu_konfirmasi' };
}

const tokens = (s) => [...new Set(String(s || '').toLowerCase().match(/[a-z0-9]{3,}/g) || [])];
const indexed = PENGETAHUAN_PKM.map((item) => ({ ...item, terms: new Set(tokens(`${item.id} ${item.teks} ${item.skema.join(' ')}`)) }));

/** Retrieval lokal: indeks dimuat sekali, tidak mengunduh PDF/menjalankan embedding saat chat. */
export function cariPengetahuanPkm(pertanyaan, profil = {}, { maksChar = 4800, maksPotongan = 6 } = {}) {
  const question = String(pertanyaan || '');
  let explicitYears = [...new Set((question.match(/\b20\d{2}\b/g) || []).map(Number))];
  const range = question.match(/\b(20\d{2})\s*(?:-|–|sampai|hingga)\s*(20\d{2})\b/i);
  if (range && Number(range[2]) >= Number(range[1]) && Number(range[2]) - Number(range[1]) <= 9) {
    explicitYears = [...new Set([...explicitYears, ...Array.from({ length: Number(range[2]) - Number(range[1]) + 1 }, (_, i) => Number(range[1]) + i)])];
  }
  const tahun = explicitYears.length ? explicitYears : /\b(?:5|lima)\s+tahun\s+terakhir\b/i.test(question) ? YEARS : [profil.tahun || 2026];
  const unsupported = tahun.filter((y) => !YEARS.includes(y));
  const querySchemes = skemaEksplisit(pertanyaan);
  const skema = querySchemes.length ? querySchemes : profil.skema ? [profil.skema] : profil.indikasi?.length === 1 ? profil.indikasi : [];
  const words = tokens(pertanyaan);
  const candidates = indexed.filter((r) => tahun.includes(r.tahun) && (!r.skema.length || r.skema.some((s) => skema.includes(s))))
    .map((r) => ({ ...r, score: words.reduce((sum, t) => sum + (r.terms.has(t) ? 2 : 0), 0) + (r.skema.length ? 3 : 1) }))
    .sort((a, b) => b.score - a.score || b.tahun - a.tahun || a.id.localeCompare(b.id));
  // Dalam perbandingan tahunan, minimal satu ringkasan tiap tahun masuk lebih dulu.
  const first = tahun.length > 1 ? tahun.map((y) => candidates.find((r) => r.tahun === y && r.id === `umum-${y}`)).filter(Boolean) : [];
  const selected = [], seen = new Set();
  let used = 0;
  for (const r of [...first, ...candidates]) {
    if (seen.has(r.id)) continue;
    const text = `[${r.id}] Tahun ${r.tahun}; ${r.skema.join(', ') || 'umum'}; halaman PDF ${r.halaman.join(', ')}.\n${r.teks}`;
    if (selected.length >= maksPotongan || used + text.length > maksChar) continue;
    selected.push({ ...r, text }); seen.add(r.id); used += text.length + 2;
  }
  return {
    teks: selected.map((r) => r.text).join('\n\n'),
    tahun, skema,
    sumber: selected.map((r) => ({ id: r.id, judul: SUMBER_PKM[r.tahun].judul, tahun: r.tahun,
      halaman: r.halaman, url: `${SUMBER_PKM[r.tahun].url}#page=${r.halaman[0]}`, portal: SUMBER_PKM[r.tahun].portal })),
    catatan: `${unsupported.length ? `Tahun ${unsupported.join(', ')} belum tersedia dalam korpus; jangan menggantinya dengan aturan tahun lain. ` : ''}Ringkasan terpilih dari sumber resmi, bukan seluruh juknis atau jaminan kepatuhan. Periksa revisi/surat terbaru dan RAB yang disahkan. Skema/tahun yang belum dikonfirmasi tidak boleh ditebak.`,
  };
}

