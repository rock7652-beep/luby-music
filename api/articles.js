import { hasSameOrigin, hasValidAdminSession, noStoreJson } from './_lib/admin-session.js';
import { createArticle, listAdminArticles, listPublishedArticles, normalizeArticle, restoreArticle, trashArticle, updateArticle } from './_lib/articles-store.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET' && req.query?.public === '1') {
      const articles = await listPublishedArticles();
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      return res.status(200).json({ ok: true, articles });
    }

    if (!hasValidAdminSession(req)) return noStoreJson(res, 401, { ok: false, error: '請先登入管理後台' });

    if (req.method === 'GET') {
      return noStoreJson(res, 200, { ok: true, articles: await listAdminArticles() });
    }

    if (!hasSameOrigin(req)) return noStoreJson(res, 403, { ok: false, error: '來源驗證失敗' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    if (req.method === 'POST') {
      const article = await createArticle(normalizeArticle(body));
      return noStoreJson(res, 201, { ok: true, article });
    }
    if (req.method === 'PUT') {
      if (!body.id) return noStoreJson(res, 400, { ok: false, error: '缺少文章 ID' });
      const article = await updateArticle(body.id, normalizeArticle(body));
      return noStoreJson(res, 200, { ok: true, article });
    }
    if (req.method === 'DELETE') {
      if (!body.id) return noStoreJson(res, 400, { ok: false, error: '缺少文章 ID' });
      const article = await trashArticle(body.id, body.original_status, body.original_category);
      return noStoreJson(res, 200, { ok: true, article });
    }
    if (req.method === 'PATCH') {
      if (body.action !== 'restore' || !body.id) return noStoreJson(res, 400, { ok: false, error: '復原資料不完整' });
      const article = await restoreArticle(body.id, body.restore_status, body.restore_category);
      return noStoreJson(res, 200, { ok: true, article });
    }
    res.setHeader('Allow', 'GET, POST, PUT, PATCH, DELETE');
    return noStoreJson(res, 405, { ok: false, error: 'Method not allowed' });
  } catch (error) {
    const status = /duplicate key|articles_slug_key/i.test(error.message) ? 409 : 500;
    return noStoreJson(res, status, { ok: false, error: status === 409 ? '這個文章網址已經被使用' : error.message });
  }
}
