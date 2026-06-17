import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';

import { fetchReportDisclaimer } from '../utils/reportDisclaimer';

export default function DisclaimerFooter({ disclaimer }) {
  const [backendDisclaimer, setBackendDisclaimer] = useState('');
  const visibleDisclaimer = typeof disclaimer === 'string' && disclaimer.trim() ? disclaimer : backendDisclaimer;

  useEffect(() => {
    if (typeof disclaimer === 'string' && disclaimer.trim()) return undefined;

    let active = true;
    fetchReportDisclaimer().then((value) => {
      if (active) setBackendDisclaimer(value);
    });

    return () => {
      active = false;
    };
  }, [disclaimer]);

  if (!visibleDisclaimer) return null;

  return (
    <section className="border-t border-bloomberg-border bg-bloomberg-card px-4 py-4">
      <div className="font-mono text-xs text-bloomberg-muted tracking-wider uppercase">
        Disclaimer
      </div>
      <p className="ai-summary-disclaimer mt-2 whitespace-pre-line font-mono text-[11px] leading-relaxed text-bloomberg-muted">
        {visibleDisclaimer}
      </p>
    </section>
  );
}

DisclaimerFooter.propTypes = {
  disclaimer: PropTypes.string,
};
