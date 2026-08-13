const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwRicgFrAKQIdnxeAi6knZWRBWkOEflf0RHS16eCxbS0-Ca-loDwvRPtxowqGgW3ybyJA/exec';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const upstream = await fetch(APPS_SCRIPT_URL + '?action=getDates');
    if (!upstream.ok) throw new Error('HTTP ' + upstream.status);
    const data = await upstream.json();

    // 日期短暫存於 Vercel 邊緣節點；過期時先回傳舊值並在背景更新。
    // 後台管理與寫入仍直接連 Apps Script，不受這個快取影響。
    res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=15');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({ ok: false, error: '暫時無法讀取預約日期：' + err.message });
  }
}
