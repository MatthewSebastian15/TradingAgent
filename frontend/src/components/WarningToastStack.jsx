import { AlertTriangle, X } from 'lucide-react';
import PropTypes from 'prop-types';
import React, { useState } from 'react';

function normalizeWarnings(warnings) {
  if (!Array.isArray(warnings)) return [];

  return warnings
    .map((warning, index) => {
      if (!warning) return null;
      if (typeof warning === 'string') {
        return {
          id: warning,
          title: 'WARNING',
          message: warning,
        };
      }

      const title = String(warning.title || 'WARNING').trim();
      const message = String(warning.message || warning.detail || '').trim();
      if (!message) return null;

      return {
        id: warning.id || `${title}:${message}:${index}`,
        title,
        message,
      };
    })
    .filter(Boolean);
}

export default function WarningToastStack({ warnings = [] }) {
  const [dismissed, setDismissed] = useState(() => new Set());
  const visibleWarnings = normalizeWarnings(warnings).filter((w) => !dismissed.has(w.id));

  if (visibleWarnings.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed right-4 top-12 z-[60] flex w-[min(calc(100vw-2rem),24rem)] flex-col gap-2"
      aria-live="polite"
      aria-label="System warnings"
    >
      {visibleWarnings.map((warning) => (
        <div
          key={warning.id}
          role="alert"
          className="pointer-events-auto border border-bloomberg-amber bg-black/95 px-3 py-2 shadow-lg shadow-black/40"
        >
          <div className="flex items-center gap-2 font-mono text-[11px] font-bold tracking-[0.2em] text-bloomberg-amber">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.8} />
            <span className="flex-1">{warning.title}</span>
            <button
              type="button"
              onClick={() => setDismissed((prev) => new Set(prev).add(warning.id))}
              aria-label="Dismiss warning"
              className="flex-shrink-0 text-bloomberg-amber/70 transition-colors hover:text-bloomberg-amber"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>
          <p className="mt-1 font-mono text-[11px] leading-relaxed text-bloomberg-white">
            {warning.message}
          </p>
        </div>
      ))}
    </div>
  );
}

WarningToastStack.propTypes = {
  warnings: PropTypes.arrayOf(
    PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.shape({
        id: PropTypes.string,
        title: PropTypes.string,
        message: PropTypes.string,
        detail: PropTypes.string,
      }),
    ])
  ),
};
