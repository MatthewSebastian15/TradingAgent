import PropTypes from 'prop-types';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

const PROVIDER_NAMES = new Set(['marketaux', 'newsdata', 'google_news_light', 'rss_context']);
const CATEGORY_LABELS = {
  market: 'MARKET',
  macro: 'MACRO',
  crypto: 'CRYPTO',
  forex: 'FOREX',
  commodities: 'COMMODITIES',
  regulatory: 'REGULATORY',
  indonesia: 'INDONESIA',
};
const CATEGORY_BADGE_CLASSES = {
  market: 'border-orange-400/50 bg-orange-400/10 text-orange-300',
  macro: 'border-blue-400/50 bg-blue-400/10 text-blue-300',
  crypto: 'border-cyan-400/50 bg-cyan-400/10 text-cyan-300',
  forex: 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300',
  commodities: 'border-amber-400/50 bg-amber-400/10 text-amber-300',
  regulatory: 'border-red-400/50 bg-red-400/10 text-red-300',
  indonesia: 'border-fuchsia-400/50 bg-fuchsia-400/10 text-fuchsia-300',
  unknown: 'border-bloomberg-border bg-bloomberg-surface text-neutral-300',
};
const MAX_DESCRIPTION_WORDS = 35;

function normalizeText(value) {
  return String(value || '').trim();
}

function isProviderName(value) {
  return PROVIDER_NAMES.has(normalizeText(value).toLowerCase());
}

function normalizeCategory(value) {
  const category = normalizeText(value).toLowerCase();
  return CATEGORY_LABELS[category] ? category : 'unknown';
}

function getCategoryLabel(article) {
  return CATEGORY_LABELS[normalizeCategory(article.category)] || 'UNKNOWN';
}

function getCategoryBadgeClass(article) {
  return (
    CATEGORY_BADGE_CLASSES[normalizeCategory(article.category)] || CATEGORY_BADGE_CLASSES.unknown
  );
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
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toISOString().slice(0, 10);
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
    <Card className="terminal-news-row rounded-lg border-bloomberg-border bg-black/55 px-3 py-2 shadow-sm shadow-black/20 transition-all hover:border-bloomberg-orange/40 hover:bg-bloomberg-orange/5">
      <div className="terminal-news-meta flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-300">
        <span className="terminal-news-source">{source}</span>
        <span className="text-bloomberg-muted">-</span>
        <Badge
          variant="outline"
          className={`terminal-news-category rounded-full px-2 py-0 font-mono text-[10px] font-semibold ${getCategoryBadgeClass(
            article
          )}`}
        >
          {category}
        </Badge>
        <span className="text-bloomberg-muted">-</span>
        <span className="terminal-news-date text-bloomberg-muted">{date}</span>
      </div>

      <div className="terminal-news-headline mt-1 text-sm leading-snug text-neutral-200">
        {titleNode}
      </div>

      <div className="terminal-news-summary mt-1 text-xs leading-relaxed text-bloomberg-muted">
        {description}
      </div>
    </Card>
  );
}

NewsRow.propTypes = {
  article: PropTypes.shape({
    category: PropTypes.string,
    date: PropTypes.string,
    description: PropTypes.string,
    provider: PropTypes.string,
    publishedAt: PropTypes.string,
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
