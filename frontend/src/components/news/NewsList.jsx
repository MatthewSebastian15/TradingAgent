import PropTypes from 'prop-types';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

import NewsRow from './NewsRow';

const CATEGORY_ORDER = [
  'market',
  'macro',
  'crypto',
  'forex',
  'commodities',
  'regulatory',
  'indonesia',
  'unknown',
];
const CATEGORY_LABELS = {
  market: 'MARKET',
  macro: 'MACRO',
  crypto: 'CRYPTO',
  forex: 'FOREX',
  commodities: 'COMMODITIES',
  regulatory: 'REGULATORY',
  indonesia: 'INDONESIA',
  unknown: 'UNKNOWN',
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

function normalizeCategory(value) {
  const category = String(value || '')
    .trim()
    .toLowerCase();
  return CATEGORY_LABELS[category] ? category : 'unknown';
}

function groupArticlesByCategory(articles) {
  const groups = new Map();

  articles.forEach((article) => {
    const category = normalizeCategory(article?.category);
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(article);
  });

  return [...groups.entries()].sort(([left], [right]) => {
    const leftIndex = CATEGORY_ORDER.indexOf(left);
    const rightIndex = CATEGORY_ORDER.indexOf(right);
    return (
      (leftIndex === -1 ? CATEGORY_ORDER.length : leftIndex) -
      (rightIndex === -1 ? CATEGORY_ORDER.length : rightIndex)
    );
  });
}

export default function NewsList({ articles }) {
  if (!articles.length) {
    return (
      <Card className="terminal-news-state mt-4 rounded-lg border-bloomberg-border bg-black/50 px-4 py-3 text-xs text-bloomberg-muted">
        No news found for this category.
      </Card>
    );
  }

  return (
    <div className="terminal-news-list mt-4 grid gap-4">
      {groupArticlesByCategory(articles).map(([category, groupedArticles]) => (
        <section
          key={category}
          aria-label={`${CATEGORY_LABELS[category]} news`}
          className="terminal-news-category-group grid gap-2"
        >
          <div className="flex items-center gap-2 border-b border-bloomberg-border/70 pb-2">
            <Badge
              variant="outline"
              className={`rounded-full px-2 py-0 font-mono text-[10px] font-semibold ${CATEGORY_BADGE_CLASSES[category]}`}
            >
              {CATEGORY_LABELS[category]}
            </Badge>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-bloomberg-muted">
              {groupedArticles.length} {groupedArticles.length === 1 ? 'story' : 'stories'}
            </span>
          </div>

          <div className="grid gap-2">
            {groupedArticles.map((article, index) => (
              <NewsRow
                key={article?.id || article?.url || article?.title || `${category}-${index}`}
                article={article || {}}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

NewsList.propTypes = {
  articles: PropTypes.arrayOf(PropTypes.object).isRequired,
};
