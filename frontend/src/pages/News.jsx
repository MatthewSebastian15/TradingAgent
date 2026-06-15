import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
        <Card className="overflow-hidden rounded-xl border-bloomberg-border bg-card text-bloomberg-white shadow-xl shadow-black/30">
          <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-bloomberg-border bg-bloomberg-surface/60 p-4">
            <CardTitle className="text-sm uppercase tracking-[0.22em] text-bloomberg-orange">
              NEWS
            </CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={reload}
              className="h-8 rounded-md border-bloomberg-border bg-black/60 px-3 font-mono text-xs text-bloomberg-muted hover:border-bloomberg-orange hover:bg-bloomberg-orange/10 hover:text-bloomberg-orange"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              REFRESH
            </Button>
          </CardHeader>

          <CardContent className="p-4">
            <NewsFilterBar selectedCategory={category} onChange={setCategory} />

            {status === 'loading' && (
              <div className="mt-4 rounded-lg border border-bloomberg-border bg-black/50 px-4 py-3 text-xs text-bloomberg-muted">
                Loading news...
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-lg border border-bloomberg-red/40 bg-bloomberg-red/10 px-4 py-3 text-xs text-bloomberg-red">
                Failed to load general news.
              </div>
            )}

            <NewsList articles={data?.articles || []} />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
