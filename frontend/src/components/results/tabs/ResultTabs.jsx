import PropTypes from 'prop-types';

const TABS = [
  { id: 'analisis', label: 'Analisis' },
  { id: 'profile', label: 'Profile' },
  { id: 'chart_price', label: 'Chart & Price' },
  { id: 'news', label: 'News' },
];

export default function ResultTabs({ activeTab, onTabChange, disabledTabs = [] }) {
  return (
    <div className="bg-black border-b border-bloomberg-border px-4 py-2 flex flex-wrap gap-2">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        const isDisabled = disabledTabs.includes(tab.id);

        return (
          <button
            key={tab.id}
            type="button"
            disabled={isDisabled}
            onClick={() => !isDisabled && onTabChange(tab.id)}
            className={`font-mono text-xs px-3 py-2 border tracking-wider transition-colors ${
              isActive
                ? 'border-bloomberg-orange text-bloomberg-orange bg-bloomberg-surface'
                : 'border-bloomberg-border text-bloomberg-muted hover:text-bloomberg-white'
            } ${isDisabled ? 'opacity-50 cursor-not-allowed hover:text-bloomberg-muted' : ''}`}
          >
            {tab.label}
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
};
