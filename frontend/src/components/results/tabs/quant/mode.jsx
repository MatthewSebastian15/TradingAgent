import PropTypes from 'prop-types';
import { useMemo } from 'react';

import { QUANT_MODES, QuantModeContext, useQuantMode } from './modeContext';
import { SegmentedControl } from './SegmentedControl';

export function QuantModeProvider({ mode, onModeChange, children }) {
  const value = useMemo(() => ({ mode, setMode: onModeChange }), [mode, onModeChange]);
  return <QuantModeContext.Provider value={value}>{children}</QuantModeContext.Provider>;
}

QuantModeProvider.propTypes = {
  mode: PropTypes.oneOf(QUANT_MODES).isRequired,
  onModeChange: PropTypes.func.isRequired,
  children: PropTypes.node,
};

// Renders children only in Pro mode (full tables, confidence intervals, formulas).
export function ProOnly({ children, fallback = null }) {
  const { mode } = useQuantMode();
  return mode === 'pro' ? children : fallback;
}

ProOnly.propTypes = { children: PropTypes.node, fallback: PropTypes.node };

export function ModeToggle() {
  const { mode, setMode } = useQuantMode();
  return (
    <SegmentedControl
      size="sm"
      ariaLabel="Detail level"
      options={[
        { id: 'basic', label: 'Basic' },
        { id: 'pro', label: 'Pro' },
      ]}
      value={mode}
      onChange={setMode}
    />
  );
}
