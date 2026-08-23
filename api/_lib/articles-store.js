import crypto from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://afsowcntqlimbtyfnceu.supabase.co';
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_4V9NfZerzVOxaGktYg8MgQ_RDDS4urd';

function keyHeaders(key) {
  const headers = { apikey: key };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  return headers;
}

async function request(path, options = {}, admin = false) {
  const key = admin ? (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '') : PUBLISHABLE_KEY;
  if (!key) throw new Error('文章後台尚未連接 Supabase Secret Key');
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: { ...keyHeaders(key), ...(options.headers || {}) }
  });
  const text = await response.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  if (!response.ok) {
    const message = data?.message || data?.error || `Supabase request failed (${response.status})`;
    throw new Error(message);
  }
  return data;
}

export function listPublishedArticles() {
  return request('/rest/v1/articles?select=id,slug,title,excerpt,cover_url,cover_alt,category,seo_title,seo_description,published_at,updated_at&status=eq.published&order=published_at.desc');
}

export function getPublishedArticle(slug) {
  return request(`/rest/v1/articles?select=*&slug=eq.${encodeURIComponent(slug)}&status=eq.published&limit=1`)
    .then(rows => rows?.[0] || null);
}

export function listAdminArticles() {
  return request('/rest/v1/articles?select=*&order=updated_at.desc', {}, true);
}

const TRASH_PREFIX = '__trash__:';

function trashCategory(status, category) {
  const safeStatus = status === 'published' ? 'published' : 'draft';
  return `${TRASH_PREFIX}${safeStatus}:${String(category || '吉他知識').replace(/^__trash__:[^:]+:/, '').slice(0, 18)}`;
}

export function trashArticle(id, originalStatus, originalCategory) {
  return request(`/rest/v1/articles?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({
      status: 'draft',
      category: trashCategory(originalStatus, originalCategory),
      published_at: null,
      updated_at: new Date().toISOString()
    })
  }, true).then(rows => rows?.[0]);
}

export function restoreArticle(id, restoreStatus, restoreCategory) {
  const status = restoreStatus === 'published' ? 'published' : 'draft';
  return request(`/rest/v1/articles?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({
      status,
      category: String(restoreCategory || '吉他知識').replace(/^__trash__:[^:]+:/, '').slice(0, 40),
      published_at: status === 'published' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    })
  }, true).then(rows => rows?.[0]);
}

export function createArticle(article) {
  return request('/rest/v1/articles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(article)
  }, true).then(rows => rows?.[0]);
}

export function updateArticle(id, article) {
  return request(`/rest/v1/articles?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(article)
  }, true).then(rows => rows?.[0]);
}

export function deleteArticle(id) {
  return request(`/rest/v1/articles?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE', headers: { Prefer: 'return=minimal' }
  }, true);
}

export async function uploadArticleImage({ filename, contentType, bytes }) {
  const safeName = String(filename || 'image').replace(/[^a-zA-Z0-9._-]/g, '-').slice(-100);
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName}`;
  await request(`/storage/v1/object/article-images/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': contentType, 'x-upsert': 'false' },
    body: bytes
  }, true);
  return `${SUPABASE_URL}/storage/v1/object/public/article-images/${path}`;
}

export function normalizeArticle(input = {}) {
  const status = input.status === 'published' ? 'published' : 'draft';
  const slug = String(input.slug || '').trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('網址只能使用小寫英文、數字與連字號');
  const title = String(input.title || '').trim();
  if (!title || title.length > 120) throw new Error('文章標題需為 1–120 個字');
  const now = new Date().toISOString();
  return {
    slug,
    title,
    excerpt: String(input.excerpt || '').trim().slice(0, 500),
    content_html: sanitizeArticleHtml(String(input.content_html || '')),
    cover_url: input.cover_url ? String(input.cover_url).trim() : null,
    cover_alt: String(input.cover_alt || '').trim().slice(0, 160),
    category: String(input.category || '吉他知識').trim().slice(0, 40),
    seo_title: String(input.seo_title || title).trim().slice(0, 120),
    seo_description: String(input.seo_description || input.excerpt || '').trim().slice(0, 320),
    status,
    published_at: status === 'published' ? (input.published_at || now) : null,
    updated_at: now
  };
}

export function sanitizeArticleHtml(html) {
  const allowedTags = new Set(['p', 'br', 'h2', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'blockquote', 'figure', 'figcaption', 'img', 'a', 'div']);
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\sstyle\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '');

  return cleaned.replace(/<\/?([a-z0-9-]+)([^>]*)>/gi, (tag, name, attributes) => {
    const lower = name.toLowerCase();
    if (!allowedTags.has(lower)) return '';
    if (tag.startsWith('</')) return `</${lower}>`;
    const safeAttributes = [];
    const permitted = lower === 'img' ? new Set(['src', 'alt', 'title'])
      : lower === 'a' ? new Set(['href', 'title', 'class', 'target', 'rel'])
        : lower === 'div' ? new Set(['class']) : new Set();
    attributes.replace(/([a-z0-9-]+)\s*=\s*("[^"]*"|'[^']*')/gi, (_match, key, quoted) => {
      const attr = key.toLowerCase();
      const value = quoted.slice(1, -1).trim();
      if (!permitted.has(attr)) return '';
      if ((attr === 'href' || attr === 'src') && !/^(https?:\/\/|\/)/i.test(value)) return '';
      if (attr === 'class') {
        const allowedClasses = lower === 'div'
          ? new Set(['note', 'cta', 'actions'])
          : new Set(['button', 'button-dark', 'button-line']);
        const safeClass = value.split(/\s+/).filter(name => allowedClasses.has(name)).join(' ');
        if (!safeClass) return '';
        safeAttributes.push(`class="${escapeHtml(safeClass)}"`);
        return '';
      }
      if (attr === 'target' && value !== '_blank') return '';
      if (attr === 'rel' && value !== 'noopener') return '';
      safeAttributes.push(`${attr}="${escapeHtml(value)}"`);
      return '';
    });
    const suffix = safeAttributes.length ? ` ${safeAttributes.join(' ')}` : '';
    return `<${lower}${suffix}>`;
  });
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
