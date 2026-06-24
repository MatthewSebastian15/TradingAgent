import { SendHorizontal } from 'lucide-react';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import HomeNewsSummary from '../components/home/HomeNewsSummary';
import HomeWatchlistSidebar from '../components/home/HomeWatchlistSidebar';
import Navbar from '../components/Navbar';
import { CHATBOT_PATH } from '../constants/routes';
import { useGeneralNews } from '../hooks/useGeneralNews';

function HomeChatBar() {
  const [text, setText] = useState('');
  const navigate = useNavigate();

  function submit(e) {
    e.preventDefault();
    const prompt = text.trim();
    if (!prompt) return;
    navigate(CHATBOT_PATH, { state: { prompt } });
  }

  return (
    <form
      onSubmit={submit}
      className="flex h-[100px] items-center gap-2 rounded-lg border border-border bg-card/80 p-2"
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ask the chatbot anything..."
        aria-label="Chat prompt"
        className="flex-1 bg-transparent px-2 py-1.5 font-mono text-sm text-bloomberg-white outline-none placeholder:text-bloomberg-muted"
      />
      <button
        type="submit"
        aria-label="Send"
        className="inline-flex items-center gap-1 rounded-md bg-bloomberg-orange px-3 py-1.5 font-mono text-xs font-medium text-black transition-colors hover:bg-bloomberg-orange/90"
      >
        <SendHorizontal className="h-3.5 w-3.5" />
        Send
      </button>
    </form>
  );
}

export default function Dashboard() {
  const { data, status, error } = useGeneralNews({
    category: 'all',
    windowDays: 14,
    limit: 100,
  });
  const newsError = error ? error.message || 'Unable to load summary news.' : '';

  return (
    <div className="min-h-screen bg-bloomberg-bg pt-[60px] pl-12">
      <Navbar />
      {/* Right padding = sidebar width (280px) + a 16px gap, matching the left px-4. */}
      <main className="space-y-3 px-4 pb-4 pt-2 md:pr-[296px]">
        <HomeNewsSummary
          news={data?.articles || []}
          loading={status === 'loading'}
          error={newsError}
        />
        <HomeChatBar />
      </main>
      <HomeWatchlistSidebar />
    </div>
  );
}
