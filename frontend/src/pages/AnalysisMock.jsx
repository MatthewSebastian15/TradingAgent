import React, { useState } from 'react';
import StockFormMock from '../components/StockFormMock';
import ResultCard from '../components/ResultCard';
import AgentLog from '../components/AgentLog';
import Navbar from '../components/Navbar';

export default function AnalysisMock() {
  const [result, setResult]               = useState(null);
  const [loading, setLoading]             = useState(false);
  const [status, setStatus]               = useState('');
  const [agentProgress, setAgentProgress] = useState(null);

  return (
    <div className="min-h-screen bg-bloomberg-bg">
      <Navbar />
      <div className="flex" style={{ minHeight: 'calc(100vh - 68px)' }}>
        <div className="w-80 flex-shrink-0 border-r border-bloomberg-border">
          <div className="border-b border-bloomberg-border bg-bloomberg-card">
            <StockFormMock
              onResult={setResult}
              onLoading={setLoading}
              onStatus={setStatus}
              onAgentProgress={setAgentProgress}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {!loading && !result && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="font-display text-5xl font-bold text-bloomberg-border tracking-widest mb-3">MOCK</div>
                <div className="font-mono text-xs text-bloomberg-muted">Run mock analysis to preview the UI</div>
              </div>
            </div>
          )}
          {loading && <div className="p-6"><AgentLog status={status} agentProgress={agentProgress} /></div>}
          {result && !loading && <div className="p-6"><ResultCard result={result} /></div>}
        </div>
      </div>
    </div>
  );
}
