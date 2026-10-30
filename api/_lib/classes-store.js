const projectUrl = process.env.SUPABASE_URL || 'https://afsowcntqlimbtyfnceu.supabase.co';
const table = () => process.env.VERCEL_ENV === 'preview' ? 'course_classes_preview' : 'course_classes';

async function request(query, options = {}) {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('班級雲端儲存尚未設定');
  const response = await fetch(`${projectUrl}/rest/v1/${table()}?${query}`, {
    ...options, cache: 'no-store', signal: AbortSignal.timeout(10000),
    headers: { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
      'Content-Type': 'application/json', Prefer: 'return=representation', ...options.headers }
  });
  if (!response.ok) throw new Error('暫時無法讀取或儲存班級，請稍後再試');
  return response.json();
}

const unpack = row => ({ ...row.data, id: row.id, version: row.version });
export const listClasses = () => request('select=id,data,version&order=id').then(rows => rows.map(unpack));
export const getClass = id => request(`select=id,data,version&id=eq.${encodeURIComponent(id)}&limit=1`).then(rows => rows[0] ? unpack(rows[0]) : null);
export const createClass = data => request('', { method: 'POST', body: JSON.stringify({ id: data.id, data, version: 1 }) }).then(rows => unpack(rows[0]));
export async function updateClass(data, version) {
  const rows = await request(`id=eq.${encodeURIComponent(data.id)}&version=eq.${version}`, {
    method: 'PATCH', body: JSON.stringify({ data, version: version + 1, updated_at: new Date().toISOString() })
  });
  if (!rows.length) { const error = new Error('班級已被其他人更新，請重新整理後再修改'); error.status = 409; throw error; }
  return unpack(rows[0]);
}

export function normalizeClass(input) {
  const data = {};
  for (const key of ['name', 'teacher', 'level']) {
    data[key] = String(input[key] || '').trim();
    if (!data[key] || data[key].length > 80 || /[<>\x00-\x1f]/.test(data[key])) throw new Error('名稱、老師與程度請填寫 1–80 字純文字');
  }
  if (!['週一','週二','週三','週四','週五','週六','週日'].includes(input.day)) throw new Error('請選擇星期');
  data.day = input.day;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time || '')) throw new Error('請填寫正確上課時間');
  data.time = input.time;
  for (const key of ['startDate', 'endDate']) {
    const value = String(input[key] || '');
    if (!/^20\d\d-\d\d-\d\d$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) throw new Error('請填寫正確日期');
    data[key] = value;
  }
  if (data.endDate < data.startDate) throw new Error('結課日期不能早於開課日期');
  for (const [key,min,max] of [['lessons',1,365],['price',0,1000000],['capacity',1,999],['remaining',0,999]]) {
    const raw = input[key];
    if (['capacity','remaining'].includes(key) && (raw === null || raw === '' || raw === undefined)) { data[key] = null; continue; }
    if (raw === null || raw === '' || raw === undefined || typeof raw === 'boolean') throw new Error('請填寫堂數與費用');
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) throw new Error('堂數、費用或名額格式不正確');
    data[key] = value;
  }
  if (data.capacity !== null && data.remaining !== null && data.remaining > data.capacity) throw new Error('剩餘名額不能超過總名額');
  if (!['open','paused','full'].includes(input.status)) throw new Error('請選擇招生狀態');
  data.status = input.status;
  return data;
}

export const isClassOpen = c => c && c.status === 'open' && c.remaining !== 0;
