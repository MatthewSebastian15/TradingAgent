import {
  Activity,
  Calculator,
  ChartColumn,
  ChevronLeft,
  ChevronRight,
  History,
  LayoutDashboard,
  Network,
  Scale,
  ShieldAlert,
  Shuffle,
  Sigma,
  Zap,
} from 'lucide-react';
import PropTypes from 'prop-types';

import { SECTION_GROUPS, SECTIONS } from './config';
import { SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_EXPANDED_WIDTH } from '../../../../constants/sidebar';

const SECTION_ICONS = {
  overview: LayoutDashboard,
  volatility: Activity,
  risk: ShieldAlert,
  distribution: ChartColumn,
  scenario: Zap,
  stochastic: Shuffle,
  backtest: History,
  sizing: Scale,
  correlation: Network,
  options: Sigma,
  valuation: Calculator,
};

const FOCUS =
  'focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-bloomberg-orange';
const SHELL =
  'top-[60px] h-[calc(100vh-60px)] shrink-0 border-r border-bloomberg-border bg-bloomberg-surface';

// Primary Quant navigation. Expanded below `lg` it floats over the content (drawer);
// collapsed it is a 48px icon rail matching the app nav rail.
export function QuantSidebar({ collapsed, onToggle, activeSection, onSelectSection, children }) {
  if (collapsed) {
    return (
      <nav
        aria-label="Quant sections"
        className={`sticky flex flex-col items-stretch py-1 ${SHELL} ${SIDEBAR_COLLAPSED_WIDTH}`}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-label="Expand sidebar"
          className={`flex h-9 items-center justify-center text-bloomberg-orange ${FOCUS}`}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
        {SECTIONS.map((s) => {
          const Icon = SECTION_ICONS[s.id];
          const active = s.id === activeSection;
          return (
            <button
              key={s.id}
              type="button"
              aria-label={s.label}
              title={s.label}
              aria-current={active ? 'page' : undefined}
              onClick={() => onSelectSection(s.id)}
              className={`flex h-9 items-center justify-center border-l-2 ${FOCUS} ${
                active
                  ? 'border-l-bloomberg-orange bg-bloomberg-orange/10 text-bloomberg-orange'
                  : 'border-l-transparent text-bloomberg-white/80 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <aside
      className={`sticky flex flex-col overflow-y-auto transition-all duration-200 max-lg:fixed max-lg:left-10 max-lg:z-40 max-lg:shadow-xl max-lg:shadow-black/70 [&::-webkit-scrollbar]:hidden ${SHELL} ${SIDEBAR_EXPANDED_WIDTH}`}
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-bloomberg-border px-3">
        <span className="font-mono text-[11px] font-bold tracking-[0.2em] text-bloomberg-orange uppercase">
          Quant
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-label="Collapse sidebar"
          className={`text-bloomberg-orange ${FOCUS}`}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="space-y-4 p-3">{children}</div>

      <nav aria-label="Quant sections" className="border-t border-bloomberg-border py-2">
        {SECTION_GROUPS.map((group) => (
          <div key={group.id} className="mb-2">
            <div
              id={`quant-nav-group-${group.id}`}
              className="px-3 pb-1 font-mono text-[10px] tracking-[0.12em] text-bloomberg-white/80 uppercase"
            >
              {group.label}
            </div>
            <ul aria-labelledby={`quant-nav-group-${group.id}`}>
              {SECTIONS.filter((s) => s.group === group.id).map((s) => {
                const Icon = SECTION_ICONS[s.id];
                const active = s.id === activeSection;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      aria-current={active ? 'page' : undefined}
                      onClick={() => onSelectSection(s.id)}
                      className={`flex h-8 w-full items-center gap-2 border-l-2 px-3 text-left font-mono text-[11px] tracking-wider uppercase ${FOCUS} ${
                        active
                          ? 'border-l-bloomberg-orange bg-bloomberg-orange/10 text-bloomberg-orange'
                          : 'border-l-transparent text-bloomberg-white/80 hover:bg-bloomberg-bg hover:text-white'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {s.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}

QuantSidebar.propTypes = {
  collapsed: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  activeSection: PropTypes.string.isRequired,
  onSelectSection: PropTypes.func.isRequired,
  children: PropTypes.node,
};
