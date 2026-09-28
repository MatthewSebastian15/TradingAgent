import { ChevronRight } from 'lucide-react';
import PropTypes from 'prop-types';

// Collapsed home for knobs most users never need (seed, costs, estimators).
export function AdvancedPanel({ label = 'Advanced', defaultOpen = false, children }) {
  return (
    <details
      open={defaultOpen || undefined}
      className="group border border-bloomberg-border font-mono text-[11px]"
    >
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2 py-1.5 tracking-wider text-bloomberg-white/80 uppercase hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-bloomberg-orange [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="h-3 w-3 transition-transform duration-150 group-open:rotate-90"
          aria-hidden="true"
        />
        {label}
      </summary>
      <div className="border-t border-bloomberg-border p-2">{children}</div>
    </details>
  );
}

AdvancedPanel.propTypes = {
  label: PropTypes.string,
  defaultOpen: PropTypes.bool,
  children: PropTypes.node.isRequired,
};
