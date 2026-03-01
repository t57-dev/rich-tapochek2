import crypto from "crypto";
import { getRedis } from "../lib/redis.js";
import { verifyTelegramInitData } from "../lib/tg.js";

function packToInvoice(packId) {
  // твои пакеты из index.html
  const map = {
    stars10: { title: "Богатый тапок: 10M монет", description: "Начисляет 10 000 000 монет", stars: 15 },
    stars20: { title: "Богатый тапок: 22M монет", description: "Начисляет 22 000 000 монет", stars: 25 },
    stars30: { title: "Богатый тапок: 36M монет", description: "Начисляет 36 000 000 монет", stars: 35 },
    x2_7d:   { title: "Богатый тапок: x2 на 7 дней", description: "Удваивает прибыль на 7 дней", stars: 35 }
  };
  return map[packId] || null;
}

async function tg(method, body) {
  const token = process.env.TG_BOT_TOKEN;
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`Telegram API error: ${JSON.stringify(j)}`);
  return j.result;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

    const { packId, initData } = req.body || {};
    const v = verifyTelegramInitData(initData); // проверка initData обязательна :contentReference[oaicite:1]{index=1}
    if (!v.ok) return res.status(401).json({ error: "Unauthorized", reason: v.reason });

    const pack = packToInvoice(packId);
    if (!pack) return res.status(400).json({ error: "Unknown packId" });

    const { client, readyPromise } = getRedis();
    await readyPromise;

    const orderId = crypto.randomBytes(12).toString("hex");
    const payload = `tapok:${packId}:${orderId}`; // попадёт в pre_checkout_query/successful_payment :contentReference[oaicite:2]{index=2}

    await client.set(`order:${orderId}`, JSON.stringify({
      orderId,
      packId,
      userId: v.userId,
      status: "created",
      createdAt: Date.now()
    }), { EX: 7 * 24 * 3600 });

    await client.set(`payload:${payload}`, orderId, { EX: 7 * 24 * 3600 });

    // Stars: currency MUST be XTR :contentReference[oaicite:3]{index=3}
    const invoiceLink = await tg("createInvoiceLink", {
      title: pack.title,
      description: pack.description,
      payload,
      provider_token: "",       // для digital goods пустой :contentReference[oaicite:4]{index=4}
      currency: "XTR",
      prices: [{ label: pack.title, amount: pack.stars }]
    });

    return res.status(200).json({ invoiceLink, orderId });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}