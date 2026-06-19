export function normalizeNewsItem(item = {}) {
  const rawSource =
    item.source || item.sourceName || item.publisher || item.provider || item.origin;

  const source =
    rawSource && typeof rawSource === 'object'
      ? rawSource?.name || 'Unknown Source'
      : rawSource || 'Unknown Source';

  const category = (item.category || item.topic || item.section || item.type || 'GENERAL')
    .toString()
    .toUpperCase();

  const publishedAt =
    item.publishedAt ||
    item.published_at ||
    item.pubDate ||
    item.date ||
    item.createdAt ||
    item.created_at ||
    item.time ||
    null;

  return {
    id: item.id || item.url || item.link || item.headline || item.title,
    category,
    source,
    publishedAt,
    headline: item.headline || item.title || item.name || 'Untitled news',
    description:
      item.description ||
      item.summary ||
      item.snippet ||
      item.content ||
      'No description available.',
    url: item.url || item.link || null,
  };
}
