import { getRedis } from "../lib/redis.js";

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
    if (req.method !== "POST") return res.status(405).end();

    const update = req.body || {};
    const { client, readyPromise } = getRedis();
    await readyPromise;

    // 1) pre_checkout_query: обязаны ответить за 10 сек :contentReference[oaicite:6]{index=6}
    if (update.pre_checkout_query) {
      const q = update.pre_checkout_query;
      const payload = q.invoice_payload;
      const orderId = await client.get(`payload:${payload}`);

      const ok = !!orderId; // можно добавить доп.проверки: userId, packId, status
      await tg("answerPreCheckoutQuery", { pre_checkout_query_id: q.id, ok });

      return res.status(200).json({ ok: true });
    }

    // 2) successful_payment: ставим флаг оплаты :contentReference[oaicite:7]{index=7}
    const msg = update.message;
    if (msg && msg.successful_payment) {
      const sp = msg.successful_payment;
      const payload = sp.invoice_payload;
      const orderId = await client.get(`payload:${payload}`);

      if (orderId) {
        await client.set(`paid:${orderId}`, "1", { EX: 30 * 24 * 3600 });
        const raw = await client.get(`order:${orderId}`);
        if (raw) {
          const o = JSON.parse(raw);
          o.status = "paid";
          o.telegram_payment_charge_id = sp.telegram_payment_charge_id; // хранить полезно :contentReference[oaicite:8]{index=8}
          o.paidAt = Date.now();
          await client.set(`order:${orderId}`, JSON.stringify(o), { EX: 30 * 24 * 3600 });
        }
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}