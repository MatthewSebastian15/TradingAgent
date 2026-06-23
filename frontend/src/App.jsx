import React, { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';

import {
  AI_AGENT_PATH,
  LEGACY_AI_AGENT_LOWER_PATH,
  LEGACY_AI_AGENT_OLD_PATH,
  LEGACY_ANALYSIS_LIVE_PATH,
  LEGACY_ANALYSIS_PATH,
  WATCHLIST_PATH,
  CHATBOT_PATH,
} from './constants/routes';
import { prefetchMarketOverviewData } from './hooks/useMarketOverviewData';
import AIAgent from './pages/AIAgent';
import { ChatbotPage } from './pages/ChatbotPage';
import Dashboard from './pages/Dashboard';
import Economic from './pages/Economic';
import Market from './pages/Market';
import News from './pages/News';
import NotFound from './pages/NotFound';
import Research from './pages/Research';
import Watchlist from './pages/Watchlist';
import { MARKET_DEFAULT_SYMBOLS } from './utils/marketDefaults';
import './index.css';

function buildResourceRedirectPath(basePath, resourceId) {
  const normalizedResourceId = typeof resourceId === 'string' ? resourceId.trim() : '';

  if (!normalizedResourceId) {
    return basePath;
  }

  return `${basePath}/${encodeURIComponent(normalizedResourceId)}`;
}

function LegacyAIAgentRedirect() {
  const { resourceId } = useParams();

  return <Navigate to={buildResourceRedirectPath(AI_AGENT_PATH, resourceId)} replace />;
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-bloomberg-bg flex items-center justify-center">
      <span className="font-mono text-xs text-bloomberg-muted tracking-widest">LOADING...</span>
    </div>
  );
}

function App() {
  useEffect(() => {
    const controller = new AbortController();
    prefetchMarketOverviewData(MARKET_DEFAULT_SYMBOLS, { signal: controller.signal });
    return () => controller.abort();
  }, []);

  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<Dashboard />} />
          <Route path={AI_AGENT_PATH} element={<AIAgent />} />
          <Route path={`${AI_AGENT_PATH}/:resourceId`} element={<AIAgent />} />
          <Route
            path={LEGACY_AI_AGENT_OLD_PATH}
            element={<Navigate to={AI_AGENT_PATH} replace />}
          />
          <Route
            path={LEGACY_AI_AGENT_LOWER_PATH}
            element={<Navigate to={AI_AGENT_PATH} replace />}
          />
          <Route
            path={`${LEGACY_AI_AGENT_OLD_PATH}/:resourceId`}
            element={<LegacyAIAgentRedirect />}
          />
          <Route
            path={`${LEGACY_AI_AGENT_LOWER_PATH}/:resourceId`}
            element={<LegacyAIAgentRedirect />}
          />
          <Route path={LEGACY_ANALYSIS_PATH} element={<Navigate to={AI_AGENT_PATH} replace />} />
          <Route path={`${LEGACY_ANALYSIS_PATH}/:resourceId`} element={<LegacyAIAgentRedirect />} />
          <Route
            path={LEGACY_ANALYSIS_LIVE_PATH}
            element={<Navigate to={AI_AGENT_PATH} replace />}
          />
          <Route path="/research" element={<Research />} />
          <Route path={WATCHLIST_PATH} element={<Watchlist />} />
          <Route path="/news" element={<News />} />
          <Route path="/market" element={<Market />} />
          <Route path="/econ" element={<Economic />} />
          <Route path={CHATBOT_PATH} element={<ChatbotPage />} />
          <Route path="/economic" element={<Navigate to="/econ" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
