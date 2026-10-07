import PropTypes from 'prop-types';

import { sectionById, SKELETON_LAYOUTS } from './config';
import { CARD_GRID, FIELD_GRID } from './layout';

const PULSE = 'animate-pulse bg-bloomberg-surface';

function Block({ kind }) {
  const cards = kind.startsWith('cards') ? Number(kind.slice(5)) : 0;
  if (cards > 0) {
    return (
      <div data-block={kind} className={CARD_GRID}>
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className={`h-[5.5rem] border border-bloomberg-border ${PULSE}`} />
        ))}
      </div>
    );
  }
  if (kind === 'fields') {
    return (
      <div data-block={kind} className={FIELD_GRID}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={`h-14 ${PULSE}`} />
        ))}
      </div>
    );
  }
  const shape = {
    text: 'h-4 w-2/3',
    chart: 'h-[290px] w-full border border-bloomberg-border',
    table: 'h-40 w-full border border-bloomberg-border',
    chips: 'h-7 w-80 max-w-full',
    context: 'h-12 w-full border border-bloomberg-border',
    headline: 'h-11 w-full border border-bloomberg-border',
  }[kind];
  return <div data-block={kind} className={`${shape} ${PULSE}`} />;
}

Block.propTypes = { kind: PropTypes.string.isRequired };

export function SectionSkeleton({ section }) {
  const meta = sectionById(section) || sectionById('overview');
  return (
    <div role="status" aria-label={`Loading ${meta.label}`} className="space-y-4 p-4">
      <div aria-hidden="true" className="space-y-4">
        <Block kind="context" />
        <Block kind="headline" />
        {SKELETON_LAYOUTS[meta.id].map((kind, i) => (
          <Block key={`${kind}-${i}`} kind={kind} />
        ))}
      </div>
    </div>
  );
}

SectionSkeleton.propTypes = { section: PropTypes.string.isRequired };
