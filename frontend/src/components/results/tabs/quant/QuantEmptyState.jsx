import PropTypes from 'prop-types';

import { SECTION_GROUPS, SECTIONS } from './config';

export const QUICK_TICKERS = ['AAPL', 'MSFT', 'NVDA', 'BBRI.JK', 'TLKM.JK', 'ASII.JK'];

const CHIP =
  'h-8 rounded-none border border-bloomberg-border px-3 font-mono text-[11px] tracking-wider text-bloomberg-white hover:border-bloomberg-orange hover:text-bloomberg-orange focus-visible:outline focus-visible:outline-1 focus-visible:outline-bloomberg-orange';

function TickerGroup({ label, symbols, onPick }) {
  return (
    <div className="space-y-1.5">
      <div className="font-mono text-[10px] tracking-wider text-bloomberg-white/80 uppercase">
        {label}
      </div>
      <div role="group" aria-label={label} className="flex flex-wrap gap-2">
        {symbols.map((symbol) => (
          <button key={symbol} type="button" onClick={() => onPick(symbol)} className={CHIP}>
            {symbol}
          </button>
        ))}
      </div>
    </div>
  );
}

TickerGroup.propTypes = {
  label: PropTypes.string.isRequired,
  symbols: PropTypes.arrayOf(PropTypes.string).isRequired,
  onPick: PropTypes.func.isRequired,
};

// First screen of /quant: one-click starts and a short map of what the page computes.
export function QuantEmptyState({ onPick, recent }) {
  const groups = SECTION_GROUPS.filter((g) => g.id !== 'summary');
  return (
    <div className="space-y-5 border border-bloomberg-border bg-bloomberg-card p-6 font-mono">
      <div className="space-y-1">
        <h1 className="text-sm font-bold tracking-[0.2em] text-bloomberg-orange uppercase">
          Quant analytics
        </h1>
        <p className="text-xs text-bloomberg-white/80">
          Search a ticker or load a past analysis to run quant analytics. Everything is computed in
          your browser from daily prices. Research only — not advice.
        </p>
      </div>

      <TickerGroup label="Try a ticker" symbols={QUICK_TICKERS} onPick={onPick} />
      {recent.length > 0 && <TickerGroup label="Recent tickers" symbols={recent} onPick={onPick} />}

      <dl className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(14rem,1fr))]">
        {groups.map((group) => (
          <div key={group.id} className="border-l-2 border-l-bloomberg-border pl-3">
            <dt className="text-[11px] tracking-wider text-bloomberg-white uppercase">
              {group.label}
            </dt>
            <dd className="mt-0.5 text-[11px] leading-relaxed text-bloomberg-white/80">
              {SECTIONS.filter((s) => s.group === group.id)
                .map((s) => s.label)
                .join(' · ')}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

QuantEmptyState.propTypes = {
  onPick: PropTypes.func.isRequired,
  recent: PropTypes.arrayOf(PropTypes.string).isRequired,
};
