import PropTypes from 'prop-types';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function MetricCard({ label, value, unit, className }) {
  const displayValue = value === null || value === undefined || value === '' ? 'N/A' : value;

  return (
    <Card
      className={cn(
        'rounded-md border-border bg-card transition-colors duration-200 hover:border-primary/70',
        className
      )}
      data-testid="metric-card"
    >
      <CardContent className="p-4">
        <div className="font-sans text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-mono text-lg font-semibold text-foreground">{displayValue}</span>
          {unit && <span className="font-sans text-xs text-muted-foreground">{unit}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

MetricCard.propTypes = {
  className: PropTypes.string,
  label: PropTypes.string.isRequired,
  unit: PropTypes.string,
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
};
