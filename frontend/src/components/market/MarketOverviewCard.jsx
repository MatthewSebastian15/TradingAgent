import { X } from 'lucide-react';
import PropTypes from 'prop-types';
import React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

import MiniSparkline from './MiniSparkline';
import { labelForMarketSymbol } from '../../utils/marketDefaults';
import {
  formatMarketChange,
  formatMarketPercent,
  formatMarketPrice,
  marketChangeState,
} from '../../utils/marketFormatters';

function valueColorClass(state) {
  if (state === 'positive') return 'text-bloomberg-green';
  if (state === 'negative') return 'text-bloomberg-red';
  return 'text-bloomberg-muted';
}

export default function MarketOverviewCard({ item, canDelete, onDelete }) {
  const state = marketChangeState(item.change);
  const positive = state === 'positive' ? true : state === 'negative' ? false : null;
  const label = item.label || labelForMarketSymbol(item.symbol);
  const unavailable = item.status !== 'ok';

  return (
    <Card className="min-h-[134px] rounded-xl border-bloomberg-border bg-bloomberg-surface/70 font-mono shadow-sm shadow-black/20 transition-all hover:border-bloomberg-orange/40 hover:bg-bloomberg-surface">
      <CardContent className="p-3">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[11px] font-bold uppercase tracking-wider text-bloomberg-orange">
              {label}
            </div>
            <Badge
              variant="outline"
              className="mt-1 rounded-full border-bloomberg-border bg-black/60 px-2 py-0 font-mono text-[10px] text-bloomberg-muted"
            >
              {item.symbol}
            </Badge>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDelete}
            disabled={!canDelete}
            title={canDelete ? 'Delete instrument' : 'Minimum 3 instruments required'}
            className={`h-7 w-7 rounded-md ${
              canDelete
                ? 'text-bloomberg-muted hover:bg-bloomberg-red/10 hover:text-bloomberg-red'
                : 'cursor-not-allowed text-bloomberg-subtle'
            }`}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {unavailable ? (
          <div className="flex h-20 items-center rounded-lg border border-bloomberg-red/30 bg-bloomberg-red/10 px-3 text-[11px] text-bloomberg-red">
            {item.reason || 'Market data unavailable'}
          </div>
        ) : (
          <>
            <div className="text-xl font-bold tracking-tight text-bloomberg-white">
              {formatMarketPrice(item.last, item.symbol)}
            </div>
            <div className={`mt-1 text-xs font-bold ${valueColorClass(state)}`}>
              <span>{state === 'positive' ? '^' : state === 'negative' ? 'v' : '-'}</span>{' '}
              {formatMarketPercent(item.change_percent)}{' '}
              <span className="text-bloomberg-muted">.</span> {formatMarketChange(item.change)}
            </div>
            <div className="mt-3">
              <MiniSparkline values={item.sparkline || []} positive={positive} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

MarketOverviewCard.propTypes = {
  item: PropTypes.shape({
    symbol: PropTypes.string.isRequired,
    label: PropTypes.string,
    last: PropTypes.number,
    change: PropTypes.number,
    change_percent: PropTypes.number,
    sparkline: PropTypes.arrayOf(PropTypes.number),
    status: PropTypes.string,
    reason: PropTypes.string,
  }).isRequired,
  canDelete: PropTypes.bool.isRequired,
  onDelete: PropTypes.func.isRequired,
};
