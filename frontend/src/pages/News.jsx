import React, { useMemo, useState } from 'react';

import { Card, CardContent } from '@/components/ui/card';

import Navbar from '../components/Navbar';
import NewsFilterBar from '../components/news/NewsFilterBar';
import NewsList from '../components/news/NewsList';
import NewsListSkeleton from '../components/news/NewsListSkeleton';
import { useGeneralNews } from '../hooks/useGeneralNews';

const CATEGORY_ALIASES = {
  market: 'markets',
  business: 'finance',
  commodities: 'markets',
  energy: 'markets',
  'central-bank': 'central_bank',
  centralbank: 'central_bank',
  indonesia: 'markets',
};

function normalizeCategory(value) {
  const category = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  return CATEGORY_ALIASES[category] || category;
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
  const isInitialLoading = status === 'loading' && !displayedArticles.length;

  return (
    <div className="min-h-screen bg-bloomberg-bg pt-[60px] text-bloomberg-white">
      <Navbar />
      <main className="terminal-news px-3 py-3 font-mono">
        <Card className="terminal-news-panel overflow-hidden rounded-lg border-bloomberg-border bg-black/30 text-bloomberg-white shadow-lg shadow-black/20">
          <CardContent className="p-3">
            <NewsFilterBar selectedCategory={category} onChange={setCategory} onRefresh={reload} />

            <div className="mt-2 flex items-center justify-between border-b border-bloomberg-border/70 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-bloomberg-muted">
              <span>{displayedArticles.length} stories</span>
              <span>Newest first</span>
            </div>

            {isInitialLoading ? (
              <NewsListSkeleton count={5} />
            ) : (
              <>
                {error && (
                  <div className="terminal-news-state mt-2 rounded-md border border-bloomberg-red/40 bg-bloomberg-red/10 px-3 py-2 text-xs text-bloomberg-red">
                    Failed to load general news.
                  </div>
                )}

                <NewsList articles={displayedArticles} />
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
