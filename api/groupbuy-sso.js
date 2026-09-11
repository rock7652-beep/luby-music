import crypto from 'node:crypto';

const SESSION_COOKIE = '__Host-luby_admin_session';
const TOKEN_SECONDS = 10 * 60;

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

function validCentralSession(req, secret) {
  const raw = parseCookies(req)[SESSION_COOKIE];
  if (!raw) return false;
  const [expires, nonce, signature] = raw.split('.');
  if (!expires || !nonce || !signature || Number(expires) < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(signature, sign(expires + '.' + nonce, secret));
}

function validGroupbuyToken(token, secret) {
  const [expires, nonce, signature] = String(token || '').split('.');
  if (!expires || !nonce || !signature || Number(expires) < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(signature, sign('groupbuy.' + expires + '.' + nonce, secret));
}

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const secret = process.env.ADMIN_SESSION_SECRET || '';
  if (secret.length < 32) return res.status(503).json({ ok: false, error: '後台安全設定尚未完成' });

  if (req.query.token) {
    const ok = validGroupbuyToken(req.query.token, secret);
    return res.status(ok ? 200 : 401).json({ ok });
  }

  if (!validCentralSession(req, secret)) {
    return res.redirect(302, '/admin/?next=groupbuy');
  }

  const expires = Math.floor(Date.now() / 1000) + TOKEN_SECONDS;
  const nonce = crypto.randomBytes(18).toString('base64url');
  const value = expires + '.' + nonce;
  const token = value + '.' + sign('groupbuy.' + value, secret);
  return res.redirect(302, 'https://groupbuy.lubymusic.com/api/admin/sso?token=' + encodeURIComponent(token));
}
