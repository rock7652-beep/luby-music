import { escapeHtml, getPublishedArticle, sanitizeArticleHtml } from './_lib/articles-store.js';

function jsonForHtml(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function page(article) {
  const canonical = `https://www.lubymusic.com/articles/${encodeURIComponent(article.slug)}/`;
  const title = article.seo_title || article.title;
  const description = article.seo_description || article.excerpt || '';
  const image = article.cover_url || 'https://www.lubymusic.com/assets/home/hero-clean.webp';
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description,
    image: [image],
    datePublished: article.published_at,
    dateModified: article.updated_at,
    author: { '@type': 'Organization', name: '陸比音樂' },
    publisher: { '@type': 'Organization', name: '陸比音樂', url: 'https://www.lubymusic.com/' },
    mainEntityOfPage: canonical
  };

  return `<!doctype html>
<html lang="zh-Hant"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${canonical}"><meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${canonical}"><meta property="og:image" content="${escapeHtml(image)}">
<meta name="twitter:card" content="summary_large_image">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&family=Noto+Serif+TC:wght@600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/articles.css"><link rel="stylesheet" href="/assets/article-dynamic.css">
<script type="application/ld+json">${jsonForHtml(schema)}</script></head><body>
<nav class="nav"><div class="wrap nav-inner"><a href="/"><img class="logo" src="/assets/home/luby-logo.png" alt="陸比音樂 Luby Music"></a><div class="links"><a href="/">品牌首頁</a><a href="/articles/">吉他知識</a><a class="button button-dark" href="/course/">預約課程</a></div></div></nav>
<main class="article"><div class="breadcrumb"><a href="/articles/">吉他知識</a> ／ ${escapeHtml(article.category || '文章')}</div><div class="eyebrow">${escapeHtml(article.category || '吉他知識')}</div><h1>${escapeHtml(article.title)}</h1><p class="lead">${escapeHtml(article.excerpt || '')}</p><div class="meta">陸比音樂・${new Date(article.published_at || article.updated_at).toLocaleDateString('zh-TW')}</div>${article.cover_url ? `<img class="article-cover" src="${escapeHtml(article.cover_url)}" alt="${escapeHtml(article.cover_alt || article.title)}">` : ''}<div class="article-content">${sanitizeArticleHtml(article.content_html || '')}</div><section class="cta"><h2>需要更適合你的建議？</h2><p>歡迎向陸比音樂詢問課程、選琴、換弦與保養。</p><div class="actions"><a class="button button-line" href="https://line.me/R/ti/p/@gay6872z">LINE 諮詢</a><a class="button" href="/course/">查看課程預約</a></div></section></main>
<footer class="footer"><div class="wrap">陸比音樂 LUBY MUSIC・木吉他教學・選購・維修</div></footer><div class="mobile-bar"><a class="button" href="/course/">預約課程</a><a class="button button-line" href="https://line.me/R/ti/p/@gay6872z">LINE 諮詢</a></div></body></html>`;
}

export default async function handler(req, res) {
  try {
    const slug = String(req.query?.slug || '').toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return res.status(404).send('找不到文章');
    const article = await getPublishedArticle(slug);
    if (!article) return res.status(404).send('找不到文章');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(page(article));
  } catch {
    return res.status(503).send('文章暫時無法載入，請稍後再試。');
  }
}
