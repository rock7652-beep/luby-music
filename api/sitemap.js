import { listPublishedArticles } from './_lib/articles-store.js';

function xmlEscape(value) { return String(value).replace(/[<>&'"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c])); }

export default async function handler(_req, res) {
  const articles = await listPublishedArticles().catch(() => []);
  const fixed = [
    ['https://www.lubymusic.com/', '1.0'],
    ['https://www.lubymusic.com/course/', '0.9'],
    ['https://www.lubymusic.com/guitar-care/', '0.9'],
    ['https://www.lubymusic.com/articles/', '0.8']
  ];
  const urls = fixed.map(([loc, priority]) => `<url><loc>${loc}</loc><priority>${priority}</priority></url>`);
  for (const article of articles) {
    const lastmod = String(article.updated_at || article.published_at || '').slice(0, 10);
    urls.push(`<url><loc>${xmlEscape(`https://www.lubymusic.com/articles/${article.slug}/`)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<priority>0.7</priority></url>`);
  }
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`);
}
