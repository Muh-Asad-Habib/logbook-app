"use client";
import { useEffect, useState } from "react";
import { BookOpen, Save } from "lucide-react";
import { api, getTimAktif } from "@/lib/api";

export default function ProfilPkm({ pendamping = false }) {
  const [tim, setTim] = useState([]);
  const [timId, setTimId] = useState("");
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ skema: "", tahun: "", judul: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!pendamping) return;
    let alive = true;
    api.fasilitator.tim().then((rows) => {
      if (!alive) return;
      setTim(rows);
      setTimId(rows.some((t) => t.id === getTimAktif()) ? getTimAktif() : rows[0]?.id || "");
    }).catch((e) => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [pendamping]);
  useEffect(() => {
    if (pendamping && !timId) return;
    let alive = true;
    setData(null); setErr(""); setSaved(false);
    api.ai.profilPkm(pendamping ? timId : "").then((r) => {
      if (!alive) return;
      setData(r);
      setForm({ skema: r.profil.skema || "", tahun: String(r.profil.tahun || ""), judul: r.profil.judul || "" });
    }).catch((e) => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [pendamping, timId]);
  const set = (key, value) => { setForm((p) => ({ ...p, [key]: value })); setSaved(false); };
  const submit = async (e) => {
    e.preventDefault();
    if (!data?.bisaUbah || busy) return;
    setBusy(true); setErr(""); setSaved(false);
    try {
      const r = await api.ai.setProfilPkm(form);
      setData((d) => ({ ...d, profil: r.profil })); setSaved(true);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };
  return (
    <section className="card mt" aria-labelledby="profil-pkm-title">
      <h3 id="profil-pkm-title"><BookOpen className="lucide" /> Profil & rujukan PKM</h3>
      <p className="sub">AI memakai rujukan sesuai tahun dan skema, bukan menebaknya dari nama tim.</p>
      {pendamping && <label className="field">Tim yang diperiksa
        <select value={timId} onChange={(e) => setTimId(e.target.value)}>
          {!tim.length && <option value="">Belum ada tim yang didampingi</option>}
          {tim.map((t) => <option key={t.id} value={t.id}>{t.username}</option>)}
        </select>
      </label>}
      {err && <p className="error-box mt" role="alert">{err}</p>}
      {!data && !err && (!pendamping || timId) && <div className="skel mt" style={{ height: 120 }} />}
      {data && <>
        <p className="muted mt">{data.profil.status === "dikonfirmasi_tim"
          ? `Ditetapkan oleh tim: ${data.profil.skema}, tahun ${data.profil.tahun}.`
          : `Belum dikonfirmasi.${data.profil.indikasi?.length ? ` Kode yang disebut dalam catatan: ${data.profil.indikasi.join(", ")}.` : " Belum ada kode skema eksplisit dalam catatan."}`}</p>
        <form onSubmit={submit}>
          <div className="form-grid mt">
            <label className="field">Skema PKM
              <select value={form.skema} disabled={!data.bisaUbah || busy} onChange={(e) => set("skema", e.target.value)}>
                <option value="">Belum ditetapkan</option>
                {Object.entries(data.skema).map(([id, nama]) => <option key={id} value={id}>{id} — {nama}</option>)}
              </select>
            </label>
            <label className="field">Tahun pelaksanaan PKM
              <select value={form.tahun} disabled={!data.bisaUbah || busy} onChange={(e) => set("tahun", e.target.value)}>
                <option value="">Belum ditetapkan</option>
                {data.sumber.map((s) => <option key={s.tahun} value={s.tahun}>{s.tahun}</option>)}
              </select>
            </label>
          </div>
          <label className="field mt">Judul proposal (sesuai dokumen)
            <input value={form.judul} maxLength={240} disabled={!data.bisaUbah || busy} onChange={(e) => set("judul", e.target.value)} />
          </label>
          <p className="muted mts">Konfirmasikan dengan proposal/surat pendanaan. Penetapan ini bukan verifikasi dokumen otomatis. {pendamping && "Perubahan dilakukan oleh akun tim pemilik logbook."}</p>
          {data.bisaUbah && <button className="btn primary mt" disabled={busy}><Save className="lucide" /> {busy ? "Menyimpan…" : "Simpan profil PKM"}</button>}
          {saved && <p className="ok-note mt" role="status">Profil PKM tersimpan. Jawaban AI berikutnya memakai pilihan ini.</p>}
        </form>
        <details className="mt"><summary>Rujukan resmi 2022–2026</summary>
          <ul>{data.sumber.map((s) => <li key={s.tahun}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.judul}</a></li>)}</ul>
          <p className="muted mts">Ringkasan terpilih, bukan seluruh juknis. Periksa revisi terbaru dan RAB yang disahkan.</p>
        </details>
      </>}
    </section>
  );
}

