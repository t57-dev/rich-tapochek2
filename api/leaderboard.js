import { getRedis } from "../lib/redis.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

    const { client, readyPromise } = getRedis();
    await readyPromise;

    const ids = await client.zRange("lb:money", 0, 19, { REV: true });
    const top = [];

    for (let i = 0; i < ids.length; i++) {
      const raw = await client.get(`u:${ids[i]}`);
      if (!raw) continue;
      const p = JSON.parse(raw);

      top.push({
        user_id: p.user_id,
        name: null,            // можно потом добавить username/first_name
        money: p.money || 0
      });
    }

    return res.status(200).json({ top });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}