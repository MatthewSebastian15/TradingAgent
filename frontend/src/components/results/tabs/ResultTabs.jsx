import PropTypes from 'prop-types';

const TABS = [
  { id: 'analisis', statusKey: 'analysis', label: 'Analisis' },
  { id: 'profile', statusKey: 'profile', label: 'Profil' },
  { id: 'fundamental', statusKey: 'fundamental', label: 'Fundamental' },
  { id: 'chart_price', statusKey: 'chart_price', label: 'Chart & Price' },
  { id: 'news', statusKey: 'news', label: 'News' },
  { id: 'risk_data_quality', statusKey: 'risk_data_quality', label: 'Risk / Data Quality' },
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
        const meta = statusMeta(tabStatus?.[tab.statusKey], tab.label);

        return (
          <button
            key={tab.id}
            type="button"
            disabled={isDisabled}
            onClick={() => !isDisabled && onTabChange(tab.id)}
            className={`relative font-mono text-xs px-3 py-2 border tracking-wider transition-colors ${
              isActive
                ? 'border-bloomberg-orange text-bloomberg-orange bg-bloomberg-surface'
                : 'border-bloomberg-border text-bloomberg-muted hover:text-bloomberg-white'
            } ${isDisabled ? 'opacity-50 cursor-not-allowed hover:text-bloomberg-muted' : ''}`}
          >
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
