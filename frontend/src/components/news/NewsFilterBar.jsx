import { RefreshCw } from 'lucide-react';
import PropTypes from 'prop-types';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { getCategoryColor } from '@/lib/news/categoryColors';
import { prefetchCategory } from '@/lib/news/categoryPrefetch';

const NEWS_CATEGORIES = [
  { key: 'all', label: 'ALL' },
  { key: 'markets', label: 'MARKETS' },
  { key: 'world', label: 'WORLD' },
  { key: 'macro', label: 'MACRO' },
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
      className="terminal-news-filter-tab h-7 shrink-0 rounded-md border border-bloomberg-border bg-black/50 px-2.5 font-mono text-[10px] text-bloomberg-muted"
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

export default function NewsFilterBar({ selectedCategory, onChange, onRefresh }) {
  return (
    <div className="terminal-news-toolbar flex items-center justify-end gap-2">
      <div className="terminal-news-filter flex gap-1.5 overflow-x-auto">
        {NEWS_CATEGORIES.map((item) => (
          <CategoryTab
            key={item.key}
            item={item}
            isActive={selectedCategory === item.key}
            onChange={onChange}
          />
        ))}
      </div>

      {onRefresh && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRefresh}
          className="terminal-news-filter-tab terminal-news-refresh-button h-7 shrink-0 rounded-md border border-bloomberg-border bg-black/50 px-2.5 font-mono text-[10px] text-bloomberg-muted hover:border-bloomberg-orange hover:bg-bloomberg-orange/10 hover:text-bloomberg-orange"
        >
          <RefreshCw className="h-3 w-3" />
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
};
