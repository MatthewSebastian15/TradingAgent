import React from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import TickerTape from '../components/TickerTape';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-bloomberg-bg">
      <Navbar />
      <TickerTape />
      <div
        className="flex flex-col items-center justify-center"
        style={{ minHeight: 'calc(100vh - 68px)' }}
      >
        <div className="text-center">
          <div className="font-display text-8xl font-bold text-bloomberg-border tracking-widest mb-4">
            404
          </div>
          <div className="font-mono text-sm text-bloomberg-muted tracking-wider mb-6">
            PAGE NOT FOUND
          </div>
          <button
            onClick={() => navigate('/home')}
            className="font-mono text-xs text-bloomberg-orange border border-bloomberg-orange px-6 py-2.5 hover:bg-bloomberg-orange-dim transition-colors tracking-wider"
          >
            ← RETURN TO HOME
          </button>
        </div>
      </div>
    </div>
  );
}
