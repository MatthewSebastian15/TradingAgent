import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Analysis from './pages/Analysis';
import NotFound from './pages/NotFound';
import './index.css';

const AnalysisMock = lazy(() => import('./pages/AnalysisMock'));
const ENABLE_MOCK = String(import.meta.env.VITE_ENABLE_MOCK || '').toLowerCase() === 'true';

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
          <Route path="/analysis" element={ENABLE_MOCK ? <AnalysisMock /> : <Analysis />} />
          <Route path="/analysis-live" element={<Analysis />} />
          {ENABLE_MOCK && <Route path="/analysis-mock" element={<AnalysisMock />} />}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
