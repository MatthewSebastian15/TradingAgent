import PropTypes from 'prop-types';
import React, { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export default function WatchlistGroupDialog({
  open,
  mode,
  initialName = '',
  existingNames,
  onCancel,
  onSubmit,
}) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setError('');
  }, [initialName, open]);

  const title = mode === 'rename' ? 'RENAME WATCHLIST GROUP' : 'CREATE WATCHLIST GROUP';
  const submitLabel = mode === 'rename' ? 'SAVE' : 'CREATE';

  const normalizedExistingNames = useMemo(
    () =>
      existingNames
        .filter((item) => item.trim().toLowerCase() !== initialName.trim().toLowerCase())
        .map((item) => item.trim().toLowerCase()),
    [existingNames, initialName]
  );

  function handleSubmit(event) {
    event.preventDefault();
    const trimmed = name.trim();

    if (!trimmed) {
      setError('Group name is required.');
      return;
    }

    if (trimmed.length > 40) {
      setError('Group name must be 40 characters or less.');
      return;
    }

    if (normalizedExistingNames.includes(trimmed.toLowerCase())) {
      setError('Group name already exists.');
      return;
    }

    onSubmit(trimmed);
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <DialogContent className="max-w-sm rounded-none border-bloomberg-border bg-black p-4 font-mono text-bloomberg-white">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm uppercase tracking-[0.16em] text-bloomberg-orange">
            {title}
          </DialogTitle>
        </DialogHeader>
        <DialogDescription className="sr-only">
          Create or rename a compact watchlist group.
        </DialogDescription>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError('');
            }}
            maxLength={40}
            autoFocus
            placeholder="Group name"
            className="h-10 rounded-none border-bloomberg-border bg-bloomberg-bg font-mono text-xs uppercase tracking-wider text-bloomberg-white focus-visible:ring-bloomberg-orange"
          />

          {error && <div className="text-xs text-bloomberg-red">{error}</div>}

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
              type="submit"
              className="h-9 rounded-none bg-bloomberg-orange font-mono text-xs font-bold text-black hover:bg-orange-400"
            >
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

WatchlistGroupDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  mode: PropTypes.oneOf(['create', 'rename']).isRequired,
  initialName: PropTypes.string,
  existingNames: PropTypes.arrayOf(PropTypes.string).isRequired,
  onCancel: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
};
