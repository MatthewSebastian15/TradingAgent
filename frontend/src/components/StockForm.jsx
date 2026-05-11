import React, { useState } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

export default function StockForm({ onResult, onLoading, onStatus }) {
  const [ticker, setTicker] = useState('NVDA');
  const [date, setDate] = useState('2024-05-10');
  const [provider, setProvider] = useState('google');

  async function handleSubmit(e) {
    e.preventDefault();
    onLoading(true);
    onStatus('Initializing agents...');
    onResult(null);

    try {
      onStatus('Running analysis. This may take 2-3 minutes...');
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

  const inputStyle = {
    backgroundColor: '#1a1d27',
    border: '1px solid #2a2d3e',
    borderRadius: 8,
    padding: '10px 14px',
    color: '#e0e0e0',
    fontSize: 14,
    width: '100%',
  };

  const labelStyle = {
    display: 'block',
    fontSize: 13,
    color: '#a0a0b0',
    marginBottom: 6,
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
      <div>
        <label style={labelStyle}>Ticker Symbol</label>
        <input
          style={inputStyle}
          value={ticker}
          onChange={e => setTicker(e.target.value.toUpperCase())}
          placeholder="e.g. NVDA, AAPL, TSLA"
          required
        />
      </div>
      <div>
        <label style={labelStyle}>Trade Date</label>
        <input
          style={inputStyle}
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          required
        />
      </div>
      <div>
        <label style={labelStyle}>LLM Provider</label>
        <select
          style={inputStyle}
          value={provider}
          onChange={e => setProvider(e.target.value)}
        >
          <option value="google">Google (Gemini)</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
        </select>
      </div>
      <button
        type="submit"
        style={{
          backgroundColor: '#4ade80',
          color: '#0f1117',
          border: 'none',
          padding: '12px',
          borderRadius: 8,
          fontSize: 15,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Analyze
      </button>
    </form>
  );
}