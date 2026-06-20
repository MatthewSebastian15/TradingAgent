import { RefreshCw } from 'lucide-react';
import PropTypes from 'prop-types';

import { Button } from '@/components/ui/button';

const NEWS_CATEGORIES = [
  { key: 'all', label: 'ALL' },
  { key: 'markets', label: 'MARKETS' },
  { key: 'world', label: 'WORLD' },
  { key: 'macro', label: 'MACRO' },
  { key: 'forex', label: 'FOREX' },
  { key: 'crypto', label: 'CRYPTO' },
];

export default function NewsFilterBar({ selectedCategory, onChange, onRefresh }) {
  return (
    <div className="terminal-news-toolbar flex items-center gap-2">
      <div className="terminal-news-filter flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1">
        {NEWS_CATEGORIES.map((item) => (
          <Button
            key={item.key}
            type="button"
            variant={selectedCategory === item.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              if (selectedCategory !== item.key) onChange(item.key);
            }}
            className={
              selectedCategory === item.key
                ? 'terminal-news-filter-tab h-7 shrink-0 rounded-md bg-bloomberg-orange px-2.5 font-mono text-[10px] font-bold text-black shadow-sm shadow-bloomberg-orange/20 hover:bg-bloomberg-orange/90'
                : 'terminal-news-filter-tab h-7 shrink-0 rounded-md border-bloomberg-border bg-black/50 px-2.5 font-mono text-[10px] text-bloomberg-muted hover:border-bloomberg-orange hover:bg-bloomberg-orange/10 hover:text-bloomberg-orange'
            }
          >
            {item.label}
          </Button>
        ))}
      </div>

      {onRefresh && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRefresh}
          className="terminal-news-filter-tab terminal-news-refresh-button h-7 shrink-0 rounded-md border-bloomberg-border bg-black/50 px-2.5 font-mono text-[10px] text-bloomberg-muted hover:border-bloomberg-orange hover:bg-bloomberg-orange/10 hover:text-bloomberg-orange"
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
