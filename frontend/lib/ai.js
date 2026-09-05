"use client";

/**
 * Status asisten AI — diambil sekali per tab lalu dibagikan ke semua komponen
 * (tombol melayang, tombol "Perbaiki dengan AI" di form, chip saran kategori).
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

let _status = null;
let _janji = null;

/** Promise status AI ({ aktif, model, host, tersedia, modelAda }); di-cache. */
export function ambilStatusAI() {
  if (_status) return Promise.resolve(_status);
  if (!_janji) {
    _janji = api.ai.status()
      .then((s) => { _status = s || { aktif: false }; return _status; })
      .catch(() => ({ aktif: false }))
      .finally(() => { _janji = null; });
  }
  return _janji;
}

/** Hook: status AI (null saat masih memuat). */
export function useStatusAI() {
  const [s, setS] = useState(_status);
  useEffect(() => {
    let hidup = true;
    ambilStatusAI().then((r) => { if (hidup) setS(r); });
    return () => { hidup = false; };
  }, []);
  return s;
}

/** Hook ringkas: true bila fitur AI aktif di pemasangan ini. */
export function useAIAktif() {
  const s = useStatusAI();
  return !!s?.aktif;
}

/* ==================== Pilihan MODEL (ditentukan pengguna) ====================
 * Model TIDAK ditetapkan sistem: pengguna memilih sendiri di panel asisten.
 * Pilihannya disimpan di server (per akun) supaya ikut berlaku pada tombol AI
 * di formulir Kegiatan/Keuangan dan tetap sama saat dibuka di perangkat lain.
 * Pilihan kosong ("") berarti "Otomatis" — server memakai model bawaannya.
 * Di sini nilainya dibagikan antar komponen lewat cache modul + langganan,
 * jadi daftar model hanya diambil sekali per tab. */
let _model = null; // { bawaan, pilihan, daftar }
let _janjiModel = null;
const _pendengar = new Set();

const kabari = () => _pendengar.forEach((f) => f(_model));

/** Ambil daftar model + pilihan tersimpan (di-cache per tab). */
export function ambilModelAI() {
  if (_model) return Promise.resolve(_model);
  if (!_janjiModel) {
    _janjiModel = api.ai.model()
      .then((r) => {
        _model = { bawaan: r?.bawaan || "", pilihan: r?.pilihan || "", daftar: r?.daftar || [] };
        kabari();
        return _model;
      })
      .catch(() => ({ bawaan: "", pilihan: "", daftar: [] }))
      .finally(() => { _janjiModel = null; });
  }
  return _janjiModel;
}

/** Nama model yang sedang dipilih ("" = Otomatis). Dipakai saat mengirim permintaan. */
export function modelPilihan() {
  return _model?.pilihan || "";
}

/**
 * Simpan pilihan model. Tampilan diperbarui lebih dulu (terasa seketika),
 * lalu dikirim ke server; bila server menolak, nilai lama dikembalikan.
 */
export async function pilihModelAI(nama) {
  const sebelum = _model?.pilihan || "";
  if (_model) { _model = { ..._model, pilihan: nama || "" }; kabari(); }
  try {
    const r = await api.ai.setModel(nama || "");
    if (_model) { _model = { ..._model, pilihan: r?.pilihan || "" }; kabari(); }
  } catch (e) {
    if (_model) { _model = { ..._model, pilihan: sebelum }; kabari(); }
    throw e;
  }
}

/**
 * Hook: { bawaan, pilihan, daftar } — null selama daftar model belum termuat.
 * @param {boolean} [muat=true] false → hanya ikut mendengar, tidak memicu unduh
 *   (dipakai komponen formulir yang cukup tahu pilihan yang sedang aktif).
 */
export function useModelAI(muat = true) {
  const [m, setM] = useState(_model);
  useEffect(() => {
    _pendengar.add(setM);
    if (muat) ambilModelAI();
    return () => { _pendengar.delete(setM); };
  }, [muat]);
  return m;
}

