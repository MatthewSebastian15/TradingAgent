import { BarChart3, Building2, CandlestickChart, Newspaper, Sigma, Sparkles } from 'lucide-react';
import PropTypes from 'prop-types';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const TABS = [
  { id: 'analisis', statusKey: 'analysis', label: 'AI Summary', Icon: Sparkles },
  { id: 'profile', statusKey: 'profile', label: 'Profil', Icon: Building2 },
  { id: 'fundamental', statusKey: 'fundamental', label: 'Fundamental', Icon: BarChart3 },
  { id: 'chart_price', statusKey: 'chart_price', label: 'Chart & Price', Icon: CandlestickChart },
  { id: 'news', statusKey: 'news', label: 'News', Icon: Newspaper },
  { id: 'quant', statusKey: 'quant', label: 'Quant', Icon: Sigma },
];

function statusMeta(status, label) {
  const normalized = String(status || 'ok').toLowerCase();
  if (normalized === 'partial') {
    return {
      className: 'bg-yellow-400',
      title: `${label} data is incomplete or partially available.`,
    };
  }
  if (normalized === 'warning') {
    return {
      className: 'bg-yellow-400',
      title: `${label} has a data warning that should be reviewed.`,
    };
  }
  if (normalized === 'error') {
    return {
      className: 'bg-red-500',
      title: `${label} has a data error.`,
    };
  }
  return null;
}

export default function ResultTabs({ activeTab, onTabChange, disabledTabs = [], tabStatus = {} }) {
  return (
    <Tabs
      value={activeTab}
      onValueChange={onTabChange}
      className="border-b border-border bg-black p-1.5"
    >
      <TabsList className="h-auto flex-wrap justify-start gap-1.5 bg-transparent p-0">
        {TABS.map((tab) => {
          const isDisabled = disabledTabs.includes(tab.id);
          const meta =
            tab.id === 'fundamental' ? null : statusMeta(tabStatus?.[tab.statusKey], tab.label);
          const Icon = tab.Icon;

          return (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              disabled={isDisabled}
              onClick={() => {
                if (!isDisabled) onTabChange(tab.id);
              }}
              className="relative gap-1.5 rounded-md border border-border px-3 py-1.5 font-mono text-xs tracking-wide text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-card data-[state=active]:text-primary"
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {tab.label}
              {meta && (
                <span
                  title={meta.title}
                  className={`absolute -right-1 -top-1 h-2 w-2 rounded-full ${meta.className}`}
                />
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}

ResultTabs.propTypes = {
  activeTab: PropTypes.string.isRequired,
  disabledTabs: PropTypes.arrayOf(PropTypes.string),
  onTabChange: PropTypes.func.isRequired,
  tabStatus: PropTypes.object,
};
