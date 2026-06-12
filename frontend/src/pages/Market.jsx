import React from 'react';
import Navbar from '../components/Navbar';
import TickerTape from '../components/TickerTape';

export default function Market() {
  return (
    <div className="min-h-screen bg-bloomberg-bg">
      <Navbar />
      <TickerTape />
    </div>
  );
}
