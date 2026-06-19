import React from 'react';

import Navbar from '../components/Navbar';

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-bloomberg-bg pt-8">
      <Navbar />
      <main className="px-4 py-4">
        <h1 className="font-mono text-sm font-bold uppercase tracking-[0.35em] text-bloomberg-orange">
          Home
        </h1>
      </main>
    </div>
  );
}
