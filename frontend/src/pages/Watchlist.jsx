import React from 'react';

import Navbar from '../components/Navbar';

export default function Watchlist() {
  return (
    <div className="min-h-screen bg-bloomberg-bg">
      <Navbar />
      <main className="flex min-h-[400px] items-center justify-center bg-bloomberg-bg px-4 py-8">
        <div className="border border-bloomberg-border bg-bloomberg-card px-8 py-6 text-center font-mono">
          <div className="mb-3 text-xs tracking-[0.2em] text-bloomberg-orange">MODULE STATUS</div>
          <div className="text-2xl font-bold tracking-wider text-bloomberg-white">COMING SOON</div>
          <div className="mt-3 text-xs tracking-wider text-bloomberg-muted">
            Watchlist module is under development.
          </div>
        </div>
      </main>
    </div>
  );
}
