import PropTypes from 'prop-types';
import { useRef } from 'react';

import { SECTIONS } from './config';

const STEP = { ArrowRight: 1, ArrowLeft: -1 };

// Tab bar for the embedded panel (AI-agent result). The Quant page uses QuantSidebar.
export function SectionTabs({ activeId, onSelect, idPrefix }) {
  const refs = useRef({});

  const handleKeyDown = (event, index) => {
    let next = null;
    if (event.key in STEP) next = (index + STEP[event.key] + SECTIONS.length) % SECTIONS.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = SECTIONS.length - 1;
    if (next === null) return;
    event.preventDefault();
    const { id } = SECTIONS[next];
    onSelect(id);
    refs.current[id]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Quant sections"
      className="flex flex-wrap border-b border-bloomberg-border"
    >
      {SECTIONS.map((s, i) => {
        const active = s.id === activeId;
        const newGroup = i > 0 && SECTIONS[i - 1].group !== s.group;
        return (
          <button
            key={s.id}
            ref={(el) => {
              refs.current[s.id] = el;
            }}
            id={`${idPrefix}-tab-${s.id}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`${idPrefix}-panel-${s.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(s.id)}
            onKeyDown={(event) => handleKeyDown(event, i)}
            className={`px-3 py-1.5 font-mono text-[11px] tracking-wider uppercase focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-bloomberg-orange ${
              newGroup ? 'ml-3' : ''
            } ${
              active
                ? 'bg-bloomberg-orange text-black'
                : 'text-bloomberg-white/80 hover:bg-bloomberg-surface hover:text-white'
            }`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

SectionTabs.propTypes = {
  activeId: PropTypes.string.isRequired,
  onSelect: PropTypes.func.isRequired,
  idPrefix: PropTypes.string.isRequired,
};
