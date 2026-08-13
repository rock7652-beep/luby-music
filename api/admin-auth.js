import crypto from 'node:crypto';

const COOKIE = 'luby_admin_session';
const SESSION_SECONDS = 60 * 60 * 8;
const BOOTSTRAP_PASSWORD = '7ecb62b6ef24dfeabd37538b0df3c55c:3317c3ab9789210840f4218c4ea14e89beb4877c4e05ad8b8116ecd52e2cf5ca';
const attempts = new Map();

function json(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(v => v.trim()).filter(Boolean).map(v => {
    const i = v.indexOf('=');
    return [v.slice(0, i), decodeURIComponent(v.slice(i + 1))];
  }));
}

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function validSession(req, secret) {
  const raw = parseCookies(req)[COOKIE];
  if (!raw) return false;
  const [expires, signature] = raw.split('.');
  if (!expires || !signature || Number(expires) < Math.floor(Date.now() / 1000)) return false;
  const expected = sign(expires, secret);
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function sameText(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function validPassword(input, configured) {
  if (configured) return sameText(input, configured);
  const [salt, expected] = BOOTSTRAP_PASSWORD.split(':');
  const actual = crypto.scryptSync(String(input), salt, 32).toString('hex');
  return sameText(actual, expected);
}

export default async function handler(req, res) {
  const password = process.env.ADMIN_PASSWORD || '';
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.APPS_SCRIPT_TOKEN || '';
  if (!secret || secret.length < 24) {
    return json(res, 503, { ok: false, error: '後台安全設定尚未完成' });
  }

  if (req.method === 'GET') {
    return json(res, validSession(req, secret) ? 200 : 401, { ok: validSession(req, secret) });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { ok: false, error: 'Method not allowed' });
  }

  let body = req.body || {};
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  if (body.action === 'logout') {
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
    return json(res, 200, { ok: true });
  }

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  const now = Date.now();
  const record = attempts.get(ip) || { count: 0, reset: now + 15 * 60 * 1000 };
  if (now > record.reset) { record.count = 0; record.reset = now + 15 * 60 * 1000; }
  if (record.count >= 8) return json(res, 429, { ok: false, error: '嘗試次數過多，請 15 分鐘後再試' });

  if (!validPassword(body.password || '', password)) {
    record.count += 1;
    attempts.set(ip, record);
    return json(res, 401, { ok: false, error: '密碼錯誤' });
  }

  attempts.delete(ip);
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  res.setHeader('Set-Cookie', `${COOKIE}=${expires}.${sign(String(expires), secret)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`);
  return json(res, 200, { ok: true });
}
