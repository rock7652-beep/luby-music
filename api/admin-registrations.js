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

const FIELD_ALIASES = {
  '報名日期': ['submittedAt', 'serverReceivedAt'],
  '來源': ['source'],
  '姓名': ['name'],
  '電話': ['phone'],
  '報名類型': ['courseType'],
  '學員類型': ['studentType'],
  '班級名稱': ['className'],
  '班級程度': ['classLevel'],
  '星期': ['classDay'],
  '時間': ['classTime'],
  '老師': ['classTeacher'],
  '開課日': ['classStartDate'],
  '程度需求': ['level'],
  '可上課時段': ['timeSlots'],
  '人數': ['groupSize'],
  '是否有吉他': ['hasGuitar'],
  '原價': ['basePrice'],
  '優惠': ['discount'],
  '應付金額': ['finalPrice'],
  '匯款後五碼': ['transferLast4'],
  '備註': ['note'],
};

const VALUE_LABELS = {
  '報名類型': { group: '團體班', private: '個人班', custom: '自組班' },
  '學員類型': { new: '新生', returning: '舊生' },
  '是否有吉他': { yes: '有', no: '沒有', interested: '想了解購買' },
};

function sourceKeys(field) {
  return [field, ...(FIELD_ALIASES[field] || [])];
}

function formatField(field, value) {
  const cleaned = cleanCell(value);
  return VALUE_LABELS[field]?.[cleaned] || cleaned;
}

function normalizeRows(payload) {
  const source = payload.rows || payload.data || payload.registrations;
  if (!Array.isArray(source)) return null;
  if (!source.length) return [];

  if (Array.isArray(source[0])) {
    const payloadHeader = Array.isArray(payload.header) ? payload.header.map(String) : [];
    const firstRow = source[0].map(String);
    const knownHeaders = DISPLAY_FIELDS.flatMap(sourceKeys);
    const firstRowIsHeader = firstRow.some(key => knownHeaders.includes(key));
    const header = payloadHeader.length ? payloadHeader : (firstRowIsHeader ? firstRow : []);
    const rows = firstRowIsHeader && !payloadHeader.length ? source.slice(1) : source;
    return rows.map(row => Object.fromEntries(DISPLAY_FIELDS.map((field, index) => {
      const sourceIndex = header.length
        ? sourceKeys(field).map(key => header.indexOf(key)).find(i => i >= 0)
        : index;
      return [field, formatField(field, sourceIndex >= 0 ? row[sourceIndex] : '')];
    })));
  }

  return source.map(row => Object.fromEntries(DISPLAY_FIELDS.map(field => {
    const key = sourceKeys(field).find(candidate => row[candidate] !== undefined);
    return [field, formatField(field, key ? row[key] : '')];
  })));
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
      const upstreamError = payload && typeof payload.error === 'string'
        ? payload.error.slice(0, 240)
        : '';
      console.error('Registration admin upstream error', {
        status: upstream.status,
        hasPayload: Boolean(payload),
        upstreamError,
      });
      return noStoreJson(res, 502, {
        ok: false,
        error: upstreamError
          ? '資料服務錯誤：' + upstreamError
          : '資料服務回傳格式不正確，請確認 Apps Script 已部署新版本',
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
