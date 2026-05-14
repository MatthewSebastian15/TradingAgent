import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Analysis from './pages/Analysis';
import NotFound from './pages/NotFound';
import './index.css';

const AnalysisMock = lazy(() => import('./pages/AnalysisMock'));
const ENABLE_MOCK = String(import.meta.env.VITE_ENABLE_MOCK || '').toLowerCase() === 'true';

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<Dashboard />} />
          <Route path="/analysis" element={<Analysis />} />
          {ENABLE_MOCK && <Route path="/analysis-mock" element={<AnalysisMock />} />}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
