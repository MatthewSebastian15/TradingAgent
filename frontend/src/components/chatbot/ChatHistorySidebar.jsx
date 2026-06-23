import { MessageSquare, SquarePen, Trash2 } from 'lucide-react';
import PropTypes from 'prop-types';
import { useState } from 'react';

import { SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_EXPANDED_WIDTH } from '../../constants/sidebar';

// Collapsed to a 48px icon rail; expands to 240px on hover to show titles.
export function ChatHistorySidebar({ conversations, activeId, onNew, onSelect, onDelete }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <aside
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className={`${expanded ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH} shrink-0 flex flex-col overflow-hidden border-r border-bloomberg-border bg-bloomberg-surface transition-[width] duration-150`}
    >
      <button
        type="button"
        onClick={onNew}
        title="New chat"
        className="flex items-center gap-2 m-2 px-2 py-2 rounded-lg bg-bloomberg-card border border-bloomberg-border text-bloomberg-white hover:border-bloomberg-orange"
      >
        <SquarePen size={18} className="shrink-0 text-bloomberg-orange" />
        {expanded && <span className="text-sm truncate">New Chat</span>}
      </button>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {conversations.map((c) => (
          <div
            key={c.id}
            onClick={() => onSelect(c.id)}
            title={c.title}
            className={`group flex items-center gap-2 mx-2 my-0.5 px-2 py-2 rounded-lg cursor-pointer ${
              c.id === activeId ? 'bg-bloomberg-card' : 'hover:bg-bloomberg-card/50'
            }`}
          >
            <MessageSquare
              size={16}
              className={`shrink-0 ${c.id === activeId ? 'text-bloomberg-orange' : 'text-bloomberg-muted'}`}
            />
            {expanded && (
              <span className="flex-1 text-sm text-bloomberg-white truncate">{c.title}</span>
            )}
            {expanded && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(c.id);
                }}
                title="Delete chat"
                className="opacity-0 group-hover:opacity-100 text-bloomberg-muted hover:text-bloomberg-red"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}

ChatHistorySidebar.propTypes = {
  conversations: PropTypes.arrayOf(
    PropTypes.shape({ id: PropTypes.string, title: PropTypes.string })
  ).isRequired,
  activeId: PropTypes.string,
  onNew: PropTypes.func.isRequired,
  onSelect: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};
