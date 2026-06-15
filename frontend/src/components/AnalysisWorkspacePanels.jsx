import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { clearAnalysisHistory, fetchAnalysisHistory } from '../utils/analysisHistoryApi';
import { formatDateTimeLabel, formatTradeDateLabel } from '../utils/formatting';
import {
  clearHistory,
  confidenceScoreStyle,
  decisionStyle,
  formatHistoryHorizon,
  historyResourceId,
  normalizeBackendHistory,
  readHistory,
  writeHistory,
} from '../hooks/useAnalysisHistoryStore';

export function ConfigIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M4 7h10" />
      <path d="M18 7h2" />
      <path d="M4 17h2" />
      <path d="M10 17h10" />
      <path d="M14 5v4" />
      <path d="M10 15v4" />
    </svg>
  );
}

export function ClockIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function PanelButton({ active, title, onClick, children }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={`h-10 w-10 rounded-none border-l-2 transition-colors duration-150 ${
        active
          ? 'border-bloomberg-orange bg-bloomberg-orange/10 text-bloomberg-orange shadow-[inset_0_0_18px_rgba(249,115,22,0.12)] hover:bg-bloomberg-orange/15 hover:text-bloomberg-orange'
          : 'border-transparent text-bloomberg-muted hover:bg-bloomberg-surface hover:text-bloomberg-white'
      }`}
    >
      {children}
    </Button>
  );
}

PanelButton.propTypes = {
  active: PropTypes.bool.isRequired,
  title: PropTypes.string.isRequired,
  onClick: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
};

export function DrawerPanel({ open, title, onClose, children }) {
  return (
    <aside
      aria-hidden={!open}
      className={`fixed bottom-0 left-10 top-[68px] z-[35] flex w-72 flex-col border-r border-bloomberg-border bg-card/95 shadow-2xl shadow-black/60 backdrop-blur transition-[opacity,transform] duration-200 ease-out will-change-transform ${
        open
          ? 'pointer-events-auto translate-x-0 opacity-100'
          : 'pointer-events-none -translate-x-full opacity-0'
      }`}
    >
      <div className="flex h-11 flex-shrink-0 items-center justify-between border-b border-bloomberg-border bg-bloomberg-surface/70 px-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-bloomberg-orange">
          {title}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Close ${title.toLowerCase()} panel`}
          onClick={onClose}
          className="h-7 w-7 rounded-md font-mono text-lg leading-none text-bloomberg-muted hover:bg-bloomberg-orange/10 hover:text-bloomberg-orange"
        >
          ×
        </Button>
      </div>
      <ScrollArea className="flex-1">{children}</ScrollArea>
    </aside>
  );
}

DrawerPanel.propTypes = {
  open: PropTypes.bool.isRequired,
  title: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
};

export function HistoryPanel({ backendHistoryEnabled, currentResourceId, historyKey, onSelect }) {
  const [history, setHistory] = useState([]);
  const [clearError, setClearError] = useState('');
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (!backendHistoryEnabled) {
      setHistory(readHistory(historyKey));
      return undefined;
    }

    const controller = new AbortController();

    async function loadHistory() {
      try {
        const items = normalizeBackendHistory(
          await fetchAnalysisHistory({ limit: 25, signal: controller.signal })
        );
        if (controller.signal.aborted) return;
        writeHistory(historyKey, items);
        setHistory(items);
      } catch (error) {
        if (error.name === 'AbortError') return;
        setHistory(readHistory(historyKey));
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
      clearHistory(historyKey);
      setHistory([]);
    } catch (error) {
      setClearError(error.message || 'Failed to clear analysis history.');
    } finally {
      setClearing(false);
    }
  }

  if (!history.length) return null;

  return (
    <div className="p-2">
      <Card className="overflow-hidden rounded-xl border-bloomberg-border bg-bloomberg-surface/80 shadow-lg shadow-black/30">
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-bloomberg-orange">
                RECENT
              </span>
              <Badge
                variant="outline"
                className="rounded-full border-bloomberg-border bg-black/60 px-2 py-0 font-mono text-[9px] text-bloomberg-muted"
              >
                {history.length}
              </Badge>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={clearing}
              onClick={handleClearHistory}
              className="h-7 rounded-md px-2 font-mono text-[9px] tracking-wider text-bloomberg-muted hover:bg-bloomberg-orange/10 hover:text-bloomberg-orange disabled:opacity-40"
            >
              {clearing ? 'CLEARING...' : 'CLEAR'}
            </Button>
          </div>
          <Separator className="bg-bloomberg-border" />
          {clearError && (
            <div className="border-b border-bloomberg-border bg-bloomberg-red/10 px-3 py-2 font-mono text-[9px] text-bloomberg-red">
              {clearError}
            </div>
          )}
          <div className="grid gap-2 p-2">
            {history.map((item, index) => {
              const createdAtLabel = formatDateTimeLabel(item.analysis_created_at || item.saved_at);
              const displaySignal = item.display_signal || item.decision;
              const confidenceScore =
                item.confidence_score !== null && item.confidence_score !== undefined
                  ? `${item.confidence_score}%`
                  : '—';
              return (
                <button
                  key={
                    historyResourceId(item) ||
                    `${item.ticker || 'item'}-${item.trade_date || index}`
                  }
                  onClick={() => onSelect(item)}
                  className="w-full rounded-lg border border-bloomberg-border bg-black/60 px-3 py-2.5 text-left shadow-sm shadow-black/20 transition-all duration-150 hover:border-bloomberg-orange/50 hover:bg-bloomberg-orange/5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[11px] font-semibold tracking-wide text-bloomberg-white">
                      {item.ticker || 'N/A'}
                    </span>
                    <Badge
                      variant="outline"
                      className={`flex-shrink-0 rounded-full px-2 py-0.5 font-mono text-[8px] font-semibold tracking-wider ${decisionStyle(displaySignal)}`}
                    >
                      {(displaySignal || 'N/A').toUpperCase()}
                    </Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-3 font-mono text-[9px] text-bloomberg-muted">
                    <span>{formatTradeDateLabel(item.trade_date) || 'N/A'}</span>
                    <span>{formatHistoryHorizon(item.time_horizon_months) || '—'}</span>
                    <span className={confidenceScoreStyle(item.confidence_tier)}>
                      {confidenceScore}
                    </span>
                  </div>
                  {createdAtLabel && (
                    <div className="mt-1 truncate font-mono text-[8px] text-bloomberg-subtle">
                      {createdAtLabel}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
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
    <div className="flex items-center gap-2 rounded-lg border border-bloomberg-border bg-card px-4 py-2 shadow-lg shadow-black/30">
      <span className="w-1.5 h-1.5 rounded-full bg-bloomberg-orange animate-pulse-dot flex-shrink-0" />
      <span className="font-mono text-xs text-bloomberg-orange tracking-wider truncate">
        {status || 'RUNNING...'}
      </span>
    </div>
  );
}

StatusBar.propTypes = {
  loading: PropTypes.bool.isRequired,
  status: PropTypes.string,
};
