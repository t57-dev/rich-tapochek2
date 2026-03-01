import crypto from "crypto";
import { getRedis } from "../../lib/redis.js";
import { verifyTelegramInitData } from "../../lib/tg.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

    const { initData, amount } = req.body || {};
    const v = verifyTelegramInitData(initData);
    if (!v.ok) return res.status(401).json({ error: "Unauthorized", reason: v.reason });

    const userId = v.userId;
    const amt = Math.max(1, Math.floor(Number(amount || 0)));

    const { client, readyPromise } = getRedis();
    await readyPromise;

    const pRaw = await client.get(`u:${userId}`);
    const p = pRaw ? JSON.parse(pRaw) : { user_id: userId, money: 0 };

    if ((p.money || 0) < amt) {
      return res.status(400).json({ error: "Not enough money" });
    }

    // списываем
    p.money = Math.floor(p.money - amt);
    p.updatedAt = Date.now();
    await client.set(`u:${userId}`, JSON.stringify(p));
    await client.zAdd("lb:money", [{ score: p.money, value: userId }]);

    // создаём чек
    const token = crypto.randomBytes(16).toString("hex");
    const checkKey = `check:${token}`;
    const check = {
      token,
      from: userId,
      amount: amt,
      createdAt: Date.now(),
      redeemed: false
    };

    // TTL 7 дней (можешь поменять)
    await client.set(checkKey, JSON.stringify(check), { EX: 7 * 24 * 3600 });

    const baseUrl = process.env.BASE_URL || ""; // например: https://your-app.vercel.app
    const link = `${baseUrl}/?redeem=${token}`;

    return res.status(200).json({ ok: true, link });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}