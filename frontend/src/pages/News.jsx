import React, { useState } from 'react';
import Navbar from '../components/Navbar';
import NewsFilterBar from '../components/news/NewsFilterBar';
import NewsList from '../components/news/NewsList';
import TickerTape from '../components/TickerTape';
import { useGeneralNews } from '../hooks/useGeneralNews';

export default function News() {
  const [category, setCategory] = useState('all');
  const { data, status, error, reload } = useGeneralNews({
    category,
    windowDays: 7,
    limit: 50,
  });

  return (
    <div className="min-h-screen bg-bloomberg-bg text-bloomberg-white">
      <Navbar />
      <TickerTape />
      <main className="px-4 py-4 font-mono">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-sm tracking-widest text-bloomberg-orange">NEWS</h1>
          <button
            type="button"
            onClick={reload}
            className="border border-bloomberg-border px-3 py-1 text-xs text-bloomberg-muted hover:text-bloomberg-orange"
          >
            REFRESH
          </button>
        </div>

        <NewsFilterBar selectedCategory={category} onChange={setCategory} />

        {status === 'loading' && (
          <div className="py-4 text-xs text-bloomberg-muted">Loading news...</div>
        )}

        {error && (
          <div className="py-4 text-xs text-bloomberg-red">Failed to load general news.</div>
        )}

        <NewsList articles={data?.articles || []} />
      </main>
    </div>
  );
}
