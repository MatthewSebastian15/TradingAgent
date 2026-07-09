import PropTypes from 'prop-types';
import { useMemo, useState } from 'react';

import NoticeBox from '../../../NoticeBox';
import { blackScholes, impliedVol } from '../../quantUtils';
import { MetricCard, NumberField } from '../charts';
import { finite, DASH, fmtNum2 } from '../format';

export function OptionsSection({ spot, defaultVol, defaultRate, ccy }) {
  const [strike, setStrike] = useState(Number(spot.toFixed(2)));
  const [days, setDays] = useState(30);
  const [vol, setVol] = useState(finite(defaultVol) ? Number(defaultVol.toFixed(1)) : 25);
  const [rate, setRate] = useState(Number((defaultRate * 100).toFixed(2)));
  const [type, setType] = useState('call');
  const [marketPrice, setMarketPrice] = useState(''); // optional: solve implied vol

  const greeks = useMemo(
    () =>
      blackScholes(
        spot,
        Number(strike),
        Number(days) / 365,
        Number(rate) / 100,
        Number(vol) / 100,
        type
      ),
    [spot, strike, days, rate, vol, type]
  );
  // Implied vol from a quoted market price — the inverse of the pricer above.
  const iv = useMemo(() => {
    if (marketPrice === '' || !(Number(marketPrice) > 0)) return null;
    return impliedVol(
      Number(marketPrice),
      spot,
      Number(strike),
      Number(days) / 365,
      Number(rate) / 100,
      type
    );
  }, [marketPrice, spot, strike, days, rate, type]);
  const money = (v) => `${ccy ? `${ccy} ` : '$'}${Number(v).toFixed(2)}`;

  return (
    <div className="space-y-4">
      <p className="text-sm text-bloomberg-subtle">
        European option fair value via Black-Scholes-Merton. Spot is today&apos;s close (
        {money(spot)}); volatility pre-fills with this name&apos;s realized annual vol. Research
        only.
      </p>
      <div className="flex flex-wrap items-end gap-4">
        <NumberField label="Strike" value={strike} onChange={setStrike} />
        <NumberField label="Days to Expiry" value={days} onChange={setDays} step="1" />
        <NumberField label="Volatility" value={vol} onChange={setVol} suffix="%" />
        <NumberField label="Risk-free Rate" value={rate} onChange={setRate} suffix="%" />
        <label className="flex flex-col gap-1 font-mono text-[11px] text-bloomberg-muted">
          <span className="tracking-wider uppercase">Type</span>
          <div className="flex gap-1">
            {['call', 'put'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`border border-bloomberg-border px-3 py-1 text-xs uppercase ${
                  type === t
                    ? 'bg-bloomberg-orange text-black'
                    : 'text-bloomberg-muted hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </label>
      </div>
      {greeks ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            label={`${type} Fair Value`}
            value={money(greeks.price)}
            tone="neutral"
            formula="Black-Scholes-Merton, no dividend. S·N(d1) − K·e^{−rT}·N(d2) for a call."
          />
          <MetricCard
            label="Delta"
            value={fmtNum2(greeks.delta)}
            gloss="∂Price/∂Spot. Shares-equivalent exposure per option."
          />
          <MetricCard
            label="Gamma"
            value={greeks.gamma.toFixed(4)}
            gloss="∂Delta/∂Spot. How fast delta moves."
          />
          <MetricCard
            label="Vega"
            value={fmtNum2(greeks.vega)}
            gloss="Price change per +1% volatility."
          />
          <MetricCard
            label="Theta"
            value={fmtNum2(greeks.theta)}
            tone={greeks.theta < 0 ? 'bad' : 'neutral'}
            gloss="Price change per day of time decay."
          />
          <MetricCard
            label="Rho"
            value={fmtNum2(greeks.rho)}
            gloss="Price change per +1% risk-free rate."
          />
        </div>
      ) : (
        <NoticeBox title="Check inputs">
          Strike, days, and volatility must all be positive.
        </NoticeBox>
      )}

      <div className="border border-bloomberg-border bg-bloomberg-card p-3">
        <div className="flex flex-wrap items-end gap-4">
          <NumberField label="Market Price" value={marketPrice} onChange={setMarketPrice} />
          <div className="font-mono text-[11px] text-bloomberg-muted">
            <div className="tracking-wider uppercase">Implied Volatility</div>
            <div className="mt-1 text-2xl text-white">
              {iv != null ? `${(iv * 100).toFixed(1)}%` : DASH}
            </div>
          </div>
          <p className="max-w-xs text-[11px] text-bloomberg-subtle">
            Enter a quoted option price to back out the volatility the market is pricing in
            (bisection on Black-Scholes).
          </p>
        </div>
      </div>
    </div>
  );
}

OptionsSection.propTypes = {
  spot: PropTypes.number.isRequired,
  defaultVol: PropTypes.number,
  defaultRate: PropTypes.number.isRequired,
  ccy: PropTypes.string,
};

// Two-stage DCF + market multiples. FCF/shares/net-debt auto-fill from the
