import { cva } from 'class-variance-authority';

export const signalBadgeVariants = cva('gap-2 border font-mono text-xs uppercase tracking-wider', {
  variants: {
    signal: {
      BUY: 'border-green-500/60 bg-green-500/15 text-green-400',
      WAIT: 'border-yellow-500/60 bg-yellow-500/15 text-yellow-300',
      HOLD: 'border-neutral-500/60 bg-neutral-500/15 text-neutral-300',
      REDUCE: 'border-orange-500/60 bg-orange-500/15 text-orange-400',
      SELL: 'border-red-500/60 bg-red-500/15 text-red-400',
    },
  },
  defaultVariants: {
    signal: 'HOLD',
  },
});
