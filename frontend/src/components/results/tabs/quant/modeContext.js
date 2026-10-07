import { createContext, useContext } from 'react';

export const QUANT_MODES = ['basic', 'pro'];

// Default is Pro so any component rendered outside QuantPanel keeps showing everything.
export const QuantModeContext = createContext({ mode: 'pro', setMode: () => {} });

export function useQuantMode() {
  return useContext(QuantModeContext);
}
