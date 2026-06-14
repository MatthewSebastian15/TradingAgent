import PropTypes from 'prop-types';

function SparklesIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 flex-shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
      <path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 flex-shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18" />
      <path d="M6 12H4a2 2 0 0 0-2 2v8" />
      <path d="M18 9h2a2 2 0 0 1 2 2v11" />
      <path d="M10 6h4M10 10h4M10 14h4M10 18h4" />
    </svg>
  );
}

function BarChartIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 flex-shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 3v18h18" />
      <path d="M7 16V9" />
      <path d="M12 16V5" />
      <path d="M17 16v-4" />
    </svg>
  );
}

function CandlestickIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 flex-shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M6 2v4M6 14v8M4 6h4v8H4z" />
      <path d="M18 2v8M18 18v4M16 10h4v8h-4z" />
    </svg>
  );
}

function NewspaperIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 flex-shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 22h14a2 2 0 0 0 2-2V4H2v16a2 2 0 0 0 2 2Z" />
      <path d="M8 6h8M8 10h8M8 14h5M6 18h10" />
    </svg>
  );
}

const TABS = [
  { id: 'analisis', statusKey: 'analysis', label: 'AI Summary', Icon: SparklesIcon },
  { id: 'profile', statusKey: 'profile', label: 'Profil', Icon: BuildingIcon },
  { id: 'fundamental', statusKey: 'fundamental', label: 'Fundamental', Icon: BarChartIcon },
  { id: 'chart_price', statusKey: 'chart_price', label: 'Chart & Price', Icon: CandlestickIcon },
  { id: 'news', statusKey: 'news', label: 'News', Icon: NewspaperIcon },
];

function statusMeta(status, label) {
  const normalized = String(status || 'ok').toLowerCase();
  if (normalized === 'partial') {
    return {
      className: 'bg-bloomberg-amber',
      title: `${label} data is incomplete or partially available.`,
    };
  }
  if (normalized === 'warning') {
    return {
      className: 'bg-bloomberg-amber',
      title: `${label} has a data warning that should be reviewed.`,
    };
  }
  if (normalized === 'error') {
    return {
      className: 'bg-bloomberg-red',
      title: `${label} has a data error.`,
    };
  }
  return null;
}

export default function ResultTabs({ activeTab, onTabChange, disabledTabs = [], tabStatus = {} }) {
  return (
    <div className="bg-black border-b border-bloomberg-border px-4 py-2 flex flex-wrap gap-2">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        const isDisabled = disabledTabs.includes(tab.id);
        const meta =
          tab.id === 'fundamental' ? null : statusMeta(tabStatus?.[tab.statusKey], tab.label);
        const Icon = tab.Icon;

        return (
          <button
            key={tab.id}
            type="button"
            disabled={isDisabled}
            onClick={() => !isDisabled && onTabChange(tab.id)}
            className={`relative inline-flex items-center gap-2 font-mono text-xs px-3 py-2 border tracking-wider transition-colors ${
              isActive
                ? 'border-bloomberg-orange text-bloomberg-orange bg-bloomberg-surface'
                : 'border-bloomberg-border text-bloomberg-muted hover:text-bloomberg-white'
            } ${isDisabled ? 'opacity-50 cursor-not-allowed hover:text-bloomberg-muted' : ''}`}
          >
            <Icon />
            {tab.label}
            {meta && (
              <span
                title={meta.title}
                className={`absolute -right-1 -top-1 h-2 w-2 rounded-full ${meta.className}`}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

ResultTabs.propTypes = {
  activeTab: PropTypes.string.isRequired,
  onTabChange: PropTypes.func.isRequired,
  disabledTabs: PropTypes.arrayOf(PropTypes.string),
  tabStatus: PropTypes.object,
};
