import PropTypes from 'prop-types';

import { getCategoryColor } from '@/lib/news/categoryColors';
import { formatNewsTime } from '@/lib/news/formatNewsTime';

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

function getDisplayDate(article) {
  const value = article.published_at || article.publishedAt || article.date;
  return formatNewsTime(value) || normalizeText(article.published_age) || '-';
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
  const categoryKey = normalizeCategory(article.category);
  const category = getCategoryLabel(article);
  const date = getDisplayDate(article);
  const description = limitDescriptionWords(article.description || article.summary, title);
  const categoryColor = getCategoryColor(categoryKey);

  const titleNode = url ? (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="terminal-news-headline font-bold text-neutral-100 transition-colors hover:text-bloomberg-orange"
    >
      {title}
    </a>
  ) : (
    <span className="terminal-news-headline font-bold text-neutral-100">{title}</span>
  );

  return (
    <article className="terminal-news-row rounded-lg border border-white/[0.08] bg-[#050505] px-3.5 py-2.5 transition-colors hover:bg-bloomberg-orange/5">
      <div className="min-w-0 space-y-0.5">
        <div className="terminal-news-meta flex min-w-0 items-center gap-1.5 uppercase leading-4 tracking-wide">
          <span className="terminal-news-time shrink-0 text-[11px] text-gray-500">{date}</span>
          <span className="terminal-news-source min-w-0 truncate text-xs font-bold text-bloomberg-green">
            {source.toUpperCase()}
          </span>
          <span
            aria-label={`Category: ${category}`}
            className="terminal-news-category ml-auto shrink-0 border px-1.5 py-px text-[8px] font-bold"
            style={{
              color: categoryColor.text,
              borderColor: categoryColor.border,
              backgroundColor: categoryColor.bg,
            }}
          >
            {category}
          </span>
        </div>

        <div className="terminal-news-headline truncate text-[15px] font-bold leading-tight text-neutral-100">
          {titleNode}
        </div>

        <div className="terminal-news-summary truncate text-xs leading-[1.4] text-[#8a8f98]">
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
