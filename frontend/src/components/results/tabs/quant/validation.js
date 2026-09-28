// Field-level input checks. Each returns { fieldKey: message }; empty object = valid.
const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
const wholeIn = (v, lo, hi) => v !== null && Number.isInteger(v) && v >= lo && v <= hi;

export function validateDcf({
  fcf,
  growth,
  years,
  fadeYears,
  terminalGrowth,
  shares,
  waccPct,
  manualWacc,
  requireInputs,
}) {
  const errors = {};
  const f = num(fcf);
  const s = num(shares);
  const g = num(growth);
  const tg = num(terminalGrowth);
  const w = num(waccPct);

  if (requireInputs && f === null) errors.fcf = 'Enter base free cash flow.';
  if (s === null ? requireInputs : !(s > 0))
    errors.shares = 'Shares outstanding must be greater than 0.';
  if (!wholeIn(num(years), 1, 30)) errors.years = 'Use a whole number of years from 1 to 30.';
  if (!wholeIn(num(fadeYears), 0, 20))
    errors.fadeYears = 'Use a whole number of fade years from 0 to 20.';
  if (g === null || g < -50 || g > 100) errors.growth = 'Growth must be between −50% and 100%.';

  if (tg === null || tg < -5 || tg > 10) {
    errors.terminalGrowth = 'Terminal growth must be between −5% and 10%.';
  } else if (Number.isFinite(w) && w <= tg) {
    // The Gordon terminal value needs WACC > g; blame the field the user controls.
    const message = `WACC (${w.toFixed(1)}%) must be greater than terminal growth.`;
    if (manualWacc) errors.wacc = message;
    else errors.terminalGrowth = message;
  }
  if (manualWacc && (w === null || w <= 0 || w > 50))
    errors.wacc = 'WACC must be between 0% and 50%.';
  return errors;
}

export function validateOptions({ strike, days, volPct, rate, yieldPct }) {
  const errors = {};
  const k = num(strike);
  const v = num(volPct);
  const r = num(rate);
  const q = num(yieldPct);
  if (!(k > 0)) errors.strike = 'Strike must be greater than 0.';
  if (!wholeIn(num(days), 1, 3650))
    errors.days = 'Days to expiry must be a whole number from 1 to 3650.';
  if (!(v > 0 && v <= 500)) errors.vol = 'Volatility must be above 0% and at most 500%.';
  if (r === null || r < -10 || r > 100) errors.rate = 'Rate must be between −10% and 100%.';
  if (q === null || q < 0 || q > 100) errors.yield = 'Dividend yield must be between 0% and 100%.';
  return errors;
}
