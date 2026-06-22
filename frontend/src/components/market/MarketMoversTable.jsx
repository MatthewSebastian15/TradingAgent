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
  const toneClass = positive ? 'text-bloomberg-green' : 'text-bloomberg-red';

  return (
    <Card className="overflow-hidden rounded-lg border-bloomberg-border bg-black/35 font-mono text-bloomberg-white shadow-lg shadow-black/20">
      <CardHeader className="flex flex-row items-center justify-between border-b border-bloomberg-border bg-bloomberg-surface/40 p-2">
        <CardTitle className="rounded-md bg-bloomberg-orange px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-black">
          {title}
        </CardTitle>
        {loading ? (
          <Skeleton className="h-4 w-16 bg-bloomberg-surface" />
        ) : (
          <span
            className={`font-mono text-[10px] font-bold uppercase tracking-widest ${toneClass}`}
          >
            {`${items.length} shown`}
          </span>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <Table className="min-w-[390px]">
          <TableHeader>
            <TableRow className="border-bloomberg-border hover:bg-transparent">
              <TableHead className="h-7 px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-bloomberg-muted">
                Ticker
              </TableHead>
              <TableHead className="h-7 px-2 py-1 text-right font-mono text-[9px] uppercase tracking-widest text-bloomberg-muted">
                Last
              </TableHead>
              <TableHead className="h-7 px-2 py-1 text-right font-mono text-[9px] uppercase tracking-widest text-bloomberg-muted">
                Chg%
              </TableHead>
              <TableHead className="hidden h-7 px-2 py-1 text-right font-mono text-[9px] uppercase tracking-widest text-bloomberg-muted sm:table-cell">
                Volume
              </TableHead>
              <TableHead className="h-7 px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-bloomberg-muted">
                Trend
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              loadingRows(limit).map((row) => (
                <TableRow key={row} className="border-bloomberg-border hover:bg-transparent">
                  <TableCell className="px-2 py-1.5">
                    <Skeleton className="h-3 w-12 bg-bloomberg-surface" />
                  </TableCell>
                  <TableCell className="px-2 py-1.5 text-right">
                    <Skeleton className="ml-auto h-3 w-16 bg-bloomberg-surface" />
                  </TableCell>
                  <TableCell className="px-2 py-1.5 text-right">
                    <Skeleton className="ml-auto h-3 w-10 bg-bloomberg-surface" />
                  </TableCell>
                  <TableCell className="hidden px-2 py-1.5 sm:table-cell">
                    <Skeleton className="ml-auto h-3 w-14 bg-bloomberg-surface" />
                  </TableCell>
                  <TableCell className="px-2 py-1.5">
                    <Skeleton className="h-6 w-full bg-bloomberg-surface" />
                  </TableCell>
                </TableRow>
              ))}

            {!loading &&
              items.map((item) => (
                <TableRow
                  key={item.symbol}
                  className="border-bloomberg-border hover:bg-bloomberg-orange/5"
                >
                  <TableCell className="px-2 py-1 font-mono text-[11px] font-bold text-bloomberg-orange">
                    {item.symbol}
                  </TableCell>
                  <TableCell className="px-2 py-1 text-right font-mono text-[11px] text-bloomberg-white">
                    {formatMarketPrice(item.last, item.symbol)}
                  </TableCell>
                  <TableCell
                    className={`px-2 py-1 text-right font-mono text-[11px] font-bold ${toneClass}`}
                  >
                    {formatMarketPercent(item.change_percent)}
                  </TableCell>
                  <TableCell className="hidden px-2 py-1 text-right font-mono text-[11px] text-bloomberg-muted sm:table-cell">
                    {formatMarketVolume(item.volume)}
                  </TableCell>
                  <TableCell className="px-2 py-1">
                    <MiniTrendLine values={item.trend || []} positive={positive} />
                  </TableCell>
                </TableRow>
              ))}

            {!loading && items.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan="5"
                  className="px-2 py-3 font-mono text-[11px] text-bloomberg-muted"
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
