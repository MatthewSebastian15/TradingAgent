import PropTypes from 'prop-types';

const PROVIDER_NAMES = new Set(['marketaux', 'newsdata', 'google_news_light', 'rss_context']);
const CATEGORY_LABELS = {
  markets: 'MARKETS',
  world: 'WORLD',
  finance: 'FINANCE',
  tech: 'TECH',
  macro: 'MACRO',
  central_bank: 'CENTRAL BANK',
  regulatory: 'REGULATORY',
  forex: 'FOREX',
  crypto: 'CRYPTO',
};
const CATEGORY_ALIASES = {
  market: 'markets',
  business: 'finance',
  commodities: 'markets',
  energy: 'markets',
  'central-bank': 'central_bank',
  centralbank: 'central_bank',
  indonesia: 'markets',
};
const MAX_DESCRIPTION_WORDS = 35;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_DAYS = 7;

function normalizeText(value) {
  return String(value || '').trim();
}

function isProviderName(value) {
  return PROVIDER_NAMES.has(normalizeText(value).toLowerCase());
}

function normalizeCategory(value) {
  const rawCategory = normalizeText(value).toLowerCase().replace(/\s+/g, '_');
  const category = CATEGORY_ALIASES[rawCategory] || rawCategory;
  return CATEGORY_LABELS[category] ? category : 'unknown';
}

function getCategoryLabel(article) {
  return CATEGORY_LABELS[normalizeCategory(article.category)] || 'UNKNOWN';
}

function getDataSource(article) {
  const candidates = [
    article.source,
    article.publisher,
    article.source_name,
    article.source_title,
    article.source_label,
    article.source_domain,
    article.provider,
  ];

  const source = candidates.find((value) => value && !isProviderName(value));
  return normalizeText(source) || 'Unknown Source';
}

function parsePublishedDate(article) {
  const value = article.published_at || article.publishedAt || article.date;
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDisplayDate(article) {
  const date = parsePublishedDate(article);
  if (!date) return normalizeText(article.published_age) || '-';

  const elapsedMs = Math.max(MINUTE_MS, Date.now() - date.getTime());
  if (elapsedMs < HOUR_MS) {
    return `${Math.floor(elapsedMs / MINUTE_MS)}m`;
  }
  if (elapsedMs < DAY_MS) {
    return `${Math.floor(elapsedMs / HOUR_MS)}h`;
  }

  const days = Math.floor(elapsedMs / DAY_MS);
  if (days < WEEK_DAYS) {
    return `${days} ${days === 1 ? 'Day' : 'Days'}`;
  }

  return `${Math.floor(days / WEEK_DAYS)} W`;
}

function limitDescriptionWords(value, fallback) {
  const text = normalizeText(value) || normalizeText(fallback) || 'No description available.';
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= MAX_DESCRIPTION_WORDS) return text;
  return words.slice(0, MAX_DESCRIPTION_WORDS).join(' ');
}

export default function NewsRow({ article }) {
  const title = normalizeText(article.title) || 'Untitled news';
  const url = normalizeText(article.url);
  const source = getDataSource(article);
  const category = getCategoryLabel(article);
  const date = getDisplayDate(article);
  const description = limitDescriptionWords(article.description || article.summary, title);

  const titleNode = url ? (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="terminal-news-headline font-bold text-bloomberg-white transition-colors hover:text-bloomberg-orange"
    >
      {title}
    </a>
  ) : (
    <span className="terminal-news-headline font-bold text-bloomberg-white">{title}</span>
  );

  return (
    <article className="terminal-news-row border-b border-bloomberg-border/70 bg-black/25 px-3 py-2 transition-colors last:border-b-0 hover:bg-bloomberg-orange/5">
      <div className="min-w-0 space-y-0.5">
        <div className="terminal-news-meta flex min-w-0 items-center gap-1.5 truncate font-mono text-[9px] font-semibold uppercase leading-4 tracking-wide text-bloomberg-muted">
          <span className="terminal-news-category shrink-0 text-bloomberg-orange">{category}</span>
          <span aria-hidden="true" className="text-neutral-600">
            -
          </span>
          <span className="terminal-news-source truncate text-bloomberg-green">
            {source.toUpperCase()}
          </span>
          <span aria-hidden="true" className="shrink-0 text-neutral-600">
            -
          </span>
          <span className="terminal-news-date shrink-0 text-neutral-400">{date}</span>
        </div>

        <div className="terminal-news-headline truncate text-[13px] font-bold leading-5 text-neutral-100">
          {titleNode}
        </div>

        <div className="terminal-news-summary truncate text-[11px] leading-4 text-bloomberg-muted">
          {description}
        </div>
      </div>
    </article>
  );
}

NewsRow.propTypes = {
  article: PropTypes.shape({
    category: PropTypes.string,
    date: PropTypes.string,
    description: PropTypes.string,
    provider: PropTypes.string,
    publishedAt: PropTypes.string,
    published_age: PropTypes.string,
    published_at: PropTypes.string,
    publisher: PropTypes.string,
    source: PropTypes.string,
    source_domain: PropTypes.string,
    source_label: PropTypes.string,
    source_name: PropTypes.string,
    source_title: PropTypes.string,
    summary: PropTypes.string,
    title: PropTypes.string,
    url: PropTypes.string,
  }).isRequired,
};
