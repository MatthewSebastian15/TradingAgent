import React, { useState, useEffect } from 'react';
import StockForm from '../components/StockForm';
import ResultCard from '../components/ResultCard';
import AgentLog from '../components/AgentLog';
import Navbar from '../components/Navbar';

const HISTORY_KEY   = 'ta_analysis_history';
const HISTORY_LIMIT = 10;

function saveToHistory(result) {
  if (!result || result.error) return;
  try {
    const raw     = localStorage.getItem(HISTORY_KEY);
    const history = raw ? JSON.parse(raw) : [];
    // Remove duplicate for same ticker + date
    const filtered = history.filter(
      h => !(h.ticker === result.ticker && h.trade_date === result.trade_date)
    );
    const updated = [
      { ...result, saved_at: new Date().toISOString() },
      ...filtered,
    ].slice(0, HISTORY_LIMIT);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch (_) {}
}

function decisionColor(decision) {
  if (decision === 'Buy')  return 'var(--accent)';
  if (decision === 'Sell') return 'var(--red)';
  return 'var(--amber)';
}

function HistorySidebar({ currentTicker, onSelect }) {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      setHistory(raw ? JSON.parse(raw) : []);
    } catch (_) {
      setHistory([]);
    }
  }, [currentTicker]); // refresh when a new analysis completes

  if (history.length === 0) return null;

  return (
    <div style={{
      marginTop: 24,
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 20px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--text-muted)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}>
          Recent Analyses
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--text-muted)',
        }}>
          {history.length} / {HISTORY_LIMIT}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {history.map((item, i) => (
          <button
            key={i}
            onClick={() => onSelect(item)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 20px',
              background: 'none',
              border: 'none',
              borderBottom: i < history.length - 1 ? '1px solid var(--border-subtle)' : 'none',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'var(--transition)',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}>
                {item.ticker}
              </span>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--text-muted)',
              }}>
                {item.trade_date}
              </span>
            </div>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fontWeight: 700,
              color: decisionColor(item.decision),
              background: `${decisionColor(item.decision)}18`,
              border: `1px solid ${decisionColor(item.decision)}30`,
              padding: '3px 10px',
              borderRadius: 100,
              letterSpacing: '0.06em',
            }}>
              {item.decision?.toUpperCase()}
            </span>
          </button>
        ))}
      </div>
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
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      <Navbar />

      <div style={{
        maxWidth: 680,
        margin: '0 auto',
        padding: '48px 32px 80px',
      }}>
        <div style={{ marginBottom: 36 }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text-muted)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: 10,
          }}>
            Agent Analysis
          </div>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 28,
            fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: '-0.5px',
          }}>
            Stock Analysis
          </h2>
          <p style={{
            fontFamily: 'var(--font-display)',
            fontSize: 14,
            color: 'var(--text-secondary)',
            marginTop: 8,
            lineHeight: 1.6,
          }}>
            Four AI agents will research, debate, and return a final trade decision.
          </p>
        </div>

        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '28px',
          marginBottom: 24,
        }}>
          <StockForm
            onResult={handleResult}
            onLoading={setLoading}
            onStatus={setStatus}
            onAgentProgress={setAgentProgress}
          />
        </div>

        {loading && <AgentLog status={status} agentProgress={agentProgress} />}
        {result && !loading && <ResultCard result={result} />}

        <HistorySidebar
          currentTicker={result?.ticker}
          onSelect={item => {
            setResult(item);
            setLoading(false);
          }}
        />
      </div>
    </div>
  );
}
