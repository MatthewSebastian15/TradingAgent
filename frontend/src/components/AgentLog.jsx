import React from 'react';

export default function AgentLog({ status }) {
  return (
    <div style={{
      marginTop: 32,
      backgroundColor: '#1a1d27',
      border: '1px solid #2a2d3e',
      borderRadius: 8,
      padding: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 10, height: 10,
          borderRadius: '50%',
          backgroundColor: '#4ade80',
          animation: 'pulse 1.5s infinite',
        }} />
        <p style={{ color: '#a0a0b0', fontSize: 14 }}>{status}</p>
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}