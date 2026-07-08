import { Trash2 } from 'lucide-react';
import PropTypes from 'prop-types';
import React, { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

import {
  clearHistory,
  confidenceScoreStyle,
  decisionStyle,
  formatHistoryHorizon,
  historyResourceId,
  normalizeBackendHistory,
  readHistory,
  removeHistoryItem,
  writeHistory,
} from '../hooks/useAnalysisHistoryStore';
import {
  clearAnalysisHistory,
  deleteAnalysisHistoryResult,
  fetchAnalysisHistory,
} from '../utils/analysisHistoryApi';
import { formatDateTimeLabel, formatTradeDateLabel } from '../utils/formatting';

export function HistoryPanel({ backendHistoryEnabled, currentResourceId, historyKey, onSelect }) {
  const [history, setHistory] = useState([]);
  const [clearError, setClearError] = useState('');
  const [clearing, setClearing] = useState(false);
  const [deletingIds, setDeletingIds] = useState([]);

  useEffect(() => {
    if (!backendHistoryEnabled) {
      let alive = true;
      readHistory(historyKey).then((items) => alive && setHistory(items));
      return () => {
        alive = false;
      };
    }

    const controller = new AbortController();

    async function loadHistory() {
      try {
        const items = normalizeBackendHistory(
          await fetchAnalysisHistory({ limit: 25, signal: controller.signal })
        );
        if (controller.signal.aborted) return;
        await writeHistory(historyKey, items);
        setHistory(items);
      } catch (error) {
        if (error.name === 'AbortError') return;
        setHistory(await readHistory(historyKey));
      }
    }

    loadHistory();
    return () => controller.abort();
  }, [backendHistoryEnabled, historyKey, currentResourceId]);

  async function handleClearHistory() {
    if (clearing) return;
    setClearError('');
    setClearing(true);
    try {
      if (backendHistoryEnabled) await clearAnalysisHistory();
      await clearHistory(historyKey);
      setHistory([]);
    } catch (error) {
      setClearError(error.message || 'Failed to clear history.');
    } finally {
      setClearing(false);
    }
  }

  async function handleDeleteItem(item) {
    const resourceId = historyResourceId(item);
    if (deletingIds.includes(resourceId)) return;
    setDeletingIds((prev) => [...prev, resourceId]);
    try {
      if (backendHistoryEnabled && resourceId) {
        await deleteAnalysisHistoryResult(resourceId);
      }
      await removeHistoryItem(historyKey, item);
      setHistory((prev) => prev.filter((h) => historyResourceId(h) !== resourceId));
    } catch {
      // Silent fail — item stays in list
    } finally {
      setDeletingIds((prev) => prev.filter((id) => id !== resourceId));
    }
  }

  if (!history.length) return null;

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-0">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-bloomberg-border bg-bloomberg-surface px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-bloomberg-orange">
              RECENT ANALYSES
            </span>
            <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-sm border border-bloomberg-border bg-black px-1 font-mono text-[8px] text-bloomberg-muted">
              {history.length}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={clearing}
            onClick={handleClearHistory}
            className="h-6 gap-1 rounded px-2 font-mono text-[8px] tracking-wider text-bloomberg-muted hover:bg-bloomberg-red/10 hover:text-bloomberg-red disabled:opacity-40"
          >
            {clearing ? 'CLEARING...' : 'CLEAR ALL'}
          </Button>
        </div>

        {clearError && (
          <div className="border-b border-bloomberg-border bg-bloomberg-red/10 px-3 py-2 font-mono text-[9px] text-bloomberg-red">
            {clearError}
          </div>
        )}

        {/* Items */}
        <div className="flex flex-col divide-y divide-bloomberg-border">
          {history.map((item, index) => {
            const resourceId = historyResourceId(item);
            const key = resourceId || `${item.ticker || 'item'}-${item.trade_date || index}`;
            const createdAtLabel = formatDateTimeLabel(item.analysis_created_at || item.saved_at);
            const displaySignal = item.display_signal || item.decision;
            const confidenceScore =
              item.confidence_score !== null && item.confidence_score !== undefined
                ? `${item.confidence_score}%`
                : null;
            const isDeleting = deletingIds.includes(resourceId);

            return (
              <div
                key={key}
                className="group flex items-stretch border-0 bg-black/40 transition-colors duration-100 hover:bg-bloomberg-orange/5"
              >
                {/* Main clickable area */}
                <button
                  type="button"
                  onClick={() => onSelect(item)}
                  className="min-w-0 flex-1 px-3 py-3 text-left"
                >
                  {/* Ticker + Signal row */}
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold tracking-widest text-bloomberg-white">
                      {item.ticker || 'N/A'}
                    </span>
                    <Badge
                      variant="outline"
                      className={`flex-shrink-0 rounded border px-1.5 py-0 font-mono text-[8px] font-bold tracking-widest ${decisionStyle(displaySignal)}`}
                    >
                      {(displaySignal || 'N/A').toUpperCase()}
                    </Badge>
                  </div>

                  {/* Meta row */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[9px] text-bloomberg-muted">
                    <span>{formatTradeDateLabel(item.trade_date) || 'N/A'}</span>
                    {formatHistoryHorizon(item.time_horizon_months) && (
                      <>
                        <span className="text-bloomberg-border">·</span>
                        <span>{formatHistoryHorizon(item.time_horizon_months)}</span>
                      </>
                    )}
                    {confidenceScore && (
                      <>
                        <span className="text-bloomberg-border">·</span>
                        <span className={confidenceScoreStyle(item.confidence_tier)}>
                          {confidenceScore}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Timestamp */}
                  {createdAtLabel && (
                    <div className="mt-1 truncate font-mono text-[8px] text-bloomberg-border">
                      {createdAtLabel}
                    </div>
                  )}
                </button>

                {/* Delete button */}
                <div className="flex flex-shrink-0 items-center border-l border-bloomberg-border/50">
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteItem(item);
                    }}
                    title="Delete this analysis"
                    aria-label={`Delete analysis for ${item.ticker || 'unknown ticker'}`}
                    className="flex h-full w-9 items-center justify-center text-bloomberg-border transition-colors hover:bg-bloomberg-red/10 hover:text-bloomberg-red disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {isDeleting ? (
                      <span className="font-mono text-[8px]">···</span>
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
}

HistoryPanel.propTypes = {
  backendHistoryEnabled: PropTypes.bool.isRequired,
  currentResourceId: PropTypes.string,
  historyKey: PropTypes.string.isRequired,
  onSelect: PropTypes.func.isRequired,
};

export function StatusBar({ loading, status }) {
  if (!loading) return null;
  return (
    <div className="flex items-center gap-2 rounded-md border border-bloomberg-border bg-card px-3 py-1.5 shadow-lg shadow-black/30">
      <span className="w-1.5 h-1.5 rounded-full bg-bloomberg-orange animate-pulse-dot flex-shrink-0" />
      <span className="truncate font-mono text-[11px] tracking-wider text-bloomberg-orange">
        {status || 'RUNNING...'}
      </span>
    </div>
  );
}

StatusBar.propTypes = {
  loading: PropTypes.bool.isRequired,
  status: PropTypes.string,
};
