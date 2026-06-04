import React from 'react';
import PropTypes from 'prop-types';

import { REPORT_DISCLAIMER } from '../constants/reportDisclaimer';

export default function DisclaimerFooter({ disclaimer = REPORT_DISCLAIMER }) {
  return (
    <section className="border-t border-bloomberg-border bg-bloomberg-card px-4 py-4">
      <div className="font-mono text-xs text-bloomberg-muted tracking-wider uppercase">
        Disclaimer
      </div>
      <p className="mt-2 whitespace-pre-line font-mono text-[11px] leading-relaxed text-bloomberg-muted">
        {disclaimer}
      </p>
    </section>
  );
}

DisclaimerFooter.propTypes = {
  disclaimer: PropTypes.string,
};
