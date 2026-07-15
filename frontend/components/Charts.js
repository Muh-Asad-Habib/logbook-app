"use client";

import { useEffect, useRef, useState } from "react";

/** Grafik SVG ringan tanpa library eksternal — responsif via ResizeObserver. */

const HARI = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const isoLokal = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const tglPendek = (iso) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${BULAN[m - 1]}`;
};

/** Ukur lebar kontainer supaya teks SVG selalu tajam & terbaca di HP. */
function useBox(fallback = 600) {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const cw = Math.round(entries[0].contentRect.width);
      if (cw > 0) setW(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w || fallback];
}

/* ============ Sparkline mini (kartu metrik) ============ */
export function Sparkline({ points, color = "#4f46e5", w = 120, h = 28 }) {
  if (!points || points.length < 2) return null;
  const max = Math.max(...points) || 1;
  const min = Math.min(...points);
  const span = max - min || 1;
  const xs = points.map((_, i) => (i * w) / (points.length - 1));
  const ys = points.map((v) => h - 3 - ((v - min) / span) * (h - 6));
  const line = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  return (
    <svg className="metric-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={color} opacity="0.12" />
      <path d={line} fill="none" stroke={color} strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="2.6" fill={color} />
    </svg>
  );
}

/* ============ Gauge donat (capaian total) ============ */
export function Gauge({ value = 0 }) {
  const target = Math.min(100, Math.max(0, value));
  const [pct, setPct] = useState(0); // busur (transisi CSS)
  const [num, setNum] = useState(0); // angka count-up
  const R = 74;
  const C = 2 * Math.PI * R;

  useEffect(() => {
    const t = setTimeout(() => setPct(target), 60);
    let raf;
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 950);
      setNum(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, [target]);

  return (
    <div className="gauge">
      <svg viewBox="0 0 190 190">
        <defs>
          <linearGradient id="ggrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4f46e5" />
            <stop offset="55%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#db2777" />
          </linearGradient>
        </defs>
        <circle cx="95" cy="95" r={R} fill="none" stroke="var(--soft, #edeffb)" strokeWidth="17" />
        <circle
          cx="95" cy="95" r={R} fill="none"
          stroke="url(#ggrad)" strokeWidth="17" strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * C} ${C}`}
          transform="rotate(-90 95 95)"
          style={{ transition: "stroke-dasharray 1s cubic-bezier(0.25, 0.8, 0.35, 1)" }}
        />
        <text x="95" y="99" textAnchor="middle" className="gauge-num">{num}%</text>
        <text x="95" y="124" textAnchor="middle" className="gauge-cap">CAPAIAN TOTAL</text>
      </svg>
    </div>
  );
}

/* ============ Peta aktivitas (heatmap ala GitHub) ============
   Satu CSS-grid untuk label bulan + label hari + sel — baris selalu
   sejajar. Di layar sempit seluruh grid bisa digeser ke samping. */
export function Heatmap({ kegiatan, weeks = 18 }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const senin0 = new Date(today);
  senin0.setDate(today.getDate() - ((today.getDay() + 6) % 7) - (weeks - 1) * 7);

  const per = {};
  for (const e of kegiatan) per[e.tanggal] = (per[e.tanggal] || 0) + e.waktu_menit;

  // Label bulan pada minggu tempat bulan berganti
  const bulanLbl = [];
  let prevM = -1;
  for (let w = 0; w < weeks; w++) {
    const d = new Date(senin0);
    d.setDate(senin0.getDate() + w * 7);
    if (d.getMonth() !== prevM) {
      bulanLbl.push({ w, nama: BULAN[d.getMonth()] });
      prevM = d.getMonth();
    }
  }

  const cells = [];
  for (let wd = 0; wd < 7; wd++) {
    for (let w = 0; w < weeks; w++) {
      const d = new Date(senin0);
      d.setDate(senin0.getDate() + w * 7 + wd);
      if (d > today) {
        cells.push({ off: true, wd, w, key: `${wd}-${w}` });
        continue;
      }
      const menit = per[isoLokal(d)] || 0;
      const lvl = menit === 0 ? 0 : menit < 60 ? 1 : menit < 160 ? 2 : 3;
      const label = `${HARI[wd]}, ${d.getDate()} ${BULAN[d.getMonth()]}`;
      const ket = menit
        ? menit >= 60 ? `${Math.floor(menit / 60)} j ${menit % 60} mnt` : `${menit} mnt`
        : "tidak ada aktivitas";
      cells.push({ lvl, wd, w, title: `${label} — ${ket}`, key: `${wd}-${w}` });
    }
  }

  return (
    <>
      <div className="heat-scroll">
        <div className="heatmap">
          {bulanLbl.map((b) => (
            <span key={`m${b.w}`} className="heat-mon"
                  style={{ gridRow: 1, gridColumn: b.w + 2 }}>
              {b.nama}
            </span>
          ))}
          {HARI.map((h, i) => (
            <span key={h} className="heat-day" style={{ gridRow: i + 2, gridColumn: 1 }}>
              {h}
            </span>
          ))}
          {cells.map((c) =>
            c.off ? (
              <div key={c.key} className="heat-cell off"
                   style={{ gridRow: c.wd + 2, gridColumn: c.w + 2 }} />
            ) : (
              <div key={c.key} className={`heat-cell ${c.lvl ? "l" + c.lvl : ""}`}
                   title={c.title} style={{ gridRow: c.wd + 2, gridColumn: c.w + 2 }} />
            )
          )}
        </div>
      </div>
      <div className="heat-legend">
        sedikit
        <i style={{ background: "#e9ecfa" }} /><i style={{ background: "#c7d2fe" }} />
        <i style={{ background: "#8b5cf6" }} /><i style={{ background: "#4f46e5" }} />
        banyak
      </div>
    </>
  );
}

/* ============ Grafik area (garis + isian gradien) ============ */
export function AreaChart({ points, yMax, color = "#4f46e5", fmtVal = (v) => v, id = "a" }) {
  const [ref, W] = useBox(600);
  if (!points || points.length === 0) return <p className="muted">Belum ada data.</p>;

  const H = 210;
  const P = W < 420 ? 28 : 34;
  const max = yMax || Math.max(...points.map((p) => p.y)) * 1.15 || 1;
  const xs = points.map((_, i) =>
    points.length === 1 ? W / 2 : P + (i * (W - 2 * P)) / (points.length - 1)
  );
  const ys = points.map((p) => H - P - (p.y / max) * (H - 2 * P));
  const line = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const area = `${line} L${xs[xs.length - 1].toFixed(1)},${H - P} L${xs[0].toFixed(1)},${H - P} Z`;

  return (
    <div ref={ref} className="chart-box">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg">
        <defs>
          <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.32" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={P} x2={W - P} y1={H - P - f * (H - 2 * P)} y2={H - P - f * (H - 2 * P)}
                stroke="var(--soft, #eef0fb)" strokeWidth="1.5" />
        ))}
        <line x1={P} x2={W - P} y1={H - P} y2={H - P} stroke="var(--line, #dbe0f0)" strokeWidth="1.5" />
        <path d={area} fill={`url(#fill-${id})`} className="fill-anim" />
        <path d={line} fill="none" stroke={color} strokeWidth="3.2"
              strokeLinejoin="round" strokeLinecap="round"
              pathLength="1" className="line-anim" />
        <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="5" fill={color}
                stroke="var(--card-solid, #fff)" strokeWidth="2.5" className="dot-anim" />
        <text x={P} y={H - 10} fontSize="11" fill="var(--muted, #94a3b8)" fontWeight="600">{tglPendek(points[0].x)}</text>
        <text x={W - P} y={H - 10} fontSize="11" fill="var(--muted, #94a3b8)" fontWeight="600" textAnchor="end">
          {tglPendek(points[points.length - 1].x)}
        </text>
        <text x={W - P + 2} y={ys[ys.length - 1] - 9} fontSize="12" fill={color} fontWeight="800" textAnchor="end">
          {fmtVal(points[points.length - 1].y)}
        </text>
        {points.map((p, i) => (
          <rect key={p.x + i} x={(xs[i] ?? W / 2) - 8} y="0" width="16" height={H} fill="transparent">
            <title>{`${tglPendek(p.x)} — ${fmtVal(p.y)}`}</title>
          </rect>
        ))}
      </svg>
    </div>
  );
}

/* ============ Grafik batang ============ */
export function BarChart({ points, color = "#7c3aed", fmtVal = (v) => v }) {
  const [ref, W] = useBox(600);
  if (!points || points.length === 0) return <p className="muted">Belum ada data.</p>;

  const H = 210;
  const P = W < 420 ? 28 : 34;
  const max = Math.max(...points.map((p) => p.y)) * 1.15 || 1;
  const slot = (W - 2 * P) / points.length;
  const bw = Math.min(34, slot * 0.68);

  return (
    <div ref={ref} className="chart-box">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={P} x2={W - P} y1={H - P - f * (H - 2 * P)} y2={H - P - f * (H - 2 * P)}
                stroke="var(--soft, #eef0fb)" strokeWidth="1.5" />
        ))}
        <line x1={P} x2={W - P} y1={H - P} y2={H - P} stroke="var(--line, #dbe0f0)" strokeWidth="1.5" />
        {points.map((p, i) => {
          const h = (p.y / max) * (H - 2 * P);
          const x = P + i * slot + (slot - bw) / 2;
          return (
            <rect key={p.x + i} x={x} y={H - P - h} width={bw} height={Math.max(2, h)} rx="5"
                  fill={color} opacity="0.9" className="bar-anim"
                  style={{ transformOrigin: `${x + bw / 2}px ${H - P}px`, animationDelay: `${Math.min(i * 0.04, 0.7)}s` }}>
              <title>{`${tglPendek(p.x)} — ${fmtVal(p.y)}`}</title>
            </rect>
          );
        })}
        <text x={P} y={H - 10} fontSize="11" fill="var(--muted, #94a3b8)" fontWeight="600">{tglPendek(points[0].x)}</text>
        <text x={W - P} y={H - 10} fontSize="11" fill="var(--muted, #94a3b8)" fontWeight="600" textAnchor="end">
          {tglPendek(points[points.length - 1].x)}
        </text>
      </svg>
    </div>
  );
}

/* ============ Breakdown batang horizontal ============ */
export function Breakdown({ rows, fmtVal = (v) => v }) {
  if (!rows || rows.length === 0) return <p className="muted">Belum ada data.</p>;
  const max = Math.max(...rows.map((r) => r.value)) || 1;
  return (
    <div>
      {rows.map((r, i) => (
        <div key={r.label} className="bd-row">
          <span className="bd-label" title={r.label}>{r.label}</span>
          <div className="bd-bar">
            <div style={{ width: `${(r.value / max) * 100}%`, animationDelay: `${i * 0.07}s` }} />
          </div>
          <span className="bd-val">{fmtVal(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

