function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function articleKey(article = {}) {
  const id = normalizeText(article.id);
  if (id) return `id:${id}`;

  const url = normalizeText(article.url || article.link);
  if (url) return `url:${url}`;

  const title = normalizeText(article.title || article.headline || article.name);
  const source = normalizeText(article.source || article.publisher || article.provider);
  return title ? `title:${title}:${source}` : '';
}

export function dedupeNewsItems(news = []) {
  const seen = new Set();
  const deduped = [];

  for (const article of Array.isArray(news) ? news : []) {
    const key = articleKey(article || {});
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    deduped.push(article);
  }

  return deduped;
}
