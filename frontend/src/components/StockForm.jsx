import React, { useState } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const popularTickers = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'AMZN', 'META', 'GOOGL'];

const providerInfo = {
  google: { label: 'Google Gemini', icon: '◆', color: '#60a5fa' },
  openai: { label: 'OpenAI GPT', icon: '⬡', color: '#34d399' },
  anthropic: { label: 'Anthropic Claude', icon: '◈', color: '#c084fc' },
};

export default function StockForm({ onResult, onLoading, onStatus }) {
  const [ticker, setTicker] = useState('NVDA');
  const [date, setDate] = useState('2024-05-10');
  const [provider, setProvider] = useState('google');
  const [focused, setFocused] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    onLoading(true);
    onStatus('Initializing agents...');
    onResult(null);

    try {
      onStatus('Running analysis. This may take 2–3 minutes...');
      const res = await axios.post(`${API_URL}/api/analyze`, {
        ticker,
        trade_date: date,
        llm_provider: provider,
        max_debate_rounds: 1,
      });
      onResult(res.data);
    } catch (err) {
      onResult({ error: err.message });
    } finally {
      onLoading(false);
      onStatus('');
    }
  }

  const inputBase = (name) => ({
    background: 'var(--bg-input)',
    border: `1px solid ${focused === name ? 'var(--accent)' : 'var(--border)'}`,
    borderRadius: 'var(--radius-md)',
    padding: '12px 16px',
    color: 'var(--text-primary)',
    fontSize: 14,
    width: '100%',
    fontFamily: 'var(--font-mono)',
    fontWeight: 400,
    outline: 'none',
    transition: 'var(--transition)',
    boxShadow: focused === name ? '0 0 0 3px var(--accent-dim)' : 'none',
    WebkitAppearance: 'none',
    appearance: 'none',
  });

  const labelStyle = {
    display: 'block',
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
    marginBottom: 8,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    fontWeight: 500,
  };

  const fieldStyle = {
    display: 'flex',
    flexDirection: 'column',
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Ticker */}
      <div style={fieldStyle}>
        <label style={labelStyle}>Ticker Symbol</label>
        <input
          style={inputBase('ticker')}
          value={ticker}
          onChange={e => setTicker(e.target.value.toUpperCase())}
          onFocus={() => setFocused('ticker')}
          onBlur={() => setFocused(null)}
          placeholder="e.g. NVDA"
          required
          maxLength={8}
        />
        {/* Quick picks */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {popularTickers.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTicker(t)}
              style={{
                background: ticker === t ? 'var(--accent-dim)' : 'var(--bg-card)',
                border: `1px solid ${ticker === t ? 'rgba(0,229,160,0.35)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)',
                padding: '4px 10px',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color: ticker === t ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'var(--transition)',
                fontWeight: 500,
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Date */}
      <div style={fieldStyle}>
        <label style={labelStyle}>Trade Date</label>
        <input
          style={{
            ...inputBase('date'),
            colorScheme: 'dark',
          }}
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          onFocus={() => setFocused('date')}
          onBlur={() => setFocused(null)}
          required
        />
      </div>

      {/* LLM Provider */}
      <div style={fieldStyle}>
        <label style={labelStyle}>LLM Provider</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Object.entries(providerInfo).map(([key, info]) => (
            <button
              key={key}
              type="button"
              onClick={() => setProvider(key)}
              style={{
                background: provider === key ? `${info.color}14` : 'var(--bg-card)',
                border: `1px solid ${provider === key ? `${info.color}50` : 'var(--border)'}`,
                borderRadius: 'var(--radius-md)',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                transition: 'var(--transition)',
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 16, color: info.color }}>{info.icon}</span>
                <span style={{
                  fontSize: 13,
                  fontFamily: 'var(--font-display)',
                  fontWeight: 500,
                  color: provider === key ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}>
                  {info.label}
                </span>
              </div>
              <div style={{
                width: 16, height: 16,
                borderRadius: '50%',
                border: `2px solid ${provider === key ? info.color : 'var(--border-active)'}`,
                background: provider === key ? info.color : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'var(--transition)',
                flexShrink: 0,
              }}>
                {provider === key && (
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#070a0f' }} />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Submit */}
      <button
        type="submit"
        style={{
          background: 'var(--accent)',
          color: '#070a0f',
          border: 'none',
          padding: '14px 24px',
          borderRadius: 'var(--radius-md)',
          fontSize: 14,
          fontWeight: 700,
          fontFamily: 'var(--font-display)',
          cursor: 'pointer',
          letterSpacing: '0.03em',
          transition: 'var(--transition)',
          boxShadow: '0 0 24px rgba(0,229,160,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          marginTop: 4,
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = '#00ffb3';
          e.currentTarget.style.boxShadow = '0 0 36px rgba(0,229,160,0.45)';
          e.currentTarget.style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'var(--accent)';
          e.currentTarget.style.boxShadow = '0 0 24px rgba(0,229,160,0.25)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        <span>Run Agent Analysis</span>
        <span style={{ fontSize: 16 }}>→</span>
      </button>

      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--text-muted)',
        textAlign: 'center',
        letterSpacing: '0.04em',
      }}>
        Analysis typically takes 2–3 minutes to complete
      </p>
    </form>
  );
}