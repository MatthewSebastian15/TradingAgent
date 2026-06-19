import { MoreVertical, Plus, Trash2 } from 'lucide-react';
import PropTypes from 'prop-types';
import React, { useState } from 'react';

import WatchlistDeleteGroupDialog from './WatchlistDeleteGroupDialog';

export default function WatchlistGroupBar({
  groups,
  activeGroupId,
  onSelectGroup,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
}) {
  const [menuGroupId, setMenuGroupId] = useState(null);
  const [deleteGroup, setDeleteGroup] = useState(null);
  const activeGroup = groups.find((group) => group.id === activeGroupId) || null;

  function handleDeleteGroup(group) {
    setMenuGroupId(null);
    setDeleteGroup(group);
  }

  function handleConfirmDelete(groupId) {
    setDeleteGroup(null);
    onDeleteGroup(groupId);
  }

  function handleRenameGroup(group) {
    setMenuGroupId(null);
    onRenameGroup(group);
  }

  return (
    <>
      <div className="flex min-h-9 items-center gap-2">
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-0.5">
          {groups.map((group) => {
            const active = group.id === activeGroupId;

            return (
              <button
                key={group.id}
                type="button"
                onClick={() => onSelectGroup(group.id)}
                className={`h-9 shrink-0 border px-3 font-mono text-xs font-bold uppercase tracking-wider transition-colors ${
                  active
                    ? 'border-bloomberg-orange bg-bloomberg-orange/15 text-bloomberg-orange'
                    : 'border-bloomberg-border bg-black text-bloomberg-muted hover:bg-bloomberg-surface hover:text-bloomberg-white'
                }`}
              >
                {group.name}
              </button>
            );
          })}
        </div>

        {activeGroup && (
          <div className="relative shrink-0">
            <button
              type="button"
              aria-label="Watchlist group menu"
              onClick={() => setMenuGroupId((current) => (current ? null : activeGroup.id))}
              className="flex h-9 w-9 items-center justify-center border border-bloomberg-border bg-black text-bloomberg-muted hover:bg-bloomberg-surface hover:text-bloomberg-white"
            >
              <MoreVertical className="h-4 w-4" />
            </button>

            {menuGroupId === activeGroup.id && (
              <div className="absolute right-0 top-10 z-40 w-36 border border-bloomberg-border bg-black shadow-xl shadow-black/60">
                <button
                  type="button"
                  onClick={() => handleRenameGroup(activeGroup)}
                  className="block h-9 w-full px-3 text-left font-mono text-xs uppercase tracking-wider text-bloomberg-muted hover:bg-bloomberg-surface hover:text-bloomberg-white"
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteGroup(activeGroup)}
                  className="flex h-9 w-full items-center gap-2 px-3 text-left font-mono text-xs uppercase tracking-wider text-bloomberg-red hover:bg-bloomberg-red/10"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onCreateGroup}
          className="flex h-9 shrink-0 items-center gap-1 border border-bloomberg-orange bg-bloomberg-orange px-3 font-mono text-xs font-bold uppercase tracking-wider text-black hover:bg-orange-400"
        >
          <Plus className="h-3.5 w-3.5" /> GROUP
        </button>
      </div>

      <WatchlistDeleteGroupDialog
        group={deleteGroup}
        onCancel={() => setDeleteGroup(null)}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}

WatchlistGroupBar.propTypes = {
  groups: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
    })
  ).isRequired,
  activeGroupId: PropTypes.string,
  onSelectGroup: PropTypes.func.isRequired,
  onCreateGroup: PropTypes.func.isRequired,
  onRenameGroup: PropTypes.func.isRequired,
  onDeleteGroup: PropTypes.func.isRequired,
};
