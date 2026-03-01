import { getRedis } from "../../lib/redis.js";
import { verifyTelegramInitData } from "../../lib/tg.js";

const COMMISSION = 0.10;

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

    const { initData, token } = req.body || {};
    const v = verifyTelegramInitData(initData);
    if (!v.ok) return res.status(401).json({ error: "Unauthorized", reason: v.reason });

    const userId = v.userId;
    if (!token) return res.status(400).json({ error: "Missing token" });

    const { client, readyPromise } = getRedis();
    await readyPromise;

    const checkKey = `check:${token}`;
    const raw = await client.get(checkKey);
    if (!raw) return res.status(404).json({ error: "Check not found / expired" });

    const check = JSON.parse(raw);
    if (check.redeemed) return res.status(400).json({ error: "Already redeemed" });

    // помечаем redeemed (простая защита; можно усилить транзакцией, но для старта ок)
    check.redeemed = true;
    check.redeemedBy = userId;
    check.redeemedAt = Date.now();
    await client.set(checkKey, JSON.stringify(check), { EX: 7 * 24 * 3600 });

    const payout = Math.floor(check.amount * (1 - COMMISSION));

    // начисляем получателю
    const pRaw = await client.get(`u:${userId}`);
    const p = pRaw ? JSON.parse(pRaw) : { user_id: userId, money: 0 };

    p.money = Math.floor((p.money || 0) + payout);
    p.updatedAt = Date.now();

    await client.set(`u:${userId}`, JSON.stringify(p));
    await client.zAdd("lb:money", [{ score: p.money, value: userId }]);

    return res.status(200).json({
      ok: true,
      amount: payout,
      message: `Чек активирован ✅ Получено ${payout} (комиссия 10%)`
    });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}