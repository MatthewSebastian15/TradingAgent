import { X } from 'lucide-react';
import PropTypes from 'prop-types';
import React, { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

import { validateMarketSymbol } from '../../api/market';
import {
  MARKET_CATEGORIES,
  MARKET_CATEGORY_LABELS,
  MARKET_MAX_SYMBOLS,
  MARKET_PRESETS,
  normalizeMarketSymbol,
} from '../../utils/marketDefaults';

export default function MarketOverviewPicker({
  activeCategory,
  existingSymbols,
  onAddSymbol,
  onClose,
}) {
  const [pickerCategory, setPickerCategory] = useState(activeCategory);
  const [search, setSearch] = useState('');
  const [customSymbol, setCustomSymbol] = useState('');
  const [message, setMessage] = useState('');
  const [validating, setValidating] = useState(false);

  const filteredPresets = useMemo(() => {
    const query = search.trim().toUpperCase();
    return (MARKET_PRESETS[pickerCategory] || []).filter((item) => {
      if (!query) return true;
      return item.label.toUpperCase().includes(query) || item.symbol.toUpperCase().includes(query);
    });
  }, [pickerCategory, search]);

  async function addSymbol(symbol) {
    const normalized = normalizeMarketSymbol(symbol);
    if (!normalized) {
      setMessage('Symbol required.');
      return;
    }
    if (existingSymbols.length >= MARKET_MAX_SYMBOLS) {
      setMessage('Maximum 6 instruments');
      return;
    }
    if (existingSymbols.includes(normalized)) {
      setMessage('Symbol already active.');
      return;
    }

    setValidating(true);
    setMessage('');
    try {
      const result = await validateMarketSymbol(normalized);
      if (!result.valid) {
        setMessage(result.reason || 'No yfinance data found');
        return;
      }
      const added = onAddSymbol(normalized);
      if (!added.ok) {
        setMessage(added.message);
        return;
      }
      setCustomSymbol('');
      onClose();
    } catch (error) {
      setMessage(error.message || 'No yfinance data found');
    } finally {
      setValidating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 px-4 pt-24 backdrop-blur-sm">
      <Card className="w-full max-w-2xl overflow-hidden rounded-xl border-bloomberg-border bg-card font-mono text-bloomberg-white shadow-2xl shadow-black">
        <CardHeader className="flex flex-row items-center justify-between border-b border-bloomberg-border bg-bloomberg-surface/70 px-3 py-2">
          <CardTitle className="text-xs font-bold uppercase tracking-widest text-bloomberg-orange">
            Add Market
          </CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 rounded-md text-bloomberg-muted hover:bg-bloomberg-orange/10 hover:text-bloomberg-orange"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="grid gap-3 p-3">
          <div className="grid gap-2 md:grid-cols-[1fr_12rem]">
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="SEARCH PRESET"
              className="h-10 rounded-md border-bloomberg-border bg-black/60 font-mono text-xs text-bloomberg-white placeholder:text-bloomberg-muted focus-visible:ring-bloomberg-orange"
            />
            <select
              value={pickerCategory}
              onChange={(event) => setPickerCategory(event.target.value)}
              className="h-10 rounded-md border border-bloomberg-border bg-black/60 px-3 py-2 text-xs text-bloomberg-white outline-none focus:border-bloomberg-orange focus:ring-2 focus:ring-bloomberg-orange/30"
            >
              {MARKET_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {MARKET_CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </div>

          <div className="max-h-72 overflow-y-auto rounded-lg border border-bloomberg-border bg-black/40">
            {filteredPresets.map((item) => {
              const disabled = existingSymbols.includes(item.symbol) || validating;
              return (
                <button
                  key={item.symbol}
                  type="button"
                  disabled={disabled}
                  onClick={() => addSymbol(item.symbol)}
                  className={`grid w-full grid-cols-[1fr_8rem_4rem] items-center gap-3 border-b border-bloomberg-border px-3 py-2 text-left text-xs last:border-b-0 ${
                    disabled
                      ? 'cursor-not-allowed text-bloomberg-subtle'
                      : 'text-bloomberg-white hover:bg-bloomberg-orange/5'
                  }`}
                >
                  <span className="truncate font-bold text-bloomberg-orange">{item.label}</span>
                  <span className="truncate text-bloomberg-muted">{item.symbol}</span>
                  <Badge
                    variant="outline"
                    className="justify-center rounded-full border-bloomberg-border bg-black/60 px-2 py-0 font-mono text-[9px] text-bloomberg-amber"
                  >
                    ADD
                  </Badge>
                </button>
              );
            })}
          </div>

          <div className="grid gap-2 md:grid-cols-[1fr_8rem]">
            <Input
              type="text"
              value={customSymbol}
              onChange={(event) => setCustomSymbol(event.target.value.toUpperCase())}
              placeholder="CUSTOM SYMBOL"
              className="h-10 rounded-md border-bloomberg-border bg-black/60 font-mono text-xs text-bloomberg-white placeholder:text-bloomberg-muted focus-visible:ring-bloomberg-orange"
            />
            <Button
              type="button"
              disabled={validating}
              onClick={() => addSymbol(customSymbol)}
              className="h-10 rounded-md bg-bloomberg-orange px-3 font-mono text-xs font-bold text-black hover:bg-bloomberg-orange/90 disabled:cursor-wait disabled:opacity-60"
            >
              {validating ? 'CHECK' : 'ADD'}
            </Button>
          </div>

          {message && (
            <div className="rounded-lg border border-bloomberg-red/40 bg-bloomberg-red/10 px-3 py-2 text-[11px] text-bloomberg-red">
              {message}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

MarketOverviewPicker.propTypes = {
  activeCategory: PropTypes.string.isRequired,
  existingSymbols: PropTypes.arrayOf(PropTypes.string).isRequired,
  onAddSymbol: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};
