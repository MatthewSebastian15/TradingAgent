import { Info } from 'lucide-react';
import PropTypes from 'prop-types';
import { useState } from 'react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Replaces the old <details> popover: Radix positions the panel inside the viewport,
// only one opens at a time per trigger, and Esc / outside click close it.
// Radix closes a tooltip on trigger click, so the click handler prevents that default
// and opens it instead (touch screens have no hover).
export function InfoTip({ label, side = 'top', children }) {
  const [open, setOpen] = useState(false);
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`About ${label}`}
            onPointerDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.preventDefault();
              setOpen(true);
            }}
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-none text-bloomberg-white/80 hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-bloomberg-orange"
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          collisionPadding={8}
          className="max-w-[18rem] rounded-none border border-bloomberg-border bg-black px-2 py-1.5 font-mono text-[11px] leading-relaxed text-bloomberg-white shadow-lg shadow-black/70"
        >
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

InfoTip.propTypes = {
  label: PropTypes.string.isRequired,
  side: PropTypes.oneOf(['top', 'right', 'bottom', 'left']),
  children: PropTypes.node.isRequired,
};
