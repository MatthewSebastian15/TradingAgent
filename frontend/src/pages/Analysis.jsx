import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StockForm from '../components/StockForm';
import ResultCard from '../components/ResultCard';
import AgentLog from '../components/AgentLog';
import '../App.css';

export default function Analysis() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const navigate = useNavigate();

  return (
    <div>
      <nav className="navbar">
        <h1>TradingAgents</h1>
        <a href="#" onClick={() => navigate('/')}>Dashboard</a>
      </nav>
      <div className="app-container">
        <h2 style={{ fontSize: 24, marginBottom: 24 }}>Stock Analysis</h2>
        <StockForm
          onResult={setResult}
          onLoading={setLoading}
          onStatus={setStatus}
        />
        {loading && <AgentLog status={status} />}
        {result && !loading && <ResultCard result={result} />}
      </div>
    </div>
  );
}