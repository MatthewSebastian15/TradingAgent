import PropTypes from 'prop-types';

function hasDisplayValue(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== '' &&
    !(typeof value === 'number' && !Number.isFinite(value))
  );
}

function getToneClasses(tone, highlight, isEmpty) {
  if (isEmpty) {
    return {
      border: 'border-bloomberg-border',
      value: 'text-bloomberg-muted',
    };
  }

  const tones = {
    green: {
      border: 'border-bloomberg-green',
      value: 'text-bloomberg-green',
    },
    lime: {
      border: 'border-bloomberg-green',
      value: 'text-bloomberg-green',
    },
    yellow: {
      border: 'border-bloomberg-amber',
      value: 'text-bloomberg-amber',
    },
    amber: {
      border: 'border-bloomberg-amber',
      value: 'text-bloomberg-amber',
    },
    orange: {
      border: 'border-bloomberg-orange',
      value: 'text-bloomberg-orange',
    },
    red: {
      border: 'border-bloomberg-red',
      value: 'text-bloomberg-red',
    },
    gray: {
      border: 'border-bloomberg-border',
      value: 'text-bloomberg-muted',
    },
  };

  if (tone && tones[tone]) return tones[tone];
  return {
    border: 'border-bloomberg-border',
    value: highlight ? 'text-bloomberg-orange' : 'text-bloomberg-white',
  };
}

export default function MetricBox({
  label,
  value,
  subValue,
  tooltip,
  tone,
  highlight = false,
  compact = false,
  preserveSlot = false,
  dataTestId,
}) {
  if (!preserveSlot && !hasDisplayValue(value)) return null;

  const displayValue = hasDisplayValue(value) ? value : 'N/A';
  const isEmpty = !hasDisplayValue(value);
  const toneClasses = getToneClasses(tone, highlight, isEmpty);

  const boxPadding = compact ? 'px-3 py-2' : 'p-3';
  const labelSpacing = compact ? 'mb-1' : 'mb-1.5';
  const valueSize = compact ? 'text-xs' : 'text-base';

  return (
    <div
      data-testid={dataTestId}
      title={tooltip || undefined}
      className={`border bg-bloomberg-surface ${boxPadding} ${toneClasses.border}`}
    >
      <div
        className={`font-mono text-xs text-bloomberg-muted tracking-wider uppercase ${labelSpacing}`}
      >
        {label}
      </div>
      <div className={`font-mono ${valueSize} font-semibold break-words ${toneClasses.value}`}>
        {displayValue}
      </div>
      {hasDisplayValue(subValue) && (
        <div className="mt-1 font-mono text-[11px] text-bloomberg-muted leading-relaxed">
          {subValue}
        </div>
      )}
    </div>
  );
}

MetricBox.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node,
  subValue: PropTypes.node,
  tooltip: PropTypes.string,
  tone: PropTypes.string,
  highlight: PropTypes.bool,
  compact: PropTypes.bool,
  preserveSlot: PropTypes.bool,
  dataTestId: PropTypes.string,
};
