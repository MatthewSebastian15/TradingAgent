import React from 'react';

import MarketTab from '../components/market/MarketTab';
import Navbar from '../components/Navbar';

export default function Market() {
  return (
    <div className="min-h-screen bg-bloomberg-bg pt-[60px]">
      <Navbar />
      <MarketTab />
    </div>
  );
}
