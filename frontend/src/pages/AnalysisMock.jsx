/**
 * AnalysisMock.jsx
 *
 * Testing-only page. Uses StockFormMock instead of the real StockForm.
 * Accessible at /analysis-mock (see App.js).
 * Use this to test UI components against mockData without hitting the backend.
 *
 * NEVER link to this page from the main navigation.
 */
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
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      <Navbar />

      {/* Mock mode banner */}
      <div style={{
        background: 'rgba(255,179,64,0.06)',
        borderBottom: '1px solid rgba(255,179,64,0.2)',
        padding: '10px 32px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        justifyContent: 'center',
      }}>
        <span style={{ fontSize: 14 }}>🧪</span>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--amber)',
          letterSpacing: '0.06em',
        }}>
          MOCK MODE — tidak ada API call ke backend. Hanya untuk testing UI.
        </span>
      </div>

      <div style={{
        maxWidth: 680,
        margin: '0 auto',
        padding: '48px 32px 80px',
      }}>
        <div style={{ marginBottom: 36 }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--amber)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: 10,
          }}>
            Mock Testing
          </div>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 28,
            fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: '-0.5px',
          }}>
            UI Test Mode
          </h2>
          <p style={{
            fontFamily: 'var(--font-display)',
            fontSize: 14,
            color: 'var(--text-secondary)',
            marginTop: 8,
            lineHeight: 1.6,
          }}>
            Testing ResultCard, AgentLog, dan komponen lain menggunakan mockData.js.
          </p>
        </div>

        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid rgba(255,179,64,0.2)',
          borderRadius: 'var(--radius-lg)',
          padding: '28px',
          marginBottom: 24,
        }}>
          <StockFormMock
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
