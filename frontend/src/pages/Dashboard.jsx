import React from 'react';

import HomeNewsSummary from '../components/home/HomeNewsSummary';
import Navbar from '../components/Navbar';
import { useGeneralNews } from '../hooks/useGeneralNews';

export default function Dashboard() {
  const { data, status, error } = useGeneralNews({
    category: 'all',
    windowDays: 7,
    limit: 100,
  });
  const newsError = error ? error.message || 'Unable to load summary news.' : '';

  return (
    <div className="min-h-screen bg-bloomberg-bg pt-[60px]">
      <Navbar />
      <main className="space-y-3 px-4 py-4">
        <HomeNewsSummary
          news={data?.articles || []}
          loading={status === 'loading'}
          error={newsError}
        />
        <h1 className="font-mono text-sm font-bold uppercase tracking-[0.35em] text-bloomberg-orange">
          Home
        </h1>
      </main>
    </div>
  );
}
