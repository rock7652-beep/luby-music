import crypto from 'node:crypto';
import { hasSameOrigin, hasValidAdminSession, noStoreJson } from './_lib/admin-session.js';
import { listClasses, normalizeClass, createClass, updateClass } from './_lib/classes-store.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET' && req.query?.public === '1') return noStoreJson(res, 200, { ok: true, classes: await listClasses() });
    if (!hasValidAdminSession(req)) return noStoreJson(res, 401, { ok: false, error: '請先登入管理中心' });
    if (req.method === 'GET') return noStoreJson(res, 200, { ok: true, classes: await listClasses() });
    if (!['POST','PUT'].includes(req.method)) { res.setHeader('Allow','GET, POST, PUT'); return noStoreJson(res,405,{ok:false,error:'Method not allowed'}); }
    if (!hasSameOrigin(req)) return noStoreJson(res, 403, { ok: false, error: '來源驗證失敗' });
    let body, data;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}; data = normalizeClass(body); }
    catch (error) { return noStoreJson(res,400,{ok:false,error:error.message}); }
    if (req.method === 'POST') return noStoreJson(res, 201, { ok: true, class: await createClass({ ...data, id: crypto.randomUUID() }) });
    if (!/^[a-zA-Z0-9-]{1,64}$/.test(String(body.id || '')) || !Number.isSafeInteger(body.version) || body.version < 1) return noStoreJson(res,400,{ok:false,error:'班級版本不完整，請重新整理'});
    return noStoreJson(res,200,{ok:true,class:await updateClass({...data,id:String(body.id)},body.version)});
  } catch (error) { return noStoreJson(res,error.status || 503,{ok:false,error:error.message}); }
}
