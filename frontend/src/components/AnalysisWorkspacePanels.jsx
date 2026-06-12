import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { clearAnalysisHistory, fetchAnalysisHistory } from '../utils/analysisHistoryApi';
import { formatDateTimeLabel } from '../utils/formatting';
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
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-10 w-10 items-center justify-center border-l-2 transition-colors duration-150 ${
        active
          ? 'border-bloomberg-orange bg-bloomberg-surface text-bloomberg-orange'
          : 'border-transparent text-bloomberg-muted hover:bg-bloomberg-surface hover:text-bloomberg-white'
      }`}
    >
      {children}
    </button>
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
      className={`fixed bottom-0 left-10 top-[68px] z-[35] flex w-72 flex-col border-r border-bloomberg-border bg-bloomberg-card shadow-2xl shadow-black/50 transition-[opacity,transform] duration-200 ease-out will-change-transform ${
        open
          ? 'pointer-events-auto translate-x-0 opacity-100'
          : 'pointer-events-none -translate-x-full opacity-0'
      }`}
    >
      <div className="flex h-10 flex-shrink-0 items-center justify-between border-b border-bloomberg-border px-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-bloomberg-orange">
          {title}
        </span>
        <button
          type="button"
          aria-label={`Close ${title.toLowerCase()} panel`}
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center font-mono text-lg leading-none text-bloomberg-muted transition-colors duration-150 hover:bg-bloomberg-surface hover:text-bloomberg-orange"
        >
          ×
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
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
    <>
      <div className="flex items-center justify-between border-b border-bloomberg-border px-3 py-2">
        <span className="font-mono text-[10px] text-bloomberg-orange tracking-[0.2em] uppercase">
          RECENT
        </span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] text-bloomberg-muted">{history.length}</span>
          <button
            type="button"
            disabled={clearing}
            onClick={handleClearHistory}
            className="font-mono text-[9px] text-bloomberg-muted tracking-wider transition-colors duration-150 hover:text-bloomberg-orange disabled:opacity-40"
          >
            {clearing ? 'CLEARING...' : 'CLEAR'}
          </button>
        </div>
      </div>
      {clearError && (
        <div className="border-b border-bloomberg-border px-3 py-1.5 font-mono text-[9px] text-bloomberg-red">
          {clearError}
        </div>
      )}
      <div className="overflow-y-auto">
        {history.map((item, index) => {
          const createdAtLabel = formatDateTimeLabel(item.analysis_created_at || item.saved_at);
          const displaySignal = item.display_signal || item.decision;
          const confidenceScore =
            item.confidence_score !== null && item.confidence_score !== undefined
              ? `${item.confidence_score}%`
              : '—';
          return (
            <button
              key={historyResourceId(item) || `${item.ticker || 'item'}-${item.trade_date || index}`}
              onClick={() => onSelect(item)}
              className="w-full border-b border-bloomberg-border px-3 py-2 text-left transition-colors duration-150 hover:bg-bloomberg-surface"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[11px] font-semibold text-bloomberg-white">
                  {item.ticker || 'N/A'}
                </span>
                <span
                  className={`flex-shrink-0 border px-1.5 py-0.5 font-mono text-[8px] font-semibold tracking-wider ${decisionStyle(displaySignal)}`}
                >
                  {(displaySignal || 'N/A').toUpperCase()}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-3 font-mono text-[9px] text-bloomberg-muted">
                <span>{item.trade_date || '—'}</span>
                <span>{formatHistoryHorizon(item.time_horizon_months) || '—'}</span>
                <span className={confidenceScoreStyle(item.confidence_tier)}>{confidenceScore}</span>
              </div>
              {createdAtLabel && (
                <div className="mt-0.5 font-mono text-[8px] text-bloomberg-border truncate">
                  {createdAtLabel}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </>
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
    <div className="border-t border-bloomberg-border px-4 py-2 bg-black flex items-center gap-2">
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
