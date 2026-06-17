import PropTypes from 'prop-types';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const NEWS_CATEGORIES = [
  { key: 'all', label: 'ALL' },
  { key: 'market', label: 'MARKET' },
  { key: 'macro', label: 'MACRO' },
  { key: 'crypto', label: 'CRYPTO' },
  { key: 'forex', label: 'FOREX' },
  { key: 'commodities', label: 'COMMODITIES' },
  { key: 'regulatory', label: 'REGULATORY' },
  { key: 'indonesia', label: 'INDONESIA' },
];

export default function NewsFilterBar({ selectedCategory, onChange, onRefresh }) {
  return (
    <div className="terminal-news-toolbar flex items-center justify-between gap-3 border-b border-bloomberg-border pb-3">
      <div className="terminal-news-filter flex flex-wrap gap-2">
        {NEWS_CATEGORIES.map((item) => (
          <Button
            key={item.key}
            type="button"
            variant={selectedCategory === item.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => onChange(item.key)}
            className={
              selectedCategory === item.key
                ? 'terminal-news-filter-tab h-8 rounded-full bg-bloomberg-orange px-3 font-mono text-xs font-bold text-black shadow-sm shadow-bloomberg-orange/20 hover:bg-bloomberg-orange/90'
                : 'terminal-news-filter-tab h-8 rounded-full border-bloomberg-border bg-black/60 px-3 font-mono text-xs text-bloomberg-muted hover:border-bloomberg-orange hover:bg-bloomberg-orange/10 hover:text-bloomberg-orange'
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
          className="terminal-news-filter-tab terminal-news-refresh-button h-8 shrink-0 rounded-full border-bloomberg-border bg-black/60 px-3 font-mono text-xs text-bloomberg-muted hover:border-bloomberg-orange hover:bg-bloomberg-orange/10 hover:text-bloomberg-orange"
        >
          <RefreshCw className="h-3.5 w-3.5" />
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
