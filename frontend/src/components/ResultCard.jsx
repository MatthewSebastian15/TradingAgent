import React from 'react';

export default function ResultCard({ result }) {
  if (!result) return null;

  if (result.error) {
    return (
      <div style={{
        marginTop: 32,
        backgroundColor: '#2a1a1a',
        border: '1px solid #ef4444',
        borderRadius: 8,
        padding: 20,
      }}>
        <p style={{ color: '#ef4444', fontWeight: 600 }}>Error</p>
        <p style={{ color: '#a0a0b0', fontSize: 14, marginTop: 8 }}>{result.error}</p>
      </div>
    );
  }

  return (
    <div style={{
      marginTop: 32,
      backgroundColor: '#1a1d27',
      border: '1px solid #2a2d3e',
      borderRadius: 8,
      padding: 24,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ fontSize: 20, fontWeight: 700 }}>{result.ticker}</h3>
        <span style={{
          backgroundColor: '#14532d',
          color: '#4ade80',
          padding: '4px 12px',
          borderRadius: 20,
          fontSize: 13,
          fontWeight: 600,
        }}>
          Analysis Complete
        </span>
      </div>
      <div style={{
        backgroundColor: '#0f1117',
        borderRadius: 8,
        padding: 16,
        fontSize: 14,
        color: '#a0a0b0',
        whiteSpace: 'pre-wrap',
        lineHeight: 1.7,
      }}>
        {typeof result.decision === 'string'
          ? result.decision
          : JSON.stringify(result.decision, null, 2)}
      </div>
    </div>
  );
}