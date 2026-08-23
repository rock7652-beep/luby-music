import { hasValidAdminSession, noStoreJson } from './_lib/admin-session.js';

const ADMIN_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwF3l8SuiBwZ4GM638rEX_SrzphEJ_nxHW3PdUzWR5iVSVm2VNHELDzPk-4yeb3N3Q/exec';

const DISPLAY_FIELDS = [
  '報名日期', '來源', '姓名', '電話', '報名類型', '學員類型', '班級名稱',
  '班級程度', '星期', '時間', '老師', '開課日', '程度需求', '可上課時段',
  '人數', '是否有吉他', '原價', '優惠', '應付金額', '匯款後五碼', '備註',
];

function cleanCell(value) {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value.slice(0, 1000) : value;
}

function normalizeRows(payload) {
  const source = payload.rows || payload.data || payload.registrations;
  if (!Array.isArray(source)) return null;
  if (!source.length) return [];

  if (Array.isArray(source[0])) {
    const header = source[0].map(String);
    const hasHeader = DISPLAY_FIELDS.some(field => header.includes(field));
    const rows = hasHeader ? source.slice(1) : source;
    return rows.map(row => Object.fromEntries(DISPLAY_FIELDS.map((field, index) => {
      const sourceIndex = hasHeader ? header.indexOf(field) : index;
      return [field, cleanCell(sourceIndex >= 0 ? row[sourceIndex] : '')];
    })));
  }

  return source.map(row => Object.fromEntries(DISPLAY_FIELDS.map(field => [field, cleanCell(row[field])])));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return noStoreJson(res, 405, { ok: false, error: 'Method not allowed' });
  }
  if (!hasValidAdminSession(req)) {
    return noStoreJson(res, 401, { ok: false, error: '請先登入管理中心' });
  }

  // Preview registration admin is pinned to the verified registration web app.
  // This branch-only setting avoids changing the formal site's registration endpoint.
  const url = ADMIN_APPS_SCRIPT_URL;
  const token = process.env.APPS_SCRIPT_TOKEN || '';
  if (!url || !token) {
    return noStoreJson(res, 503, { ok: false, error: '線上報名資料連線尚未設定' });
  }

  try {
    const upstreamUrl = new URL(url);
    upstreamUrl.searchParams.set('action', 'adminList');
    upstreamUrl.searchParams.set('token', token);
    const upstream = await fetch(upstreamUrl, { redirect: 'follow', cache: 'no-store' });
    const text = await upstream.text();
    let payload;
    try { payload = JSON.parse(text); } catch { payload = null; }
    const rows = payload && normalizeRows(payload);
    if (!upstream.ok || !rows) {
      return noStoreJson(res, 502, {
        ok: false,
        error: '線上報名資料服務尚未開放管理端讀取',
        setupRequired: true,
      });
    }
    return noStoreJson(res, 200, {
      ok: true,
      rows,
      count: rows.length,
      updatedAt: new Date().toISOString(),
      source: '吉他線上報名表單／報名總表',
    });
  } catch {
    return noStoreJson(res, 502, { ok: false, error: '暫時無法讀取線上報名資料' });
  }
}
