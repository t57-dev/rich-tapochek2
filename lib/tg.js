import crypto from "crypto";

function parseInitData(initData) {
  const params = new URLSearchParams(initData);
  const obj = {};
  for (const [k, v] of params.entries()) obj[k] = v;
  return obj;
}

export function verifyTelegramInitData(initData) {
  const botToken = process.env.TG_BOT_TOKEN;
  if (!botToken) throw new Error("Missing TG_BOT_TOKEN env var");
  if (!initData) return { ok: false, reason: "no_initData" };

  const data = parseInitData(initData);
  const hash = data.hash;
  if (!hash) return { ok: false, reason: "no_hash" };
  delete data.hash;

  // check string (k=v sorted by key)
  const keys = Object.keys(data).sort();
  const checkString = keys.map(k => `${k}=${data[k]}`).join("\n");

  // secret key = HMAC_SHA256("WebAppData", botToken)
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = crypto.createHmac("sha256", secretKey).update(checkString).digest("hex");

  if (computed !== hash) return { ok: false, reason: "bad_hash" };

  // user_id
  let userId = null;
  try {
    if (data.user) {
      const u = JSON.parse(data.user);
      if (u && u.id) userId = String(u.id);
    }
  } catch (e) {}

  if (!userId) return { ok: false, reason: "no_user" };

  return { ok: true, userId, data };
}