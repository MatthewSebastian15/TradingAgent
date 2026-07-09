import PropTypes from 'prop-types';
import { memo, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';

import FinancialHighlightsTable from '../FinancialHighlightsTable';
import { FundamentalChartsPanel } from './fundamental/charts';
import { FUNDAMENTAL_GROUPS, FUNDAMENTAL_VIEW_MODES } from './fundamental/config';
import {
  appendLegacyFundamentalSections,
  groupFundamentalTableHighlights,
} from './fundamental/helpers';

function FundamentalTab({ financialHighlights, result = {} }) {
  const [selectedFundamentalGroup, setSelectedFundamentalGroup] = useState('income');
  const [fundamentalViewMode, setFundamentalViewMode] = useState('table');
  const activeGroup =
    FUNDAMENTAL_GROUPS.find((group) => group.id === selectedFundamentalGroup) ||
    FUNDAMENTAL_GROUPS[0];
  const safeResult = useMemo(() => result ?? {}, [result]);
  const tablePayload = useMemo(
    () => appendLegacyFundamentalSections(financialHighlights, safeResult),
    [financialHighlights, safeResult]
  );
  const groupedTablePayload = useMemo(
    () => groupFundamentalTableHighlights(tablePayload, activeGroup),
    [tablePayload, activeGroup]
  );

  return (
    <>
      <div className="border-b border-bloomberg-border bg-black px-4 py-3">
        <div className="flex gap-2 overflow-x-auto">
          {FUNDAMENTAL_GROUPS.map((group) => {
            const isActive = group.id === activeGroup.id;
            const Icon = group.Icon;
            return (
              <Button
                key={group.id}
                type="button"
                variant={isActive ? 'default' : 'outline'}
                size="sm"
                aria-pressed={isActive}
                onClick={() => setSelectedFundamentalGroup(group.id)}
                className={`h-10 whitespace-nowrap rounded-md border px-3 font-mono text-xs uppercase tracking-wider ${
                  isActive
                    ? 'border-bloomberg-orange bg-bloomberg-surface text-bloomberg-orange'
                    : 'border-bloomberg-border bg-black text-bloomberg-muted hover:border-bloomberg-orange hover:text-bloomberg-white'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {group.label}
              </Button>
            );
          })}
        </div>
      </div>
      <div className="border-b border-bloomberg-border bg-black px-4 py-3">
        <div className="flex gap-2" aria-label="Fundamental view mode">
          {FUNDAMENTAL_VIEW_MODES.map((mode) => {
            const isActive = mode.id === fundamentalViewMode;
            const Icon = mode.Icon;
            return (
              <Button
                key={mode.id}
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={isActive}
                onClick={() => setFundamentalViewMode(mode.id)}
                className={`h-8 gap-0 rounded-md border px-3 font-mono text-xs uppercase tracking-wider [&_svg]:h-3.5 [&_svg]:w-3.5 ${
                  isActive
                    ? 'border-bloomberg-orange bg-bloomberg-surface text-bloomberg-orange'
                    : 'border-bloomberg-border bg-black text-bloomberg-muted hover:border-bloomberg-orange hover:bg-bloomberg-card hover:text-bloomberg-white'
                }`}
              >
                <Icon className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                {mode.label}
              </Button>
            );
          })}
        </div>
      </div>
      {fundamentalViewMode === 'table' ? (
        <FinancialHighlightsTable financialHighlights={groupedTablePayload} />
      ) : (
        <FundamentalChartsPanel financialHighlights={tablePayload} activeGroup={activeGroup} />
      )}
    </>
  );
}

FundamentalTab.propTypes = {
  financialHighlights: PropTypes.object,
  result: PropTypes.object,
};

export default memo(FundamentalTab);
