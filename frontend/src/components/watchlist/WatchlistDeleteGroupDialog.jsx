import { AlertTriangle } from 'lucide-react';
import PropTypes from 'prop-types';
import React from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function WatchlistDeleteGroupDialog({ group, onCancel, onConfirm }) {
  const open = Boolean(group);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <DialogContent className="max-w-sm rounded-none border-bloomberg-border bg-black p-4 font-mono text-bloomberg-white shadow-2xl shadow-black/70">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center border border-bloomberg-red/50 bg-bloomberg-red/10 text-bloomberg-red">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <DialogTitle className="font-mono text-sm uppercase tracking-[0.16em] text-bloomberg-red">
              Delete watchlist group
            </DialogTitle>
          </div>
          <DialogDescription className="font-mono text-xs leading-5 text-bloomberg-muted">
            Delete <span className="font-bold text-bloomberg-white">{group?.name}</span>? This
            removes the group and all tickers inside it.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:space-x-0">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="h-9 rounded-none border-bloomberg-border bg-black font-mono text-xs text-bloomberg-muted hover:bg-bloomberg-surface hover:text-bloomberg-white"
          >
            CANCEL
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm(group.id)}
            className="h-9 rounded-none border border-bloomberg-red bg-bloomberg-red/15 font-mono text-xs font-bold text-bloomberg-red hover:bg-bloomberg-red hover:text-black"
          >
            DELETE
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

WatchlistDeleteGroupDialog.propTypes = {
  group: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
  }),
  onCancel: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
};
