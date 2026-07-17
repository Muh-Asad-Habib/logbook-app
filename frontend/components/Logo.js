"use client";

/**
 * LogoMark — logo aplikasi custom: buku logbook terbuka berisi catatan
 * ber-ceklis (kegiatan) + grafik batang naik (keuangan) + percikan bintang.
 * Dipakai di sidebar, topbar mobile, splash, login, dan ikon PWA (icon.svg
 * memakai desain yang sama).
 */
export default function LogoMark(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1.18em"
      height="1.18em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {/* buku logbook terbuka */}
      <path d="M12 6.9C10.2 5.3 7.6 4.7 4.9 5c-.5.06-.9.5-.9 1v10.7c0 .62.55 1.1 1.16 1.02 2.4-.3 4.7.17 6.84 1.7 2.14-1.53 4.44-2 6.84-1.7.61.08 1.16-.4 1.16-1.02V6c0-.5-.4-.94-.9-1-2.7-.3-5.3.3-7.1 1.9Z" />
      <path d="M12 6.9v12.5" />
      {/* halaman kiri: catatan + ceklis */}
      <path d="M6.6 9.4h2.7M6.6 11.7h2.7" />
      <path d="m6.5 14.7.8.8 1.6-1.6" />
      {/* halaman kanan: grafik batang naik */}
      <path d="M14.9 14.8v-1.9M16.9 14.8v-3.1M18.9 14.8v-4.4" strokeWidth="1.85" />
      {/* percikan bintang */}
      <path
        d="M18.6 1.9l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

