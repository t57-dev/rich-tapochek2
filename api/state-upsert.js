import { getRedis } from "../lib/redis.js";
import { verifyTelegramInitData } from "../lib/tg.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

    const { initData, state } = req.body || {};
    const v = verifyTelegramInitData(initData);
    if (!v.ok) return res.status(401).json({ error: "Unauthorized", reason: v.reason });

    const userId = v.userId;

    const money = Math.max(0, Math.floor(Number(state?.money || 0)));
    const incomePerHour = Math.max(0, Math.floor(Number(state?.incomePerHour || 0)));
    const clickPower = Math.max(1, Math.floor(Number(state?.clickPower || 1)));
    const licenses = Math.max(0, Math.floor(Number(state?.licenses || 0)));
    const totalEarned = Math.max(0, Math.floor(Number(state?.totalEarned || 0)));
    const boostUntilMs = Math.max(0, Math.floor(Number(state?.boostUntilMs || 0)));

    const { client, readyPromise } = getRedis();
    await readyPromise;

    // профиль
    const profileKey = `u:${userId}`;
    const payload = {
      user_id: userId,
      money,
      incomePerHour,
      clickPower,
      licenses,
      totalEarned,
      boostUntilMs,
      updatedAt: Date.now()
    };

    await client.set(profileKey, JSON.stringify(payload));

    // лидерборд (по money)
    await client.zAdd("lb:money", [{ score: money, value: userId }]);

    // можно ещё по income:
    await client.zAdd("lb:income", [{ score: incomePerHour, value: userId }]);

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}