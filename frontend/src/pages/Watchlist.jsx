import React from 'react';

import Navbar from '../components/Navbar';
import WatchlistPage from '../components/watchlist/WatchlistPage';

export default function Watchlist() {
  return (
    <div className="min-h-screen bg-bloomberg-bg pt-[60px] text-bloomberg-white">
      <Navbar />
      <WatchlistPage />
    </div>
  );
}
