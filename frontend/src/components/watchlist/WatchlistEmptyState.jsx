import PropTypes from 'prop-types';
import React from 'react';

export default function WatchlistEmptyState({ onCreateGroup }) {
  return (
    <div className="border border-bloomberg-border bg-bloomberg-card px-4 py-5 font-mono">
      <div className="text-xs font-bold uppercase tracking-[0.18em] text-bloomberg-white">
        No watchlist group yet
      </div>
      <div className="mt-2 text-xs text-bloomberg-muted">
        Create your first group to start tracking tickers.
      </div>
      <button
        type="button"
        onClick={onCreateGroup}
        className="mt-4 h-9 border border-bloomberg-orange bg-bloomberg-orange px-4 font-mono text-xs font-bold uppercase tracking-wider text-black hover:bg-orange-400"
      >
        CREATE GROUP
      </button>
    </div>
  );
}

WatchlistEmptyState.propTypes = {
  onCreateGroup: PropTypes.func.isRequired,
};
