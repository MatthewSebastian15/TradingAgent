import PropTypes from 'prop-types';

export function SectionCard({ title, children, className = '' }) {
  return (
    <div
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
      <div className="animate-pulse bg-bloomberg-border rounded h-3 w-20" />
      <div className="animate-pulse bg-bloomberg-border rounded h-3 w-16" />
    </div>
  );
}

export function MarginBar({ pct }) {
  return (
    <div className="h-[2px] bg-bloomberg-border rounded-full mt-1">
      <div
        className={`h-full rounded-full ${pct >= 0 ? 'bg-bloomberg-green' : 'bg-bloomberg-red'}`}
        style={{ width: `${Math.min(100, Math.abs(pct))}%` }}
      />
    </div>
  );
}
MarginBar.propTypes = { pct: PropTypes.number };

export function RangeDot({ pct }) {
  return (
    <div className="relative h-[3px] bg-bloomberg-border rounded-full">
      <div
        className="absolute top-1/2 w-2.5 h-2.5 bg-bloomberg-orange rounded-full"
        style={{ left: `${pct}%`, transform: 'translateX(-50%) translateY(-50%)' }}
      />
    </div>
  );
}
RangeDot.propTypes = { pct: PropTypes.number };
