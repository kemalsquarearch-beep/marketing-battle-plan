import { getStore } from "@netlify/blobs";
export const config = { path: "/api/*" };
const J = (d, s = 200) => Response.json(d, { status: s, headers: { "cache-control": "no-store" } });

export default async (req) => {
  const db = getStore({ name: "mbp", consistency: "strong" });
  const [, , act, raw = ""] = new URL(req.url).pathname.split("/");
  const id = raw.replace(".jpg", "");
  const post = req.method === "POST";
  const b = post ? await req.json().catch(() => ({})) : {};
  const admin = async () => {
    const ok = !!process.env.ADMIN_PASSWORD && b.pass === process.env.ADMIN_PASSWORD;
    if (!ok) await new Promise((r) => setTimeout(r, 1500));
    return ok;
  };
  const denied = () => J({ error: "Password admin salah / ADMIN_PASSWORD belum diatur di Netlify" }, 401);

  if (act === "settings") {
    if (!post) return J((await db.get("settings", { type: "json" })) || {});
    if (!(await admin())) return denied();
    await db.setJSON("settings", b.settings);
    return J({ ok: true });
  }
  if (act === "order" && post) {
    const p = String(b.proof || "");
    if (!p.startsWith("data:image/jpeg;base64,") || p.length > 3e6) return J({ error: "Bukti tidak valid" }, 400);
    const oid = crypto.randomUUID();
    await db.set("proof/" + oid, new Blob([Buffer.from(p.split(",")[1], "base64")]));
    await db.setJSON("order/" + oid, { status: "menunggu", name: String(b.name || "").slice(0, 80), time: new Date().toISOString() });
    return J({ id: oid });
  }
  if (act === "proof") {
    const f = await db.get("proof/" + id, { type: "arrayBuffer" });
    return f ? new Response(f, { headers: { "content-type": "image/jpeg" } }) : J({ error: "Tidak ditemukan" }, 404);
  }
  if (act === "status") return J((await db.get("order/" + id, { type: "json" })) || { status: "tidak ada" });
  if (act === "approve" && post) {
    if (!(await admin())) return denied();
    const o = await db.get("order/" + b.id, { type: "json" });
    if (!o) return J({ error: "Pesanan tidak ditemukan" }, 404);
    await db.setJSON("order/" + b.id, { ...o, status: b.ok ? "diterima" : "ditolak" });
    return J({ ok: true });
  }
  return J({ error: "Tidak ditemukan" }, 404);
};
