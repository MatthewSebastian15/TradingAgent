import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../App.css';

export default function Dashboard() {
  const navigate = useNavigate();

  return (
    <div>
      <nav className="navbar">
        <h1>TradingAgents</h1>
      </nav>
      <div className="app-container">
        <h2 style={{ fontSize: 28, marginBottom: 8 }}>Multi-Agent Trading Analysis</h2>
        <p style={{ color: '#a0a0b0', marginBottom: 32 }}>
          Powered by LLM agents: analysts, researchers, risk managers, and portfolio manager.
        </p>
        <button
          onClick={() => navigate('/analysis')}
          style={{
            backgroundColor: '#4ade80',
            color: '#0f1117',
            border: 'none',
            padding: '12px 28px',
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Start Analysis
        </button>
      </div>
    </div>
  );
}