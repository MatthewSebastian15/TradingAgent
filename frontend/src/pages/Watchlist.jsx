import React from 'react';

import Navbar from '../components/Navbar';
import WatchlistPage from '../components/watchlist/WatchlistPage';

export default function Watchlist() {
  return (
    <div className="min-h-screen bg-bloomberg-bg text-bloomberg-white">
      <Navbar />
      <WatchlistPage />
    </div>
  );
}
