import PropTypes from 'prop-types';
import React from 'react';

import MetricBox from './MetricBox';
import SectionHeader from './SectionHeader';

export default function AnalysisStatusRow({
  label,
  metrics,
  reason = null,
  reasonRenderer = null,
  columnsClass,
}) {
  if (!metrics.length) return null;

  return (
    <div className="px-4 py-3 border-b border-bloomberg-border">
      <SectionHeader label={label} />
      <div className={columnsClass}>
        {metrics.map((metric) => (
          <MetricBox
            key={metric.label}
            label={metric.label}
            value={metric.value}
            highlight={metric.highlight}
            subValue={metric.subValue}
            tooltip={metric.tooltip}
            tone={metric.tone}
            preserveSlot
            dataTestId={metric.dataTestId}
            compact
          />
        ))}
      </div>
      {reason && (
        <p className="mt-2 font-mono text-xs text-bloomberg-muted leading-relaxed">
          {reasonRenderer ? reasonRenderer(reason) : reason}
        </p>
      )}
    </div>
  );
}

AnalysisStatusRow.propTypes = {
  label: PropTypes.string.isRequired,
  metrics: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      value: PropTypes.node,
      highlight: PropTypes.bool,
      subValue: PropTypes.node,
      tooltip: PropTypes.string,
      tone: PropTypes.string,
      dataTestId: PropTypes.string,
    })
  ).isRequired,
  reason: PropTypes.string,
  reasonRenderer: PropTypes.func,
  columnsClass: PropTypes.string.isRequired,
};
