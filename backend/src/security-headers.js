/** CSP tanpa akses database; dipakai server dan pengujian pradeploy terisolasi. */
export function buatCsp(env = process.env) {
  const connectSrc = new Set(["'self'", "https://upload.imagekit.io", "https://ik.imagekit.io"]);
  // ImageKit juga mendukung domain CDN kustom. Ambil hanya origin HTTPS,
  // bukan path, query, atau teks mentah yang bisa menjadi direktif CSP.
  try {
    const endpoint = new URL(env.IMAGEKIT_URL_ENDPOINT);
    if (endpoint.protocol === "https:" && !endpoint.username && !endpoint.password) {
      connectSrc.add(endpoint.origin);
    }
  } catch { /* Endpoint opsional; konfigurasi kosong tidak memperluas izin. */ }

  return {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: [...connectSrc],
      mediaSrc: ["'self'", "blob:"],
      workerSrc: ["'self'", "blob:"],
      frameSrc: ["'self'", "https://www.canva.com", "https://view.officeapps.live.com"],
      ...(env.VERCEL ? { upgradeInsecureRequests: [] } : {}),
    },
  };
}

