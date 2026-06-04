import React, { useState } from 'react';
import PropTypes from 'prop-types';

import { REPORT_DISCLAIMER } from '../constants/reportDisclaimer';

export default function DisclaimerFooter({ disclaimer = REPORT_DISCLAIMER }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="sticky bottom-0 z-40 border-t border-bloomberg-border bg-bloomberg-card bg-opacity-95 backdrop-blur">
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black bg-opacity-60" onClick={() => setIsOpen(false)}>
          <div
            className="absolute bottom-0 left-0 right-0 max-h-[50vh] overflow-y-auto border-t border-bloomberg-border bg-bloomberg-card px-4 py-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-bloomberg-border pb-2">
              <div className="font-mono text-xs text-bloomberg-muted tracking-wider uppercase">
                Full Disclaimer
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="font-mono text-xs text-bloomberg-muted hover:text-bloomberg-white tracking-wider"
              >
                Close
              </button>
            </div>
            <p className="mt-3 whitespace-pre-line font-mono text-[11px] leading-relaxed text-bloomberg-muted">
              {disclaimer}
            </p>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2 px-4 py-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="font-mono text-[11px] text-bloomberg-muted">
          AI-generated analysis. Not financial advice. Verify before acting.
        </span>
        <button
          type="button"
          onClick={() => setIsOpen((value) => !value)}
          className="self-start font-mono text-[11px] text-bloomberg-orange hover:text-bloomberg-white tracking-wider sm:self-auto"
        >
          {isOpen ? 'Hide disclaimer ▲' : 'Read full disclaimer ▾'}
        </button>
      </div>
    </div>
  );
}

DisclaimerFooter.propTypes = {
  disclaimer: PropTypes.string,
};
