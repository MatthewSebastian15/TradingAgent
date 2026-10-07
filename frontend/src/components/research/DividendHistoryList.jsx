import PropTypes from 'prop-types';
import { useCallback } from 'react';

import { DataRow, SkeletonRow } from './primitives';
import { getDividendHistory } from '../../api/market';
import { useResearchData } from '../../hooks/useResearchData';

// Recent dividend payments, newest first. Non-blocking: renders nothing without a ticker
// or when the request fails.
export default function DividendHistoryList({ ticker }) {
  const load = useCallback(
    ({ signal }) => (ticker ? getDividendHistory(ticker, { signal }) : Promise.resolve(null)),
    [ticker]
  );
  const { data, loading } = useResearchData(load);

  if (!ticker) return null;
  if (loading) return <SkeletonRow />;
  if (!data) return null;

  const payments = [...(data.payments || [])].reverse();
  if (payments.length === 0) {
    return (
      <div className="px-3 py-2 font-mono text-[10px] text-bloomberg-muted">
        NO DIVIDEND HISTORY ON RECORD
      </div>
    );
  }

  return (
    <div data-testid="dividend-history" className="border-t border-bloomberg-border">
      <div className="px-3 pt-2 font-mono text-[9px] text-bloomberg-muted">PAYMENT HISTORY</div>
      <div className="max-h-36 overflow-y-auto">
        {payments.map((payment) => (
          <div key={payment.date} data-testid="dividend-history-row">
            <DataRow label={payment.date} value={String(payment.amount)} />
          </div>
        ))}
      </div>
    </div>
  );
}

DividendHistoryList.propTypes = { ticker: PropTypes.string };
