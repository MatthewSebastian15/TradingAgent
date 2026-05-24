import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Analysis from './pages/Analysis';
import NotFound from './pages/NotFound';
import './index.css';

const AnalysisMock = lazy(() => import('./pages/AnalysisMock'));

// Mock UI route is available in local Vite dev mode.
// In production builds, expose it only when VITE_ENABLE_MOCK=true.
const ENABLE_MOCK_ROUTE = import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCK === 'true';

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
          <Route path="/analysis" element={<Analysis />} />
          <Route path="/analysis-live" element={<Navigate to="/analysis" replace />} />
          {ENABLE_MOCK_ROUTE && <Route path="/analysis.test" element={<AnalysisMock />} />}
          {ENABLE_MOCK_ROUTE && (
            <Route path="/analysis-mock" element={<Navigate to="/analysis.test" replace />} />
          )}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
