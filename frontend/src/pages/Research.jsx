import React from 'react';
import Navbar from '../components/Navbar';

export default function Research() {
  return (
    <div className="min-h-screen bg-bloomberg-bg">
      <Navbar />
      <main className="min-h-[400px] bg-bloomberg-bg flex items-center justify-center px-4 py-8">
        <div className="border border-bloomberg-border bg-bloomberg-card px-8 py-6 text-center font-mono">
          <div className="text-bloomberg-orange text-xs tracking-[0.2em] mb-3">MODULE STATUS</div>
          <div className="text-bloomberg-white text-2xl font-bold tracking-wider">COMING SOON</div>
          <div className="text-bloomberg-muted text-xs mt-3 tracking-wider">
            Research module is under development.
          </div>
        </div>
      </main>
    </div>
  );
}
