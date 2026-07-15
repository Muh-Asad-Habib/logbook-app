/** Middleware autentikasi: token Bearer (header) atau ?token= (untuk <img>/link unduhan). */
import * as store from "./storage.js";

export async function authRequired(req, res, next) {
  try {
    const h = String(req.headers.authorization || "");
    const bearer = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
    const token = bearer || String(req.query.token || "");
    const sess = token ? await store.getSession(token) : null;
    if (!sess) return res.status(401).json({ error: "Harus login terlebih dahulu" });
    const user = await store.getUserById(sess.userId);
    if (!user) return res.status(401).json({ error: "Akun tidak ditemukan" });
    req.userId = user.id;
    req.user = { id: user.id, username: user.username };
    req.token = token;
    next();
  } catch (err) {
    next(err);
  }
}

