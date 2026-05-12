import React, { useState } from 'react';
import StockForm from '../components/StockForm';
import ResultCard from '../components/ResultCard';
import AgentLog from '../components/AgentLog';
import Navbar from '../components/Navbar';

export default function Analysis() {
  const [result, setResult]               = useState(null);
  const [loading, setLoading]             = useState(false);
  const [status, setStatus]               = useState('');
  const [agentProgress, setAgentProgress] = useState(null);

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
            onResult={setResult}
            onLoading={setLoading}
            onStatus={setStatus}
            onAgentProgress={setAgentProgress}
          />
        </div>

        {loading && <AgentLog status={status} agentProgress={agentProgress} />}
        {result && !loading && <ResultCard result={result} />}
      </div>
    </div>
  );
}