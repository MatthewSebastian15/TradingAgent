import React, { useMemo, useState } from 'react';

import WatchlistEmptyState from './WatchlistEmptyState';
import WatchlistGroupBar from './WatchlistGroupBar';
import WatchlistGroupDialog from './WatchlistGroupDialog';
import WatchlistTable from './WatchlistTable';
import WatchlistTickerInput from './WatchlistTickerInput';
import { validateMarketSymbol } from '../../api/market';
import { useWatchlistQuotes } from '../../hooks/useWatchlistQuotes';
import { useWatchlistStore } from '../../hooks/useWatchlistStore';
import { normalizeWatchlistSymbol } from '../../utils/watchlistFormatters';

const SYMBOL_PATTERN = /^[A-Z0-9^][A-Z0-9^._=-]{0,24}$/;

function tickerPayload(item, fallbackSymbol) {
  const symbol = normalizeWatchlistSymbol(item?.symbol || fallbackSymbol);
  return {
    symbol,
    name: item?.name || item?.label || symbol,
    exchange: item?.exchange || '',
    market: item?.market || '',
    type: item?.type || item?.quoteType || 'SYMBOL',
    source: item?.source || 'manual_symbol',
  };
}

export default function WatchlistPage() {
  const {
    groups,
    activeGroup,
    activeGroupId,
    setActiveGroupId,
    createGroup,
    renameGroup,
    deleteGroup,
    addTicker,
    removeTicker,
    hasTicker,
  } = useWatchlistStore();
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [inputError, setInputError] = useState('');
  const [groupDialog, setGroupDialog] = useState({ open: false, mode: 'create', group: null });
  const [validating, setValidating] = useState(false);

  const activeSymbols = useMemo(
    () => (activeGroup?.items || []).map((item) => item.symbol),
    [activeGroup]
  );
  const { quotesBySymbol, trendsBySymbol, loadingQuotes, loadingTrends, error, refresh } =
    useWatchlistQuotes(activeSymbols);

  const existingNames = useMemo(() => groups.map((group) => group.name), [groups]);
  const duplicateSelectedTicker = selectedTicker && hasTicker(selectedTicker.symbol);
  const addDisabled = !activeGroup || validating || (!selectedTicker && !inputValue.trim());

  function openCreateDialog() {
    setGroupDialog({ open: true, mode: 'create', group: null });
  }

  function openRenameDialog(group) {
    setGroupDialog({ open: true, mode: 'rename', group });
  }

  function closeGroupDialog() {
    setGroupDialog({ open: false, mode: 'create', group: null });
  }

  function handleGroupSubmit(name) {
    try {
      if (groupDialog.mode === 'rename' && groupDialog.group) {
        renameGroup(groupDialog.group.id, name);
      } else {
        createGroup(name);
      }
      closeGroupDialog();
    } catch (err) {
      setInputError(err.message || 'Failed to save group.');
    }
  }

  function handleClearTicker() {
    setSelectedTicker(null);
    setInputError('');
  }

  function handleSelectTicker(item) {
    const payload = tickerPayload(item);
    setSelectedTicker(payload);
    setInputValue(payload.symbol);
    setInputError(hasTicker(payload.symbol) ? 'Ticker already exists in this group.' : '');
  }

  async function handleAddTicker() {
    if (!activeGroup) {
      setInputError('Create a group before adding tickers.');
      return;
    }

    const symbol = normalizeWatchlistSymbol(selectedTicker?.symbol || inputValue);
    if (!symbol || !SYMBOL_PATTERN.test(symbol)) {
      setInputError('Invalid ticker symbol.');
      return;
    }

    if (hasTicker(symbol)) {
      setInputError('Ticker already exists in this group.');
      return;
    }

    let payload = selectedTicker ? tickerPayload(selectedTicker, symbol) : null;

    if (!payload) {
      setValidating(true);
      try {
        const validation = await validateMarketSymbol(symbol);
        if (!validation?.valid) {
          setInputError('Invalid ticker symbol.');
          return;
        }

        payload = tickerPayload(
          {
            symbol: validation.symbol || symbol,
            name: validation.label || symbol,
            source: validation.source || 'manual_symbol',
          },
          symbol
        );
      } catch {
        setInputError('Invalid ticker symbol.');
        return;
      } finally {
        setValidating(false);
      }
    }

    const added = addTicker(payload);
    if (!added) {
      setInputError('Ticker already exists in this group.');
      return;
    }

    setSelectedTicker(null);
    setInputValue('');
    setInputError('');
    refresh();
  }

  function handleInputChange(nextValue) {
    setInputValue(nextValue);
    setInputError('');
  }

  return (
    <main className="px-4 py-3 font-mono text-bloomberg-white">
      <div className="space-y-3">
        <div className="flex min-h-10 items-center justify-between gap-3">
          <h1 className="text-sm font-bold uppercase tracking-[0.2em] text-bloomberg-orange">
            Watchlist
          </h1>
          {(loadingQuotes || loadingTrends) && (
            <div className="text-xs uppercase tracking-wider text-bloomberg-muted">Loading...</div>
          )}
        </div>

        {groups.length > 0 && (
          <WatchlistGroupBar
            groups={groups}
            activeGroupId={activeGroupId}
            onSelectGroup={(groupId) => {
              setActiveGroupId(groupId);
              setSelectedTicker(null);
              setInputValue('');
              setInputError('');
            }}
            onCreateGroup={openCreateDialog}
            onRenameGroup={openRenameDialog}
            onDeleteGroup={deleteGroup}
          />
        )}

        <WatchlistTickerInput
          value={inputValue}
          selectedTicker={selectedTicker}
          onChange={handleInputChange}
          onSelectTicker={handleSelectTicker}
          onClear={handleClearTicker}
          onAdd={handleAddTicker}
          addDisabled={addDisabled || Boolean(duplicateSelectedTicker)}
          error={inputError || error}
          loading={validating}
          disabled={!activeGroup}
        />

        {groups.length === 0 ? (
          <WatchlistEmptyState onCreateGroup={openCreateDialog} />
        ) : (
          <WatchlistTable
            items={activeGroup?.items || []}
            quotesBySymbol={quotesBySymbol}
            trendsBySymbol={trendsBySymbol}
            loading={loadingQuotes || loadingTrends}
            onDeleteTicker={removeTicker}
          />
        )}
      </div>

      <WatchlistGroupDialog
        open={groupDialog.open}
        mode={groupDialog.mode}
        initialName={groupDialog.group?.name || ''}
        existingNames={existingNames}
        onCancel={closeGroupDialog}
        onSubmit={handleGroupSubmit}
      />
    </main>
  );
}
