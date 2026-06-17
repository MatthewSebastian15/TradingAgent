import React, { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import Navbar from '../components/Navbar';
import NewsFilterBar from '../components/news/NewsFilterBar';
import NewsList from '../components/news/NewsList';
import TickerTape from '../components/TickerTape';
import { useGeneralNews } from '../hooks/useGeneralNews';

function normalizeCategory(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

export default function News() {
  const [category, setCategory] = useState('all');
  const { data, status, error, reload } = useGeneralNews({
    category: 'all',
    windowDays: 7,
    limit: 100,
  });

  const articles = useMemo(() => data?.articles || [], [data]);
  const displayedArticles = useMemo(() => {
    if (category === 'all') return articles;
    return articles.filter((article) => normalizeCategory(article?.category) === category);
  }, [articles, category]);

  return (
    <div className="min-h-screen bg-bloomberg-bg text-bloomberg-white">
      <Navbar />
      <TickerTape />
      <main className="terminal-news px-4 py-4 font-mono">
        <Card className="terminal-news-panel overflow-hidden rounded-xl border-bloomberg-border bg-card text-bloomberg-white shadow-xl shadow-black/30">
          <CardContent className="p-4">
            <NewsFilterBar selectedCategory={category} onChange={setCategory} onRefresh={reload} />

            {status === 'loading' && (
              <div className="terminal-news-state mt-4 rounded-lg border border-bloomberg-border bg-black/50 px-4 py-3 text-xs text-bloomberg-muted">
                Loading news...
              </div>
            )}

            {error && (
              <div className="terminal-news-state mt-4 rounded-lg border border-bloomberg-red/40 bg-bloomberg-red/10 px-4 py-3 text-xs text-bloomberg-red">
                Failed to load general news.
              </div>
            )}

            <NewsList articles={displayedArticles} />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
