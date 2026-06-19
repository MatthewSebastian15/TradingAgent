function newsTimeValue(item = {}) {
  const value =
    item.publishedAt ||
    item.published_at ||
    item.pubDate ||
    item.date ||
    item.createdAt ||
    item.created_at ||
    item.time ||
    0;
  const time = new Date(value).getTime();

  return Number.isNaN(time) ? 0 : time;
}

export function sortNewsItemsByNewest(news = []) {
  return [...news].sort((left, right) => newsTimeValue(right) - newsTimeValue(left));
}
