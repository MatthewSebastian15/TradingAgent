import React from 'react';
import Navbar from '../components/Navbar';
import TickerTape from '../components/TickerTape';

export default function Economic() {
  return (
    <div className="min-h-screen bg-bloomberg-bg">
      <Navbar />
      <TickerTape />
      <main className="px-4 py-8">
        <h1 className="font-mono text-lg font-semibold tracking-wider text-bloomberg-white">
          Economic
        </h1>
      </main>
    </div>
  );
}
