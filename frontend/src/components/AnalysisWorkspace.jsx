import React, { useEffect, useState } from 'react';
import AgentLog from './AgentLog';
import Navbar from './Navbar';
import ResultCard from './ResultCard';
import { formatPrice } from '../utils/formatting';

const HISTORY_LIMIT = 10;
const HISTORY_TTL_DAYS = 30;

function isExpired(entry) {
  if (!entry?.saved_at) return false;
  const ageMs = Date.now() - new Date(entry.saved_at).getTime();
  return ageMs > HISTORY_TTL_DAYS * 24 * 60 * 60 * 1000;
}

function readHistory(historyKey) {
  try {
    const raw = localStorage.getItem(historyKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(entry => entry && !isExpired(entry)) : [];
  } catch {
    return [];
  }
}

function writeHistory(historyKey, entries) {
  try {
    const clean = entries.filter(entry => entry && !isExpired(entry)).slice(0, HISTORY_LIMIT);
    localStorage.setItem(historyKey, JSON.stringify(clean));
  } catch {
    // Storage can be unavailable in private browsing or when quota is exceeded.
  }
}

function saveToHistory(historyKey, result) {
  if (!result || result.error) return;

  const history = readHistory(historyKey);
  const deduped = history.filter(
    item => !(item.ticker === result.ticker && item.trade_date === result.trade_date)
  );
  writeHistory(historyKey, [{ ...result, saved_at: new Date().toISOString() }, ...deduped]);
}

function decisionStyle(decision) {
  if (decision === 'Buy' || decision === 'Overweight') return 'text-bloomberg-green border-bloomberg-green';
  if (decision === 'Sell' || decision === 'Underweight') return 'text-bloomberg-red border-bloomberg-red';
  return 'text-bloomberg-amber border-bloomberg-amber';
}

function HistoryPanel({ currentTicker, historyKey, onSelect }) {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    setHistory(readHistory(historyKey));
  }, [historyKey, currentTicker]);

  if (!history.length) return null;

  return (
    <div className="border border-bloomberg-border bg-bloomberg-card">
      <div className="px-4 py-2.5 border-b border-bloomberg-border flex items-center justify-between bg-black">
        <span className="font-mono text-xs text-bloomberg-muted tracking-wider uppercase">RECENT ANALYSES</span>
        <span className="font-mono text-xs text-bloomberg-muted">{history.length}/{HISTORY_LIMIT}</span>
      </div>
      <div>
        {history.map((item, index) => (
          <button
            key={`${item.ticker || 'item'}-${item.trade_date || index}`}
            onClick={() => onSelect(item)}
            className="w-full flex items-center justify-between px-4 py-3 border-b border-bloomberg-border last:border-b-0 hover:bg-bloomberg-surface transition-colors duration-150 text-left"
          >
            <div>
              <div className="font-mono text-sm font-semibold text-bloomberg-white">{item.ticker}</div>
              <div className="font-mono text-xs text-bloomberg-muted">{item.trade_date}</div>
            </div>
            <div className="flex items-center gap-3">
              {item.price_target && (
                <span className="font-mono text-xs text-bloomberg-muted">
                  {formatPrice(item.price_target, item.ticker)}
                </span>
              )}
              <span className={`font-mono text-xs border px-2.5 py-1 tracking-wider font-semibold ${decisionStyle(item.decision)}`}>
                {(item.decision || 'N/A').toUpperCase()}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function StatusBar({ loading, status }) {
  if (!loading) return null;
  return (
    <div className="border-t border-bloomberg-border px-4 py-2 bg-black flex items-center gap-2">
      <span className="w-1.5 h-1.5 rounded-full bg-bloomberg-orange animate-pulse-dot flex-shrink-0" />
      <span className="font-mono text-xs text-bloomberg-orange tracking-wider truncate">{status || 'RUNNING...'}</span>
    </div>
  );
}

export default function AnalysisWorkspace({ FormComponent, historyKey, emptyDescription }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [agentProgress, setAgentProgress] = useState(null);

  function handleResult(nextResult) {
    setResult(nextResult);
    saveToHistory(historyKey, nextResult);
  }

  return (
    <div className="min-h-screen bg-bloomberg-bg">
      <Navbar />

      <div className="flex" style={{ minHeight: 'calc(100vh - 68px)' }}>
        <div className="w-80 flex-shrink-0 border-r border-bloomberg-border flex flex-col">
          <div className="flex-1">
            <div className="border-b border-bloomberg-border bg-bloomberg-card">
              <FormComponent
                onResult={handleResult}
                onLoading={setLoading}
                onStatus={setStatus}
                onAgentProgress={setAgentProgress}
              />
            </div>

            <div className="p-4">
              <HistoryPanel
                currentTicker={result?.ticker}
                historyKey={historyKey}
                onSelect={item => { setResult(item); setLoading(false); }}
              />
            </div>
          </div>

          <StatusBar loading={loading} status={status} />
        </div>

        <div className="flex-1 overflow-y-auto">
          {!loading && !result && (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <div className="font-display text-6xl font-bold text-bloomberg-border tracking-widest mb-4">
                READY
              </div>
              <div className="font-mono text-sm text-bloomberg-muted tracking-wider max-w-xs">
                {emptyDescription}
              </div>
              <div className="mt-8 grid grid-cols-3 gap-4 w-full max-w-md">
                {['MARKET DATA', 'AI DEBATE', 'DECISION'].map((step, index) => (
                  <div key={step} className="border border-bloomberg-border p-3 text-center">
                    <div className="font-mono text-2xl text-bloomberg-border mb-2">{index + 1}</div>
                    <div className="font-mono text-xs text-bloomberg-muted tracking-wider">{step}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loading && (
            <div className="p-6">
              <AgentLog status={status} agentProgress={agentProgress} />
            </div>
          )}

          {result && !loading && (
            <div className="p-6">
              <ResultCard result={result} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
