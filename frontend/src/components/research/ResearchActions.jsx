import PropTypes from 'prop-types';

const BUTTON =
  'font-mono text-[10px] uppercase tracking-wider border border-bloomberg-border px-2 py-1 text-bloomberg-white/80 hover:text-bloomberg-orange hover:border-bloomberg-orange transition-colors disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-bloomberg-border disabled:hover:text-bloomberg-white/80';

// Hub actions shown next to the detail tabs: feed the Watchlist, hand off to the AI Agent,
// or open the two-ticker comparison.
export default function ResearchActions({
  inWatchlist,
  comparing,
  onAddToWatchlist,
  onRunAnalysis,
  onToggleCompare,
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      {inWatchlist ? (
        <button type="button" disabled className={BUTTON}>
          ✓ IN WATCHLIST
        </button>
      ) : (
        <button type="button" onClick={onAddToWatchlist} className={BUTTON}>
          + WATCHLIST
        </button>
      )}
      <button type="button" onClick={onRunAnalysis} className={BUTTON}>
        RUN FULL ANALYSIS
      </button>
      <button type="button" onClick={onToggleCompare} aria-pressed={comparing} className={BUTTON}>
        {comparing ? '✕ CLOSE COMPARE' : '+ COMPARE'}
      </button>
    </div>
  );
}

ResearchActions.propTypes = {
  inWatchlist: PropTypes.bool.isRequired,
  comparing: PropTypes.bool.isRequired,
  onAddToWatchlist: PropTypes.func.isRequired,
  onRunAnalysis: PropTypes.func.isRequired,
  onToggleCompare: PropTypes.func.isRequired,
};
