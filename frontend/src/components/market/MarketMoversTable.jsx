import PropTypes from 'prop-types';
import React from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import MiniTrendLine from './MiniTrendLine';
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
    <Card className="overflow-hidden rounded-xl border-bloomberg-border bg-black/40 font-mono text-bloomberg-white shadow-lg shadow-black/20">
      <CardHeader className="border-b border-bloomberg-border bg-bloomberg-surface/50 p-3">
        <CardTitle className="w-fit rounded-md bg-bloomberg-orange px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-widest text-black">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table className="min-w-[460px]">
          <TableHeader>
            <TableRow className="border-bloomberg-border hover:bg-transparent">
              <TableHead className="h-8 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-bloomberg-muted">
                TICKER
              </TableHead>
              <TableHead className="h-8 px-3 py-1.5 text-right font-mono text-[10px] uppercase tracking-widest text-bloomberg-muted">
                LAST
              </TableHead>
              <TableHead className="h-8 px-3 py-1.5 text-right font-mono text-[10px] uppercase tracking-widest text-bloomberg-muted">
                CHG%
              </TableHead>
              <TableHead className="h-8 px-3 py-1.5 text-right font-mono text-[10px] uppercase tracking-widest text-bloomberg-muted">
                VOLUME
              </TableHead>
              <TableHead className="h-8 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-bloomberg-muted">
                TREND
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              loadingRows(limit).map((row) => (
                <TableRow key={row} className="border-bloomberg-border hover:bg-transparent">
                  <TableCell colSpan="5" className="px-3 py-1.5">
                    <Skeleton className="h-4 w-48 rounded-full bg-bloomberg-surface" />
                    <span className="sr-only">LOADING MARKET DATA...</span>
                  </TableCell>
                </TableRow>
              ))}

            {!loading &&
              items.map((item) => (
                <TableRow
                  key={item.symbol}
                  className="border-bloomberg-border hover:bg-bloomberg-orange/5"
                >
                  <TableCell className="px-3 py-1.5 font-mono text-[11px] font-bold text-bloomberg-orange">
                    {item.symbol}
                  </TableCell>
                  <TableCell className="px-3 py-1.5 text-right font-mono text-[11px] text-bloomberg-white">
                    {formatMarketPrice(item.last, item.symbol)}
                  </TableCell>
                  <TableCell
                    className={`px-3 py-1.5 text-right font-mono text-[11px] font-bold ${
                      positive ? 'text-bloomberg-green' : 'text-bloomberg-red'
                    }`}
                  >
                    {formatMarketPercent(item.change_percent)}
                  </TableCell>
                  <TableCell className="px-3 py-1.5 text-right font-mono text-[11px] text-bloomberg-muted">
                    {formatMarketVolume(item.volume)}
                  </TableCell>
                  <TableCell className="px-3 py-1.5">
                    <MiniTrendLine values={item.trend || []} positive={positive} />
                  </TableCell>
                </TableRow>
              ))}

            {!loading && items.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan="5"
                  className="px-3 py-4 font-mono text-[11px] text-bloomberg-muted"
                >
                  {emptyText}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
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
