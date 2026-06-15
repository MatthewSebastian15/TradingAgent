import React from 'react';
import PropTypes from 'prop-types';
import { MARKET_CATEGORIES, MARKET_CATEGORY_LABELS } from '../../utils/marketDefaults';

export default function MarketCategoryTabs({ activeCategory, onChangeCategory }) {
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {MARKET_CATEGORIES.map((category) => {
        const active = category === activeCategory;
        return (
          <button
            key={category}
            type="button"
            onClick={() => onChangeCategory(category)}
            className={`border px-3 py-1.5 font-mono text-[11px] font-bold tracking-wider ${
              active
                ? 'border-bloomberg-orange bg-bloomberg-orange text-black'
                : 'border-bloomberg-border bg-black text-bloomberg-amber hover:border-bloomberg-orange hover:text-bloomberg-orange'
            }`}
          >
            {MARKET_CATEGORY_LABELS[category]}
          </button>
        );
      })}
    </div>
  );
}

MarketCategoryTabs.propTypes = {
  activeCategory: PropTypes.string.isRequired,
  onChangeCategory: PropTypes.func.isRequired,
};
