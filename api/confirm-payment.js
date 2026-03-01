import { getRedis } from "../lib/redis.js";
import { verifyTelegramInitData } from "../lib/tg.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

    const { orderId, initData } = req.body || {};
    const v = verifyTelegramInitData(initData);
    if (!v.ok) return res.status(401).json({ error: "Unauthorized", reason: v.reason });
    if (!orderId) return res.status(400).json({ error: "Missing orderId" });

    const { client, readyPromise } = getRedis();
    await readyPromise;

    const raw = await client.get(`order:${orderId}`);
    if (!raw) return res.status(404).json({ ok: false, error: "Order not found" });

    const o = JSON.parse(raw);
    if (String(o.userId) !== String(v.userId)) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }

    const paid = await client.get(`paid:${orderId}`);
    if (!paid) return res.status(200).json({ ok: false, pending: true });

    // защита от двойного начисления
    const grantedKey = `granted:${orderId}`;
    const already = await client.get(grantedKey);
    if (already) return res.status(200).json({ ok: true, alreadyGranted: true, packId: o.packId });

    await client.set(grantedKey, "1", { EX: 30 * 24 * 3600 });
    return res.status(200).json({ ok: true, packId: o.packId });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}