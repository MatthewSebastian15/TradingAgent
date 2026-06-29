import React, { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useParams } from 'react-router-dom';

import Navbar from './components/Navbar';
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
import Dashboard from './pages/Dashboard';
import { MARKET_DEFAULT_SYMBOLS } from './utils/marketDefaults';

// Dashboard stays eager — it is the /home landing, lazy would flash the fallback
// on first paint. Everything else is split out of the initial bundle.
const AIAgent = React.lazy(() => import('./pages/AIAgent'));
const ChatbotPage = React.lazy(() =>
  import('./pages/ChatbotPage').then((m) => ({ default: m.ChatbotPage }))
);
const Economic = React.lazy(() => import('./pages/Economic'));
const Market = React.lazy(() => import('./pages/Market'));
const News = React.lazy(() => import('./pages/News'));
const NotFound = React.lazy(() => import('./pages/NotFound'));
const Portfolio = React.lazy(() => import('./pages/Portfolio'));
const Quant = React.lazy(() => import('./pages/Quant'));
const Research = React.lazy(() => import('./pages/Research'));
const Watchlist = React.lazy(() => import('./pages/Watchlist'));
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

// Navbar (fixed top bar + left rail) lives here so it stays mounted across route
// changes — only <Outlet/> swaps. Previously every page rendered its own <Navbar/>,
// so each navigation remounted it and re-fired its status/quotes fetches + intervals.
function AppLayout() {
  return (
    <>
      <Navbar />
      <Outlet />
    </>
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
          <Route element={<AppLayout />}>
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
          <Route path="/quant" element={<Quant />} />
          <Route path="/research" element={<Research />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path={WATCHLIST_PATH} element={<Watchlist />} />
          <Route path="/news" element={<News />} />
          <Route path="/market" element={<Market />} />
          <Route path="/econ" element={<Economic />} />
          <Route path={CHATBOT_PATH} element={<ChatbotPage />} />
          <Route path="/economic" element={<Navigate to="/econ" replace />} />
          <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
