import PropTypes from 'prop-types';

// Orange ring for keyboard focus on the terminal's near-black surfaces.
export const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bloomberg-orange';

export function Skeleton({ className = '' }) {
  return (
    <div className={`animate-pulse bg-bloomberg-border rounded ${className}`} aria-hidden="true" />
  );
}
Skeleton.propTypes = { className: PropTypes.string };

export function SectionCard({ title, children, className = '', busy = false }) {
  return (
    <div
      aria-busy={busy || undefined}
      className={`border border-bloomberg-border bg-bloomberg-card rounded-sm overflow-hidden ${className}`}
    >
      {title && (
        <div className="border-b border-bloomberg-border px-3 py-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-bloomberg-orange">
            {title}
          </span>
        </div>
      )}
      {children}
    </div>
  );
}
SectionCard.propTypes = {
  title: PropTypes.string,
  children: PropTypes.node,
  className: PropTypes.string,
  busy: PropTypes.bool,
};

export function DataRow({ label, value, valueClass = 'text-bloomberg-white' }) {
  return (
    <div className="flex justify-between items-center px-3 py-[5px] border-b border-bloomberg-border last:border-0">
      <span className="font-mono text-[10px] text-bloomberg-muted">{label}</span>
      <span className={`font-mono text-xs ${valueClass}`}>{value}</span>
    </div>
  );
}
DataRow.propTypes = {
  label: PropTypes.string,
  value: PropTypes.node,
  valueClass: PropTypes.string,
};

export function SkeletonRow() {
  return (
    <div className="flex justify-between items-center px-3 py-[5px] border-b border-bloomberg-border last:border-0">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

export function MarginBar({ pct }) {
  return (
    <div className="h-[2px] bg-bloomberg-border rounded-full mt-1" aria-hidden="true">
      <div
        className={`h-full rounded-full ${pct >= 0 ? 'bg-bloomberg-green' : 'bg-bloomberg-red'}`}
        style={{ width: `${Math.min(100, Math.abs(pct))}%` }}
      />
    </div>
  );
}
MarginBar.propTypes = { pct: PropTypes.number };

export function RangeDot({ pct, label }) {
  return (
    <div className="relative h-[3px] bg-bloomberg-border rounded-full">
      <span className="sr-only">{label}</span>
      <div
        aria-hidden="true"
        className="absolute top-1/2 w-2.5 h-2.5 bg-bloomberg-orange rounded-full"
        style={{ left: `${pct}%`, transform: 'translateX(-50%) translateY(-50%)' }}
      />
    </div>
  );
}
RangeDot.propTypes = { pct: PropTypes.number, label: PropTypes.string.isRequired };
