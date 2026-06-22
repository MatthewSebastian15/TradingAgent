import PropTypes from 'prop-types';

import TickerSearchBar from '../TickerSearchBar';

// Bloomberg command-line style bar: bracket label, search input, status dot.
export default function ResearchCommandBar({ value, onSelect, onSubmit, loading = false }) {
  return (
    <div className="flex items-center gap-0 border border-bloomberg-border bg-[#0d0d0d] rounded-[2px] focus-within:border-bloomberg-orange transition-colors duration-150">
      <span className="shrink-0 border-r border-bloomberg-border px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-bloomberg-orange">
        [ 1 &lt;HELP&gt; SEARCH ]
      </span>
      <div className="flex-1 px-3">
        <TickerSearchBar
          bare
          value={value}
          placeholder="(Enter search term or function)"
          onSelect={onSelect}
          onSubmit={(symbol) => onSubmit({ symbol })}
          onClear={() => {}}
        />
      </div>
      <span
        className={`mr-3 ml-1 h-2 w-2 shrink-0 rounded-full ${
          loading ? 'animate-pulse bg-bloomberg-orange' : 'bg-bloomberg-muted'
        }`}
        aria-hidden="true"
      />
    </div>
  );
}

ResearchCommandBar.propTypes = {
  value: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  loading: PropTypes.bool,
};
