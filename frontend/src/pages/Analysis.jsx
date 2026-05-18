import React, { useState, useEffect } from 'react';
import StockForm from '../components/StockForm';
import ResultCard from '../components/ResultCard';
import AgentLog from '../components/AgentLog';
import Navbar from '../components/Navbar';

const HISTORY_KEY      = 'ta_analysis_history';
const HISTORY_LIMIT    = 10;
// Entries older than this are pruned automatically on every read and write.
const HISTORY_TTL_DAYS = 30;

/** Return true when a saved entry has exceeded the TTL. */
function isExpired(entry) {
  if (!entry?.saved_at) return false;
  const ageMs = Date.now() - new Date(entry.saved_at).getTime();
  return ageMs > HISTORY_TTL_DAYS * 24 * 60 * 60 * 1000;
}

/** Read history from localStorage, dropping expired and malformed entries. */
function readHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(e => e && !isExpired(e)) : [];
  } catch {
    return [];
  }
}

/** Persist history, enforcing the item limit and TTL. */
function writeHistory(entries) {
  try {
    const clean = entries.filter(e => e && !isExpired(e)).slice(0, HISTORY_LIMIT);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(clean));
  } catch {
    // localStorage may be unavailable (private browsing, storage quota exceeded).
  }
}

function saveToHistory(result) {
  if (!result || result.error) return;
  const history = readHistory();
  // Deduplicate by ticker + trade_date so re-running the same query replaces the old entry.
  const deduped = history.filter(h => !(h.ticker === result.ticker && h.trade_date === result.trade_date));
  writeHistory([{ ...result, saved_at: new Date().toISOString() }, ...deduped]);
}

/** Return a currency-prefixed string appropriate for the ticker's exchange.
 *  Tickers ending in .JK trade in IDR; everything else defaults to USD ($).
 */
function formatPrice(price, ticker = '') {
  const value = typeof price === 'number' ? price.toLocaleString() : price;
  return ticker.toUpperCase().endsWith('.JK') ? `Rp ${value}` : `$${value}`;
}

function decisionStyle(d) {
  if (d === 'Buy' || d === 'Overweight')  return 'text-bloomberg-green border-bloomberg-green';
  if (d === 'Sell'|| d === 'Underweight') return 'text-bloomberg-red border-bloomberg-red';
  return 'text-bloomberg-amber border-bloomberg-amber';
}

function HistoryPanel({ currentTicker, onSelect }) {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      setHistory(raw ? JSON.parse(raw) : []);
    } catch { setHistory([]); }
  }, [currentTicker]);

  if (!history.length) return null;

  return (
    <div className="border border-bloomberg-border bg-bloomberg-card">
      <div className="px-4 py-2.5 border-b border-bloomberg-border flex items-center justify-between bg-black">
        <span className="font-mono text-xs text-bloomberg-muted tracking-wider uppercase">RECENT ANALYSES</span>
        <span className="font-mono text-xs text-bloomberg-muted">{history.length}/{HISTORY_LIMIT}</span>
      </div>
      <div>
        {history.map((item, i) => (
          <button
            key={i}
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

export default function Analysis() {
  const [result, setResult]               = useState(null);
  const [loading, setLoading]             = useState(false);
  const [status, setStatus]               = useState('');
  const [agentProgress, setAgentProgress] = useState(null);

  function handleResult(res) {
    setResult(res);
    saveToHistory(res);
  }

  return (
    <div className="min-h-screen bg-bloomberg-bg">
      <Navbar />

      <div className="flex" style={{ minHeight: 'calc(100vh - 68px)' }}>
        {/* ── Left sidebar: form ── */}
        <div className="w-80 flex-shrink-0 border-r border-bloomberg-border flex flex-col">
          <div className="flex-1">
            <div className="border-b border-bloomberg-border bg-bloomberg-card">
              <StockForm
                onResult={handleResult}
                onLoading={setLoading}
                onStatus={setStatus}
                onAgentProgress={setAgentProgress}
              />
            </div>

            {/* History */}
            <div className="p-4">
              <HistoryPanel
                currentTicker={result?.ticker}
                onSelect={item => { setResult(item); setLoading(false); }}
              />
            </div>
          </div>

          <StatusBar loading={loading} status={status} />
        </div>

        {/* ── Right main panel ── */}
        <div className="flex-1 overflow-y-auto">
          {!loading && !result && (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <div className="font-display text-6xl font-bold text-bloomberg-border tracking-widest mb-4">
                READY
              </div>
              <div className="font-mono text-sm text-bloomberg-muted tracking-wider max-w-xs">
                Configure parameters on the left and execute analysis to receive a structured trade decision.
              </div>
              <div className="mt-8 grid grid-cols-3 gap-4 w-full max-w-md">
                {['MARKET DATA', 'AI DEBATE', 'DECISION'].map((step, i) => (
                  <div key={step} className="border border-bloomberg-border p-3 text-center">
                    <div className="font-mono text-2xl text-bloomberg-border mb-2">{i + 1}</div>
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
