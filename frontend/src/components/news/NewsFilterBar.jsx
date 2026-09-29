import { RefreshCw } from 'lucide-react';
import PropTypes from 'prop-types';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { getCategoryColor } from '@/lib/news/categoryColors';
import { prefetchCategory } from '@/lib/news/categoryPrefetch';

// Keep this list in sync with the backend's category set: both
// packages/tradingagents/dataflows/news/general_news_categories.py's
// GENERAL_NEWS_CATEGORIES and backend/config/defaults.py's
// GENERAL_NEWS_ALLOWED_CATEGORIES. Colors for every key already exist in
// frontend/src/lib/news/categoryColors.js and labels in NewsRow.jsx's
// CATEGORY_LABELS — this is the one remaining place that was missing them.
const NEWS_CATEGORIES = [
  { key: 'all', label: 'ALL' },
  { key: 'markets', label: 'MARKETS' },
  { key: 'world', label: 'WORLD' },
  { key: 'finance', label: 'FINANCE' },
  { key: 'tech', label: 'TECH' },
  { key: 'macro', label: 'MACRO' },
  { key: 'central_bank', label: 'CENTRAL BANK' },
  { key: 'regulatory', label: 'REGULATORY' },
  { key: 'forex', label: 'FOREX' },
  { key: 'crypto', label: 'CRYPTO' },
];

function CategoryTab({ item, isActive, onChange }) {
  const [isHovered, setIsHovered] = useState(false);
  const color = getCategoryColor(item.key);

  const style = isActive
    ? { color: color.text, borderColor: color.border, backgroundColor: color.activeBg }
    : isHovered
      ? { color: color.text, borderColor: color.border, backgroundColor: color.bg }
      : {};

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      style={style}
      onMouseEnter={() => {
        setIsHovered(true);
        prefetchCategory(item.key);
      }}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => {
        if (!isActive) onChange(item.key);
      }}
      className="terminal-news-filter-tab h-8 shrink-0 rounded-md border border-bloomberg-border bg-black/50 px-2.5 text-[10px] font-bold uppercase text-bloomberg-muted"
    >
      {item.label}
    </Button>
  );
}

CategoryTab.propTypes = {
  isActive: PropTypes.bool.isRequired,
  item: PropTypes.shape({
    key: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
  }).isRequired,
  onChange: PropTypes.func.isRequired,
};

export default function NewsFilterBar({
  selectedCategory,
  onChange,
  onRefresh,
  isRefreshing = false,
  refreshDisabled = false,
}) {
  return (
    <div className="terminal-news-toolbar flex items-center justify-end gap-3">
      <div className="terminal-news-filter-wrap relative min-w-0 flex-1">
        <div className="terminal-news-filter flex gap-2 overflow-x-auto">
          {NEWS_CATEGORIES.map((item) => (
            <CategoryTab
              key={item.key}
              item={item}
              isActive={selectedCategory === item.key}
              onChange={onChange}
            />
          ))}
        </div>
        <div
          aria-hidden
          className="terminal-news-filter-fade pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-black/70 to-transparent"
        />
      </div>

      {onRefresh && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isRefreshing || refreshDisabled}
          className="terminal-news-filter-tab terminal-news-refresh-button ml-auto h-8 shrink-0 rounded-md border border-bloomberg-border bg-black/50 px-2.5 text-[10px] font-bold uppercase text-bloomberg-muted hover:border-bloomberg-orange hover:bg-bloomberg-orange/10 hover:text-bloomberg-orange disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-bloomberg-border disabled:hover:bg-black/50 disabled:hover:text-bloomberg-muted"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          REFRESH
        </Button>
      )}
    </div>
  );
}

NewsFilterBar.propTypes = {
  selectedCategory: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  onRefresh: PropTypes.func,
  isRefreshing: PropTypes.bool,
  refreshDisabled: PropTypes.bool,
};
