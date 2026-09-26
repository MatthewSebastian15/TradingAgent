import PropTypes from 'prop-types';
import { useId } from 'react';

const SIZE_CLASS = {
  // Taller on phones (touch), terminal-dense from sm up.
  md: 'h-9 px-3 text-[11px] sm:h-7 sm:px-2.5',
  sm: 'h-8 px-2 text-[10px] sm:h-6',
};

// One option group for every section (method, horizon, strategy, call/put, ...).
export function SegmentedControl({ options, value, onChange, ariaLabel, label, size = 'md' }) {
  const labelId = useId();
  const group = (
    <div
      role="group"
      aria-label={label ? undefined : ariaLabel}
      aria-labelledby={label ? labelId : undefined}
      className="inline-flex flex-wrap"
    >
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={String(option.id)}
            type="button"
            aria-pressed={active}
            disabled={option.disabled}
            onClick={() => {
              if (!active) onChange(option.id);
            }}
            className={`-ml-px rounded-none border font-mono tracking-wide whitespace-nowrap first:ml-0 focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-1 focus-visible:outline-bloomberg-orange disabled:cursor-not-allowed disabled:opacity-40 ${
              SIZE_CLASS[size]
            } ${
              active
                ? 'relative z-[1] border-bloomberg-orange bg-bloomberg-orange text-black'
                : 'border-bloomberg-border text-bloomberg-white/80 hover:bg-bloomberg-surface hover:text-white'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );

  if (!label) return group;
  return (
    <div className="flex flex-col gap-1 font-mono">
      <span id={labelId} className="text-[11px] tracking-wider text-bloomberg-white/80 uppercase">
        {label}
      </span>
      {group}
    </div>
  );
}

const optionId = PropTypes.oneOfType([PropTypes.string, PropTypes.number, PropTypes.bool]);

SegmentedControl.propTypes = {
  options: PropTypes.arrayOf(
    PropTypes.shape({ id: optionId, label: PropTypes.string.isRequired, disabled: PropTypes.bool })
  ).isRequired,
  value: optionId,
  onChange: PropTypes.func.isRequired,
  ariaLabel: PropTypes.string.isRequired,
  label: PropTypes.string,
  size: PropTypes.oneOf(['sm', 'md']),
};
