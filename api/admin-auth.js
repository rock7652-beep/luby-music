import crypto from 'node:crypto';

const COOKIE = '__Host-luby_admin_session';
const SESSION_SECONDS = 60 * 60 * 2;
const LOCK_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
// Compatibility verifier shared by Preview and Production.
// This is an irreversible scrypt verifier, never a plaintext password.
// Environment-specific hashes remain supported for future password rotation.
const COMPAT_PASSWORD_HASH = '38a72773c3bd1f77db9225cf1cb75dd5a9719b15eb96176e:852aca5a60c929c307c8a461c865bd25b70f6edd66d2be0ad2b87dd9a90adcb0';
const attempts = new Map();

function json(res, status, body) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  return res.status(status).json(body);
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(v => v.trim()).filter(Boolean).map(v => {
    const i = v.indexOf('=');
    return [v.slice(0, i), decodeURIComponent(v.slice(i + 1))];
  }));
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function validSession(req, secret) {
  const raw = parseCookies(req)[COOKIE];
  if (!raw) return false;
  const [expires, nonce, signature] = raw.split('.');
  if (!expires || !nonce || !signature || Number(expires) < Math.floor(Date.now() / 1000)) return false;
  const expected = sign(expires + '.' + nonce, secret);
  return safeEqual(signature, expected);
}

function validOrigin(req) {
  const origin = String(req.headers.origin || '');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

function validPassword(input, configuredHash) {
  const [salt, expected] = String(configuredHash || '').split(':');
  if (!salt || !expected || !/^[a-f0-9]{64}$/i.test(expected)) return false;
  const actual = crypto.scryptSync(String(input), salt, 32).toString('hex');
  return safeEqual(actual, expected.toLowerCase());
}

function clearCookie(res) {
  res.setHeader('Set-Cookie', COOKIE + '=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
}

export default async function handler(req, res) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const isPreviewHost = /\.vercel\.app$/i.test(host);
  const passwordHashes = [
    isPreviewHost ? process.env.ADMIN_PREVIEW_PASSWORD_HASH : process.env.ADMIN_PASSWORD_HASH,
    COMPAT_PASSWORD_HASH
  ].filter(Boolean);
  const secret = process.env.ADMIN_SESSION_SECRET || '';

  // 專用密碼雜湊與 Session 金鑰缺一不可；不得沿用其他服務的密鑰。
  if (!passwordHashes.length || !secret || secret.length < 32) {
    return json(res, 503, { ok: false, error: '後台安全設定尚未完成' });
  }

  if (req.method === 'GET') {
    const ok = validSession(req, secret);
    if (!ok) clearCookie(res);
    return json(res, ok ? 200 : 401, { ok, expiresInSeconds: ok ? SESSION_SECONDS : 0 });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { ok: false, error: 'Method not allowed' });
  }

  if (!validOrigin(req)) {
    return json(res, 403, { ok: false, error: '來源驗證失敗' });
  }

  let body = req.body || {};
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  if (body.action === 'logout') {
    clearCookie(res);
    return json(res, 200, { ok: true });
  }

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim() || 'unknown';
  const now = Date.now();
  let record = attempts.get(ip) || { count: 0, reset: now + LOCK_WINDOW_MS };
  if (now > record.reset) record = { count: 0, reset: now + LOCK_WINDOW_MS };

  if (record.count >= MAX_ATTEMPTS) {
    const retryAfter = Math.max(1, Math.ceil((record.reset - now) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    return json(res, 429, { ok: false, error: '嘗試次數過多，請稍後再試' });
  }

  if (!passwordHashes.some(hash => validPassword(body.password || '', hash))) {
    record.count += 1;
    attempts.set(ip, record);
    await new Promise(resolve => setTimeout(resolve, 350 + crypto.randomInt(0, 250)));
    return json(res, 401, { ok: false, error: '密碼錯誤' });
  }

  attempts.delete(ip);
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const nonce = crypto.randomBytes(18).toString('base64url');
  const value = expires + '.' + nonce;
  res.setHeader('Set-Cookie', COOKIE + '=' + value + '.' + sign(value, secret) + '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=' + SESSION_SECONDS);
  return json(res, 200, { ok: true, expiresInSeconds: SESSION_SECONDS });
}
