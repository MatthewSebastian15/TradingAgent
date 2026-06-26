import PropTypes from 'prop-types';
import React from 'react';

import AnalysisStatusRow from './AnalysisStatusRow';
import { formatPrice } from '../../utils/formatting';
import {
  formatVolatilityValue,
  hasDisplayValue,
  parseBold,
  volatilitySubValue,
} from '../../utils/resultCardFormatters';

function getActionPlanMetrics({ result, currentPrice, riskReward }) {
  return [
    {
      label: 'CURRENT PRICE',
      value: hasDisplayValue(currentPrice)
        ? formatPrice(currentPrice, result.ticker, result.price_currency || result.currency)
        : 'N/A',
      highlight: true,
    },
    {
      label: 'ENTRY',
      value: hasDisplayValue(result.entry_price)
        ? formatPrice(result.entry_price, result.ticker, result.price_currency || result.currency)
        : 'N/A',
    },
    {
      label: 'STOP LOSS',
      value: hasDisplayValue(result.stop_loss)
        ? formatPrice(result.stop_loss, result.ticker, result.price_currency || result.currency)
        : 'N/A',
    },
    {
      label: 'TAKE PROFIT',
      value: hasDisplayValue(result.take_profit)
        ? formatPrice(result.take_profit, result.ticker, result.price_currency || result.currency)
        : 'N/A',
    },
    {
      label: 'MAX DRAWDOWN',
      value: result.max_drawdown_estimate || 'N/A',
    },
    {
      label: 'VOLATILITY',
      value: result.volatility_level || 'N/A',
    },
    {
      label: 'VOLATILITY SCORE',
      value: formatVolatilityValue(result) || 'N/A',
      subValue: volatilitySubValue(result),
      tooltip:
        result.volatility_method ||
        'Calculated from annualized daily return volatility, normalized to 0–100 scale. Higher score means higher price swings.',
    },
    {
      label: 'REBALANCING',
      value: result.rebalancing_action || 'N/A',
    },
    {
      label: 'POSITION ACTION',
      value: result.position_action || 'N/A',
    },
    {
      label: 'NEW ENTRY ACTION',
      value: result.new_entry_action || 'N/A',
    },
    {
      label: 'POSITION SIZE HINT',
      value: result.position_size_hint || 'N/A',
    },
    {
      label: 'R/R RATIO',
      value: riskReward || 'N/A',
      highlight: true,
    },
  ];
}

export function ActionableMetrics({ result, currentPrice, riskReward }) {
  const metrics = getActionPlanMetrics({ result, currentPrice, riskReward }).map((metric) => ({
    ...metric,
    dataTestId: 'action-plan-metric',
  }));

  return (
    <AnalysisStatusRow
      label="ACTION PLAN"
      metrics={metrics}
      columnsClass="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2"
      reason={result.position_sizing_reason}
      reasonRenderer={parseBold}
    />
  );
}

ActionableMetrics.propTypes = {
  result: PropTypes.object.isRequired,
  currentPrice: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  riskReward: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
};

export function HoldMetrics({ result, currentPrice }) {
  const hasHoldMetrics =
    hasDisplayValue(currentPrice) ||
    result.volatility_level ||
    hasDisplayValue(result.volatility_score) ||
    result.rebalancing_action ||
    result.new_entry_action ||
    result.position_size_hint;

  if (!hasHoldMetrics) return null;

  const metrics = [
    {
      label: 'CURRENT PRICE',
      value: hasDisplayValue(currentPrice)
        ? formatPrice(currentPrice, result.ticker, result.price_currency || result.currency)
        : 'N/A',
      highlight: true,
    },
    { label: 'VOLATILITY', value: result.volatility_level || 'N/A' },
    {
      label: 'VOLATILITY SCORE',
      value: formatVolatilityValue(result) || 'N/A',
      subValue: volatilitySubValue(result),
      tooltip:
        result.volatility_method ||
        'Calculated from annualized daily return volatility, normalized to 0–100 scale. Higher score means higher price swings.',
    },
    { label: 'REBALANCING', value: result.rebalancing_action || 'N/A' },
    { label: 'NEW ENTRY ACTION', value: result.new_entry_action || 'N/A' },
    { label: 'POSITION SIZE HINT', value: result.position_size_hint || 'N/A' },
  ];

  return (
    <AnalysisStatusRow
      label="ACTION STATUS"
      metrics={metrics}
      columnsClass="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2"
    />
  );
}

HoldMetrics.propTypes = {
  result: PropTypes.object.isRequired,
  currentPrice: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
};
