import PropTypes from 'prop-types';
import React from 'react';

import { Button } from '@/components/ui/button';

import { MARKET_CATEGORIES, MARKET_CATEGORY_LABELS } from '../../utils/marketDefaults';

export default function MarketCategoryTabs({ activeCategory, onChangeCategory }) {
  return (
    <div className="flex flex-wrap gap-1 lg:justify-end">
      {MARKET_CATEGORIES.map((category) => {
        const active = category === activeCategory;
        return (
          <Button
            key={category}
            type="button"
            variant={active ? 'default' : 'outline'}
            size="sm"
            onClick={() => onChangeCategory(category)}
            className={`h-7 rounded-full px-2.5 font-mono text-[10px] font-bold tracking-wider ${
              active
                ? 'bg-bloomberg-orange text-black shadow-sm shadow-bloomberg-orange/20 hover:bg-bloomberg-orange/90'
                : 'border-bloomberg-border bg-black/60 text-bloomberg-amber hover:border-bloomberg-orange hover:bg-bloomberg-orange/10 hover:text-bloomberg-orange'
            }`}
          >
            {MARKET_CATEGORY_LABELS[category]}
          </Button>
        );
      })}
    </div>
  );
}

MarketCategoryTabs.propTypes = {
  activeCategory: PropTypes.string.isRequired,
  onChangeCategory: PropTypes.func.isRequired,
};
