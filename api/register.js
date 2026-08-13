/**
 * /api/register
 * Vercel serverless function: validates registration payloads and forwards
 * them to the configured Google Apps Script Web App.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
  const APPS_SCRIPT_TOKEN = process.env.APPS_SCRIPT_TOKEN || '';

  if (!APPS_SCRIPT_URL) {
    return res.status(500).json({
      ok: false,
      error: '尚未設定 APPS_SCRIPT_URL 環境變數',
    });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  if (typeof body.source !== 'string') body.source = '';
  body.source = body.source.toLowerCase().replace(/[^a-z0-9_.\-:]/g, '').slice(0, 60) || 'direct';

  const courseType = body.courseType || 'group';
  if (!['group', 'private', 'custom'].includes(courseType)) {
    return res.status(400).json({ ok: false, error: 'courseType 不正確' });
  }
  if (!body.name) return res.status(400).json({ ok: false, error: '缺少必要欄位：name' });
  if (!/^\d{10}$/.test(String(body.phone || ''))) {
    return res.status(400).json({ ok: false, error: '電話格式錯誤（須為 10 碼數字）' });
  }
  if (courseType === 'group') {
    const required = ['classId', 'finalPrice', 'transferLast4'];
    const missing = required.filter((key) => body[key] === undefined || body[key] === null || body[key] === '');
    if (missing.length) {
      return res.status(400).json({ ok: false, error: '缺少必要欄位：' + missing.join(', ') });
    }
    if (!/^\d{4}$/.test(String(body.transferLast4))) {
      return res.status(400).json({ ok: false, error: '轉帳末四碼格式錯誤' });
    }
  } else {
    if (!Array.isArray(body.timeSlots) || body.timeSlots.length === 0) {
      return res.status(400).json({ ok: false, error: '請至少選一個方便上課時間' });
    }
    if (!body.level) return res.status(400).json({ ok: false, error: '請選擇學員程度' });
    if (!body.hasGuitar) return res.status(400).json({ ok: false, error: '請選擇是否有吉他' });
    if (courseType === 'custom' && !body.groupSize) {
      return res.status(400).json({ ok: false, error: '自組班請選擇預計人數' });
    }
  }

  const enriched = {
    ...body,
    token: APPS_SCRIPT_TOKEN,
    serverReceivedAt: new Date().toISOString(),
    ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
    userAgent: req.headers['user-agent'] || '',
  };

  try {
    const upstream = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(enriched),
      redirect: 'follow',
    });

    const text = await upstream.text();
    let json;
    try { json = JSON.parse(text); }
    catch { return res.status(502).json({ ok: false, error: 'Apps Script 回應非 JSON：' + text.slice(0, 200) }); }

    if (!upstream.ok || !json.ok) {
      let errMsg;
      if (json.error) {
        errMsg = json.error;
      } else if (upstream.ok) {
        const bodyPreview = text.length > 300 ? text.slice(0, 300) + '…' : text;
        errMsg = 'Apps Script 異常（HTTP 200 但 ok:false、無 error）。原始 body：' + bodyPreview;
      } else {
        errMsg = 'Apps Script 失敗 HTTP ' + upstream.status;
      }
      return res.status(upstream.ok ? 400 : 502).json({ ok: false, error: errMsg });
    }

    return res.status(200).json({ ok: true, id: json.id || null });
  } catch (err) {
    return res.status(500).json({ ok: false, error: '無法連線 Apps Script：' + err.message });
  }
}
