import React, { useState } from 'react';
import { MOCK_RESPONSE, MOCK_SELL_RESPONSE, MOCK_HOLD_RESPONSE, MOCK_ERROR_RESPONSE } from '../mockData';

const MOCK_MAP = {
  NVDA: MOCK_RESPONSE,
  AAPL: MOCK_HOLD_RESPONSE,
  TSLA: MOCK_SELL_RESPONSE,
  ERROR: MOCK_ERROR_RESPONSE,
};

export default function StockFormMock({ onResult, onLoading, onStatus, onAgentProgress }) {
  const [ticker, setTicker] = useState('NVDA');

  function run() {
    onResult(null);
    onLoading(true);
    onStatus('Running mock pipeline...');
    if (onAgentProgress) onAgentProgress(null);

    const agents = ['market_analyst','news_analyst','fundamentals','bull_researcher','bear_researcher','research_manager','trader','risk_analysts','portfolio_manager'];
    agents.forEach((id, i) => {
      setTimeout(() => {
        if (onAgentProgress) onAgentProgress({ agent_id: id, agent_name: id.replace(/_/g,' ').toUpperCase(), status: 'started', status_message: `Running ${id}...` });
        setTimeout(() => {
          if (onAgentProgress) onAgentProgress({ agent_id: id, agent_name: id.replace(/_/g,' ').toUpperCase(), status: 'completed', status_message: `${id} complete` });
        }, 600);
      }, i * 800);
    });

    setTimeout(() => {
      const res = MOCK_MAP[ticker] || MOCK_RESPONSE;
      onResult(res);
      onLoading(false);
      onStatus('');
    }, agents.length * 800 + 800);
  }

  return (
    <div className="flex flex-col gap-0">
      <div className="px-4 py-2.5 border-b border-bloomberg-border flex items-center gap-2 bg-bloomberg-amber-dim">
        <span className="font-mono text-xs font-semibold text-bloomberg-amber tracking-wider">MOCK MODE</span>
        <span className="font-mono text-xs text-bloomberg-muted">/ NO API CALL</span>
      </div>
      <div className="p-4 flex flex-col gap-4">
        <div>
          <label className="block text-xs font-mono text-bloomberg-muted tracking-wider uppercase mb-2">MOCK TICKER</label>
          <select
            value={ticker}
            onChange={e => setTicker(e.target.value)}
            className="w-full bg-black border border-bloomberg-border px-3 py-2.5 font-mono text-sm text-bloomberg-white focus:outline-none focus:border-bloomberg-orange"
          >
            <option value="NVDA" className="bg-black">NVDA — BUY signal</option>
            <option value="AAPL" className="bg-black">AAPL — HOLD signal</option>
            <option value="TSLA" className="bg-black">TSLA — SELL signal</option>
            <option value="ERROR" className="bg-black">ERROR — error state</option>
          </select>
        </div>
        <button
          onClick={run}
          className="w-full py-3 bg-bloomberg-amber text-black font-mono text-xs font-bold tracking-widest hover:bg-yellow-300 transition-colors"
        >
          ▶ RUN MOCK ANALYSIS
        </button>
        <div className="text-center font-mono text-xs text-bloomberg-muted tracking-wider">
          SIMULATES FULL PIPELINE WITHOUT BACKEND
        </div>
      </div>
    </div>
  );
}
