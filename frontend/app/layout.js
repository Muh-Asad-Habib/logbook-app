import "./globals.css";
import Shell from "@/components/Shell";

export const metadata = {
  title: "Logbook Kegiatan & Keuangan",
  description:
    "Logbook Kegiatan & Keuangan — dashboard statistik, galeri foto, dan ekspor DOCX/PDF/XLSX.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Logbook",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#4f46e5",
};

/** Terapkan tema tersimpan SEBELUM render — mencegah kedipan tema salah. */
const themeScript = `(function(){try{var t=localStorage.getItem("logbook_theme");if(!t){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t;var m=document.querySelector('meta[name="theme-color"]');if(m&&t==="dark")m.setAttribute("content","#0d0f22")}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
