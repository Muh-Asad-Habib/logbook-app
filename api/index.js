/**
 * Titik masuk serverless function di Vercel.
 *
 * Semua request /api/*, /docs, /openapi.json, /health, dan panel pemeliharaan
 * diarahkan ke sini oleh vercel.json (rewrites), lalu ditangani aplikasi
 * Express yang sama persis dengan mode lokal.
 * (Aplikasi Express adalah fungsi (req, res) => — kompatibel langsung.)
 */
import app from "../backend/src/server.js";

export default app;

