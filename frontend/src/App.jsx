import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Analysis from './pages/Analysis';
import News from './pages/News';
import Market from './pages/Market';
import NotFound from './pages/NotFound';
import {
  AI_RESEARCH_MOCK_PATH,
  AI_RESEARCH_PATH,
  LEGACY_ANALYSIS_LIVE_PATH,
  LEGACY_ANALYSIS_MOCK_ALIAS_PATH,
  LEGACY_ANALYSIS_MOCK_PATH,
  LEGACY_ANALYSIS_PATH,
} from './constants/routes';
import './index.css';

// Mock UI route is opt-in only. Keeping it behind VITE_ENABLE_MOCK prevents
// development/demo data from leaking into normal Docker builds.
const ENABLE_MOCK_ROUTE = import.meta.env.VITE_ENABLE_MOCK === 'true';
const AnalysisMock = ENABLE_MOCK_ROUTE ? lazy(() => import('./pages/AnalysisMock')) : null;

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-bloomberg-bg flex items-center justify-center">
      <span className="font-mono text-xs text-bloomberg-muted tracking-widest">LOADING...</span>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<Dashboard />} />
          <Route path={AI_RESEARCH_PATH} element={<Analysis />} />
          <Route path={`${AI_RESEARCH_PATH}/:resourceId`} element={<Analysis />} />
          <Route path={LEGACY_ANALYSIS_PATH} element={<Navigate to={AI_RESEARCH_PATH} replace />} />
          <Route
            path={`${LEGACY_ANALYSIS_PATH}/:resourceId`}
            element={
              <Navigate
                to={`${AI_RESEARCH_PATH}${window.location.pathname.slice(LEGACY_ANALYSIS_PATH.length)}`}
                replace
              />
            }
          />
          <Route
            path={LEGACY_ANALYSIS_LIVE_PATH}
            element={<Navigate to={AI_RESEARCH_PATH} replace />}
          />
          <Route path="/news" element={<News />} />
          <Route path="/market" element={<Market />} />
          {ENABLE_MOCK_ROUTE && AnalysisMock && (
            <Route path={AI_RESEARCH_MOCK_PATH} element={<AnalysisMock />} />
          )}
          {ENABLE_MOCK_ROUTE && AnalysisMock && (
            <Route path={`${AI_RESEARCH_MOCK_PATH}/:resourceId`} element={<AnalysisMock />} />
          )}
          {ENABLE_MOCK_ROUTE && AnalysisMock && (
            <Route
              path={LEGACY_ANALYSIS_MOCK_PATH}
              element={<Navigate to={AI_RESEARCH_MOCK_PATH} replace />}
            />
          )}
          {ENABLE_MOCK_ROUTE && AnalysisMock && (
            <Route
              path={`${LEGACY_ANALYSIS_MOCK_PATH}/:resourceId`}
              element={
                <Navigate
                  to={`${AI_RESEARCH_MOCK_PATH}${window.location.pathname.slice(LEGACY_ANALYSIS_MOCK_PATH.length)}`}
                  replace
                />
              }
            />
          )}
          {ENABLE_MOCK_ROUTE && AnalysisMock && (
            <Route
              path={LEGACY_ANALYSIS_MOCK_ALIAS_PATH}
              element={<Navigate to={AI_RESEARCH_MOCK_PATH} replace />}
            />
          )}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
