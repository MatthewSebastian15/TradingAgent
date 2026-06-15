import PropTypes from 'prop-types';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

const PROVIDER_NAMES = new Set(['marketaux', 'newsdata', 'google_news_light', 'rss_context']);

function normalizeText(value) {
  return String(value || '').trim();
}

function isProviderName(value) {
  return PROVIDER_NAMES.has(normalizeText(value).toLowerCase());
}

function getPublisher(article) {
  const candidates = [
    article.publisher,
    article.source_name,
    article.source_title,
    article.source_label,
    article.source,
    article.source_domain,
  ];

  const publisher = candidates.find((value) => value && !isProviderName(value));
  return publisher || 'Unknown Source';
}

function getSource(article) {
  return (
    normalizeText(article.source) ||
    normalizeText(article.source_name) ||
    normalizeText(article.source_domain) ||
    'Unknown'
  );
}

function getDisplayDate(article) {
  const value = article.published_at || article.publishedAt || article.date;
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((startToday - startDate) / 86400000);

  if (diffDays <= 0) return 'Today';
  if (diffDays <= 7) return `${diffDays} ${diffDays === 1 ? 'Day' : 'Days'}`;

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

export default function NewsRow({ article }) {
  const title = article.title || 'Untitled news';
  const url = normalizeText(article.url);
  const source = getSource(article);
  const age = getDisplayDate(article);
  const publisher = getPublisher(article);
  const description =
    article.description || article.summary || article.title || 'No description available.';

  const titleNode = url ? (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="font-bold text-bloomberg-white transition-colors hover:text-bloomberg-orange"
    >
      {title}
    </a>
  ) : (
    <span className="font-bold text-bloomberg-white">{title}</span>
  );

  return (
    <Card className="rounded-lg border-bloomberg-border bg-black/55 px-3 py-2.5 shadow-sm shadow-black/20 transition-all hover:border-bloomberg-orange/40 hover:bg-bloomberg-orange/5">
      <div className="flex items-center gap-2 text-xs text-neutral-300">
        <Badge
          variant="outline"
          className="rounded-full border-bloomberg-border bg-bloomberg-surface px-2 py-0 font-mono text-[10px] font-semibold text-neutral-300"
        >
          {source}
        </Badge>
        <span className="mx-2 text-bloomberg-muted">-</span>
        <span className="text-[10px] text-bloomberg-muted">{age}</span>
      </div>

      <div className="mt-0.5 truncate text-xs text-neutral-300">
        {titleNode}
        <span className="text-bloomberg-muted"> - {publisher}</span>
      </div>

      <div className="mt-0.5 truncate text-[11px] text-bloomberg-muted">{description}</div>
    </Card>
  );
}

NewsRow.propTypes = {
  article: PropTypes.shape({
    date: PropTypes.string,
    description: PropTypes.string,
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
