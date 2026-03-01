import { createClient } from "redis";

let client;
let readyPromise;

function getRedis() {
  if (!readyPromise) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("Missing REDIS_URL env var");

    client = createClient({ url });
    client.on("error", (err) => console.error("Redis error:", err));

    readyPromise = client.connect();
  }
  return { client, readyPromise };
}

export default async function handler(req, res) {
  try {
    const { client, readyPromise } = getRedis();
    await readyPromise;

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const { action, key, value } = req.body || {};
    if (!action || !key) {
      return res.status(400).json({ error: "Missing action or key" });
    }

    if (action === "get") {
      const result = await client.get(key);
      return res.status(200).json({ result });
    }

    if (action === "set") {
      if (typeof value === "undefined") {
        return res.status(400).json({ error: "Missing value for set" });
      }
      await client.set(key, String(value));
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}