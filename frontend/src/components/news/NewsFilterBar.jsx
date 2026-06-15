import PropTypes from 'prop-types';

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

export default function NewsFilterBar({ selectedCategory, onChange }) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-bloomberg-border pb-3">
      {NEWS_CATEGORIES.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          className={
            selectedCategory === item.key
              ? 'bg-bloomberg-orange px-3 py-1 font-mono text-xs text-black'
              : 'border border-bloomberg-border bg-black px-3 py-1 font-mono text-xs text-bloomberg-muted hover:text-bloomberg-orange'
          }
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

NewsFilterBar.propTypes = {
  selectedCategory: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};
