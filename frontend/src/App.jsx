import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';

import { frontendConfig } from './config';
import {
  AI_AGENT_MOCK_PATH,
  AI_AGENT_PATH,
  LEGACY_AI_AGENT_LOWER_PATH,
  LEGACY_AI_AGENT_MOCK_LOWER_PATH,
  LEGACY_AI_AGENT_MOCK_OLD_PATH,
  LEGACY_AI_AGENT_OLD_PATH,
  LEGACY_ANALYSIS_LIVE_PATH,
  LEGACY_ANALYSIS_MOCK_ALIAS_PATH,
  LEGACY_ANALYSIS_MOCK_PATH,
  LEGACY_ANALYSIS_PATH,
} from './constants/routes';
import AIAgent from './pages/AIAgent';
import Dashboard from './pages/Dashboard';
import Economic from './pages/Economic';
import Market from './pages/Market';
import News from './pages/News';
import NotFound from './pages/NotFound';
import Research from './pages/Research';
import './index.css';

// Mock UI route is opt-in only. Keeping it behind VITE_ENABLE_MOCK prevents
// development/demo data from leaking into normal Docker builds.
const ENABLE_MOCK_ROUTE = frontendConfig.enableMock;
const AIAgentMock = ENABLE_MOCK_ROUTE ? lazy(() => import('./pages/AIAgentMock')) : null;

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

function LegacyAIAgentMockRedirect() {
  const { resourceId } = useParams();

  return <Navigate to={buildResourceRedirectPath(AI_AGENT_MOCK_PATH, resourceId)} replace />;
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-bloomberg-bg flex items-center justify-center">
      <span className="font-mono text-xs text-bloomberg-muted tracking-widest">LOADING...</span>
    </div>
  );
}

function App() {
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
          <Route path="/news" element={<News />} />
          <Route path="/market" element={<Market />} />
          <Route path="/econ" element={<Economic />} />
          <Route path="/economic" element={<Navigate to="/econ" replace />} />
          {ENABLE_MOCK_ROUTE && AIAgentMock && (
            <Route path={AI_AGENT_MOCK_PATH} element={<AIAgentMock />} />
          )}
          {ENABLE_MOCK_ROUTE && AIAgentMock && (
            <Route path={`${AI_AGENT_MOCK_PATH}/:resourceId`} element={<AIAgentMock />} />
          )}
          {ENABLE_MOCK_ROUTE && AIAgentMock && (
            <Route
              path={LEGACY_AI_AGENT_MOCK_OLD_PATH}
              element={<Navigate to={AI_AGENT_MOCK_PATH} replace />}
            />
          )}
          {ENABLE_MOCK_ROUTE && AIAgentMock && (
            <Route
              path={LEGACY_AI_AGENT_MOCK_LOWER_PATH}
              element={<Navigate to={AI_AGENT_MOCK_PATH} replace />}
            />
          )}
          {ENABLE_MOCK_ROUTE && AIAgentMock && (
            <Route
              path={`${LEGACY_AI_AGENT_MOCK_OLD_PATH}/:resourceId`}
              element={<LegacyAIAgentMockRedirect />}
            />
          )}
          {ENABLE_MOCK_ROUTE && AIAgentMock && (
            <Route
              path={`${LEGACY_AI_AGENT_MOCK_LOWER_PATH}/:resourceId`}
              element={<LegacyAIAgentMockRedirect />}
            />
          )}
          {ENABLE_MOCK_ROUTE && AIAgentMock && (
            <Route
              path={LEGACY_ANALYSIS_MOCK_PATH}
              element={<Navigate to={AI_AGENT_MOCK_PATH} replace />}
            />
          )}
          {ENABLE_MOCK_ROUTE && AIAgentMock && (
            <Route
              path={`${LEGACY_ANALYSIS_MOCK_PATH}/:resourceId`}
              element={<LegacyAIAgentMockRedirect />}
            />
          )}
          {ENABLE_MOCK_ROUTE && AIAgentMock && (
            <Route
              path={LEGACY_ANALYSIS_MOCK_ALIAS_PATH}
              element={<Navigate to={AI_AGENT_MOCK_PATH} replace />}
            />
          )}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
