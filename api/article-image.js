import { hasSameOrigin, hasValidAdminSession, noStoreJson } from './_lib/admin-session.js';
import { uploadArticleImage } from './_lib/articles-store.js';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return noStoreJson(res, 405, { ok: false, error: 'Method not allowed' });
    if (!hasValidAdminSession(req)) return noStoreJson(res, 401, { ok: false, error: '請先登入管理後台' });
    if (!hasSameOrigin(req)) return noStoreJson(res, 403, { ok: false, error: '來源驗證失敗' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (!ALLOWED.has(body.contentType)) return noStoreJson(res, 400, { ok: false, error: '只接受 JPG、PNG、WebP 或 GIF 圖片' });
    const bytes = Buffer.from(String(body.base64 || ''), 'base64');
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) return noStoreJson(res, 400, { ok: false, error: '圖片需小於 5MB' });
    const url = await uploadArticleImage({ filename: body.filename, contentType: body.contentType, bytes });
    return noStoreJson(res, 201, { ok: true, url });
  } catch (error) {
    return noStoreJson(res, 500, { ok: false, error: error.message });
  }
}
