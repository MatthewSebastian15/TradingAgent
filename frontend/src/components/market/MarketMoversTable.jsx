import React from 'react';
import PropTypes from 'prop-types';
import MiniTrendBars from './MiniTrendBars';
import {
  formatMarketPercent,
  formatMarketPrice,
  formatMarketVolume,
} from '../../utils/marketFormatters';

function loadingRows(limit) {
  return Array.from({ length: limit }, (_, index) => `loading-${index}`);
}

export default function MarketMoversTable({ title, items, loading, limit, emptyText, tone }) {
  const positive = tone === 'positive';

  return (
    <div className="border border-bloomberg-border bg-black font-mono">
      <div className="bg-bloomberg-orange px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-black">
        {title}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse">
          <thead>
            <tr className="border-b border-bloomberg-border text-left text-[10px] uppercase tracking-widest text-bloomberg-muted">
              <th className="px-3 py-2">TICKER</th>
              <th className="px-3 py-2 text-right">LAST</th>
              <th className="px-3 py-2 text-right">CHG%</th>
              <th className="px-3 py-2 text-right">VOLUME</th>
              <th className="px-3 py-2">TREND</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              loadingRows(limit).map((row) => (
                <tr key={row} className="border-b border-bloomberg-border">
                  <td colSpan="5" className="px-3 py-3 text-[11px] text-bloomberg-muted">
                    LOADING MARKET DATA...
                  </td>
                </tr>
              ))}

            {!loading &&
              items.map((item) => (
                <tr
                  key={item.symbol}
                  className="border-b border-bloomberg-border hover:bg-bloomberg-surface"
                >
                  <td className="px-3 py-2 text-xs font-bold text-bloomberg-orange">
                    {item.symbol}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-bloomberg-white">
                    {formatMarketPrice(item.last, item.symbol)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right text-xs font-bold ${
                      positive ? 'text-bloomberg-green' : 'text-bloomberg-red'
                    }`}
                  >
                    {formatMarketPercent(item.change_percent)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-bloomberg-muted">
                    {formatMarketVolume(item.volume)}
                  </td>
                  <td className="px-3 py-2">
                    <MiniTrendBars values={item.trend || []} positive={positive} />
                  </td>
                </tr>
              ))}

            {!loading && items.length === 0 && (
              <tr>
                <td colSpan="5" className="px-3 py-4 text-[11px] text-bloomberg-muted">
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

MarketMoversTable.propTypes = {
  title: PropTypes.string.isRequired,
  items: PropTypes.arrayOf(
    PropTypes.shape({
      symbol: PropTypes.string.isRequired,
      last: PropTypes.number.isRequired,
      change_percent: PropTypes.number.isRequired,
      volume: PropTypes.number,
      trend: PropTypes.arrayOf(PropTypes.number),
    })
  ),
  loading: PropTypes.bool.isRequired,
  limit: PropTypes.number.isRequired,
  emptyText: PropTypes.string.isRequired,
  tone: PropTypes.oneOf(['positive', 'negative']).isRequired,
};

MarketMoversTable.defaultProps = {
  items: [],
};
