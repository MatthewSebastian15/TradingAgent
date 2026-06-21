import { X } from 'lucide-react';
import PropTypes from 'prop-types';
import React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

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

export default function MarketOverviewCard({ item, canDelete, onDelete, loading }) {
  const state = marketChangeState(item.change);
  const positive = state === 'positive' ? true : state === 'negative' ? false : null;
  const label = item.label || labelForMarketSymbol(item.symbol);
  const unavailable = item.status !== 'ok';

  return (
    <Card className="min-h-[112px] rounded-lg border-bloomberg-border bg-bloomberg-surface/70 font-mono shadow-sm shadow-black/20 transition-all hover:-translate-y-0.5 hover:border-bloomberg-orange/40 hover:bg-bloomberg-surface">
      <CardContent className="p-2.5">
        <div className="mb-1.5 flex items-start justify-between gap-2">
          <div className="min-w-0">
            {loading ? (
              <>
                <Skeleton className="h-3 w-24 bg-bloomberg-surface" />
                <Skeleton className="mt-1.5 h-4 w-16 rounded-full bg-bloomberg-surface" />
              </>
            ) : (
              <>
                <div className="truncate text-[10px] font-bold uppercase tracking-wider text-bloomberg-orange">
                  {label}
                </div>
                <Badge
                  variant="outline"
                  className="mt-0.5 rounded-full border-bloomberg-border bg-black/60 px-1.5 py-0 font-mono text-[9px] text-bloomberg-muted"
                >
                  {item.symbol}
                </Badge>
              </>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDelete}
            disabled={!canDelete}
            title={canDelete ? 'Delete instrument' : 'Minimum 3 instruments required'}
            className={`h-6 w-6 rounded-md [&_svg]:size-3.5 ${
              canDelete
                ? 'text-bloomberg-muted hover:bg-bloomberg-red/10 hover:text-bloomberg-red'
                : 'cursor-not-allowed text-bloomberg-subtle'
            }`}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-28 bg-bloomberg-surface" />
            <Skeleton className="h-3 w-20 bg-bloomberg-surface" />
            <Skeleton className="mt-2 h-8 w-full bg-bloomberg-surface" />
          </div>
        ) : unavailable ? (
          <div className="flex h-16 items-center rounded-md border border-bloomberg-red/30 bg-bloomberg-red/10 px-3 text-[11px] text-bloomberg-red">
            {item.reason || 'Market data unavailable'}
          </div>
        ) : (
          <>
            <div className="text-lg font-bold leading-none tracking-tight text-bloomberg-white">
              {formatMarketPrice(item.last, item.symbol)}
            </div>
            <div className={`mt-1 text-[11px] font-bold ${valueColorClass(state)}`}>
              <span>{state === 'positive' ? '^' : state === 'negative' ? 'v' : '-'}</span>{' '}
              {formatMarketPercent(item.change_percent)}{' '}
              <span className="text-bloomberg-muted">.</span> {formatMarketChange(item.change)}
            </div>
            <div className="mt-2">
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
  loading: PropTypes.bool,
};
