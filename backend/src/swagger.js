import swaggerJsdoc from "swagger-jsdoc";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Logbook API",
      version: "3.0.0",
      description:
        "REST API Logbook Kegiatan & Keuangan.\n\n" +
        "- **Data:** Neon Postgres (serverless)\n" +
        "- **Gambar:** ImageKit CDN (signed URL) — atau folder lokal saat pengembangan\n" +
        "- Berjalan di Vercel (cloud) maupun lokal — semua endpoint sama.",
    },
    servers: [{ url: "/", description: "Server ini" }],
    tags: [
      { name: "Auth", description: "Daftar, login, dan sesi (token)" },
      { name: "Kegiatan", description: "Catatan kegiatan harian + foto" },
      { name: "Keuangan", description: "Catatan belanja + bukti/nota" },
      { name: "Pengaturan", description: "Key-value (mis. dana_awal)" },
      { name: "Statistik", description: "Ringkasan dashboard" },
      { name: "Files", description: "Akses gambar di server" },
      { name: "Export", description: "Unduh DOCX, PDF, dan Excel" },
      { name: "Import", description: "Impor entri + foto dari dokumen Word" },
    ],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description:
            "Token dari /api/auth/login atau /api/auth/register. " +
            "Bisa juga dikirim sebagai query ?token=... (untuk gambar/unduhan).",
        },
      },
      schemas: {
        Kegiatan: {
          type: "object",
          properties: {
            id: { type: "string", example: "7c9e6679-7425-40de-944b-e07fc1f90ae7" },
            tanggal: { type: "string", example: "2026-07-11" },
            kegiatan: { type: "string", example: "Uji coba aplikasi tahap 1" },
            capaian_delta: { type: "integer", example: 5 },
            capaian_total: { type: "integer", example: 40 },
            waktu_menit: { type: "integer", example: 120 },
            foto_keys: {
              type: "array",
              items: { type: "string" },
              example: ["keg_2026-07-11_1720680000-ab12cd.jpg"],
            },
          },
        },
        Keuangan: {
          type: "object",
          properties: {
            id: { type: "string" },
            tanggal: { type: "string", example: "2026-07-11" },
            item: { type: "string", example: "Sewa Canva Pro" },
            harga_satuan: { type: "number", example: 99900 },
            satuan_suffix: { type: "string", example: "/bulan" },
            jumlah: { type: "number", example: 1 },
            total: { type: "number", example: 99900 },
            bukti_key: { type: "string", example: "keu_2026-07-11_1720680000-ef56ab.jpg" },
          },
        },
      },
    },
  },
  // glob butuh forward-slash, termasuk di Windows
  apis: [path.join(__dirname, "routes", "*.js").replace(/\\/g, "/")],
});

