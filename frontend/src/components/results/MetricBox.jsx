import PropTypes from 'prop-types';

function hasDisplayValue(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== '' &&
    !(typeof value === 'number' && !Number.isFinite(value))
  );
}

export default function MetricBox({
  label,
  value,
  highlight = false,
  compact = false,
  preserveSlot = false,
  dataTestId,
}) {
  if (!preserveSlot && !hasDisplayValue(value)) return null;

  const displayValue = hasDisplayValue(value) ? value : 'N/A';
  const isEmpty = !hasDisplayValue(value);

  const boxPadding = compact ? 'px-3 py-2' : 'p-3';
  const labelSpacing = compact ? 'mb-1' : 'mb-1.5';
  const valueSize = compact ? 'text-xs' : 'text-base';

  return (
    <div
      data-testid={dataTestId}
      className={`border border-bloomberg-border bg-bloomberg-surface ${boxPadding}`}
    >
      <div
        className={`font-mono text-xs text-bloomberg-muted tracking-wider uppercase ${labelSpacing}`}
      >
        {label}
      </div>
      <div
        className={`font-mono ${valueSize} font-semibold break-words ${
          isEmpty
            ? 'text-bloomberg-muted'
            : highlight
              ? 'text-bloomberg-orange'
              : 'text-bloomberg-white'
        }`}
      >
        {displayValue}
      </div>
    </div>
  );
}

MetricBox.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node,
  highlight: PropTypes.bool,
  compact: PropTypes.bool,
  preserveSlot: PropTypes.bool,
  dataTestId: PropTypes.string,
};
