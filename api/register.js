import { getClass, isClassOpen } from './_lib/classes-store.js';
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
    // 名額由店長手動控管；報名只是申請，不自動扣名額。
    // 每次送出重新查雲端，舊頁面也不能提交已關閉的班。
    let selected;
    try { selected = await getClass(String(body.classId)); }
    catch { return res.status(503).json({ ok: false, error: '暫時無法確認班級狀態，請稍後再試' }); }
    if (!isClassOpen(selected)) return res.status(409).json({ ok: false, error: '此班已暫停報名或滿班，請重新選班' });
    const early = new Date() <= new Date('2026-10-20T23:59:59+08:00');
    const finalPrice = early ? Math.round(selected.price * 0.95) : selected.price;
    if ((body.classVersion !== undefined && body.classVersion !== selected.version) || Number(body.finalPrice) !== finalPrice ||
        ['Name','Day','Time','Teacher','StartDate','EndDate'].some(key => {
          const oldValue = body['class' + key];
          return oldValue !== undefined && String(oldValue) !== String(selected[key[0].toLowerCase() + key.slice(1)]);
        })) return res.status(409).json({ ok: false, error: '班級資料已更新，請重新整理確認時間與費用後再報名' });
    Object.assign(body, { classId: selected.id, classVersion: selected.version, className: selected.name,
      classLevel: selected.level, classDay: selected.day, classTime: selected.time, classTeacher: selected.teacher,
      classStartDate: selected.startDate, classEndDate: selected.endDate, basePrice: selected.price,
      finalPrice, discount: selected.price - finalPrice, isEarlyBird: early });
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

    // Apps Script 的既有正式版本以 { status: 'ok' } 表示成功；
    // 新版也可能回傳 { ok: true }。兩種格式都接受，避免成功資料被誤報失敗。
    const accepted = json.ok === true || json.status === 'ok';
    if (!upstream.ok || !accepted) {
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
