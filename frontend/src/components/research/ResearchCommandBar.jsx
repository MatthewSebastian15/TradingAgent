import { X } from 'lucide-react';
import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';

import TickerSearchBar from '../TickerSearchBar';

// Bloomberg command-line style bar: bracket label, search input, asset tag, status dot.
export default function ResearchCommandBar({ value, onSelect, onSubmit, onClear, loading = false }) {
  // Mirror the selected ticker so the clear button can reset the visible input.
  const [text, setText] = useState(value || '');
  useEffect(() => setText(value || ''), [value]);

  const hasText = Boolean(text);
  const dotClass = loading
    ? 'animate-pulse bg-bloomberg-orange'
    : hasText
      ? 'bg-bloomberg-green'
      : 'bg-bloomberg-muted';

  function clear() {
    setText('');
    if (onClear) onClear();
  }

  return (
    <div className="flex h-10 items-stretch border-b border-bloomberg-border bg-[#0d0d0d] focus-within:border-b-bloomberg-orange transition-colors duration-150">
      <span className="flex shrink-0 items-center border-r border-bloomberg-border px-3 font-mono text-[13px] uppercase tracking-wider text-bloomberg-orange">
        [ 1 &lt;HELP&gt; SEARCH ]
      </span>

      <div className="flex flex-1 items-center px-3 [&_input]:text-[14px] [&_input]:text-white [&_input::placeholder]:text-[#444]">
        <TickerSearchBar
          bare
          value={text}
          placeholder="(Enter search term or function)"
          onSelect={(item) => {
            setText(item.symbol);
            onSelect(item);
          }}
          onSubmit={(symbol) => {
            setText(symbol);
            onSubmit({ symbol });
          }}
          onClear={() => {}}
        />
      </div>

      {hasText && (
        <span className="flex shrink-0 items-center border-l border-bloomberg-border px-3 font-mono text-[12px] uppercase tracking-wider text-bloomberg-orange">
          &lt;EQUITY&gt;
        </span>
      )}

      {hasText && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className="flex shrink-0 items-center border-l border-bloomberg-border px-2 text-bloomberg-muted hover:text-bloomberg-white"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}

      <span className="flex shrink-0 items-center border-l border-bloomberg-border px-3">
        <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden="true" />
      </span>
    </div>
  );
}

ResearchCommandBar.propTypes = {
  value: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onClear: PropTypes.func,
  loading: PropTypes.bool,
};
