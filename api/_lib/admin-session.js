import crypto from 'node:crypto';

const COOKIE = '__Host-luby_admin_session';

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

export function hasValidAdminSession(req) {
  const secret = process.env.ADMIN_SESSION_SECRET || '';
  if (secret.length < 32) return false;
  const raw = parseCookies(req)[COOKIE];
  if (!raw) return false;
  const [expires, nonce, signature] = raw.split('.');
  if (!expires || !nonce || !signature || Number(expires) < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(signature, sign(expires + '.' + nonce, secret));
}

export function hasSameOrigin(req) {
  const origin = String(req.headers.origin || '');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

export function noStoreJson(res, status, body) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  return res.status(status).json(body);
}
