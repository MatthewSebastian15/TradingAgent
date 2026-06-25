import { useEffect, useState } from 'react';

import { useAnalysisJob } from './useAnalysisJob';
import { useWatchlistStore } from './useWatchlistStore';
import {
  buildAnalysisPayload,
  DEFAULT_DEBATE_ROUNDS,
  today,
  validateAnalysisInput,
} from '../domain/analysisContract';

export function apiToDisplayDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : String(value || '');
}

export function displayToApiDate(value) {
  const match = String(value || '')
    .trim()
    .match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
}

/**
 * Owns all StockForm state, result hydration, and submit/validation logic.
 * StockForm itself is left as pure render over what this returns.
 */
export function useStockForm({
  onResult,
  onLoading,
  onStatus,
  onAgentProgress,
  useAnalysisJobHook = useAnalysisJob,
  selectedResult = null,
}) {
  const [ticker, setTicker] = useState('');
  const [date, setDate] = useState(apiToDisplayDate(today()));
  const [rounds, setRounds] = useState(DEFAULT_DEBATE_ROUNDS);
  const [timeHorizonMonths, setTimeHorizonMonths] = useState(1);
  const [analysisDepth, setDepth] = useState('balanced');
  const [responseDetail, setDetail] = useState('full');
  const [hasExistingPosition, setHasExistingPosition] = useState(false);
  const [positionQuantity, setPositionQuantity] = useState('');
  const [averageEntryPrice, setAverageEntryPrice] = useState('');
  const [error, setError] = useState('');
  const { running, startAnalysis, stopAnalysis } = useAnalysisJobHook({
    onResult,
    onLoading,
    onStatus,
    onAgentProgress,
  });
  const { activeGroup } = useWatchlistStore();
  const watchlistItems = activeGroup?.items || [];

  useEffect(() => {
    if (!selectedResult || selectedResult.error || running) return;

    const resultTicker = String(
      selectedResult.normalized_ticker || selectedResult.ticker || selectedResult.input_ticker || ''
    )
      .trim()
      .toUpperCase();

    if (resultTicker) setTicker(resultTicker);
    if (selectedResult.trade_date) setDate(apiToDisplayDate(selectedResult.trade_date));
    if (selectedResult.time_horizon_months) {
      setTimeHorizonMonths(Number(selectedResult.time_horizon_months));
    }
    if (selectedResult.max_debate_rounds) setRounds(Number(selectedResult.max_debate_rounds));
    if (selectedResult.analysis_depth) setDepth(selectedResult.analysis_depth);
    if (selectedResult.response_detail) setDetail(selectedResult.response_detail);

    const hasPosition = Boolean(selectedResult.has_existing_position);
    setHasExistingPosition(hasPosition);
    setPositionQuantity(
      hasPosition &&
        selectedResult.position_quantity !== null &&
        selectedResult.position_quantity !== undefined
        ? String(selectedResult.position_quantity)
        : ''
    );
    setAverageEntryPrice(
      hasPosition &&
        selectedResult.average_entry_price !== null &&
        selectedResult.average_entry_price !== undefined
        ? String(selectedResult.average_entry_price)
        : ''
    );
    setError('');
  }, [running, selectedResult]);

  async function runAnalysis(submitTicker) {
    const apiDate = displayToApiDate(date);
    if (!apiDate) {
      const validationError = 'Date must be DD-MM-YYYY';
      setError(validationError);
      onResult({ error: validationError });
      return;
    }

    const validationError = validateAnalysisInput({
      ticker: submitTicker,
      date: apiDate,
      timeHorizonMonths,
      rounds,
      analysisDepth,
      responseDetail,
    });
    if (validationError) {
      setError(validationError);
      onResult({ error: validationError });
      return;
    }

    setError('');
    await startAnalysis(
      buildAnalysisPayload({
        ticker: submitTicker,
        date: apiDate,
        timeHorizonMonths,
        rounds,
        analysisDepth,
        responseDetail,
        hasExistingPosition,
        positionQuantity: hasExistingPosition ? positionQuantity || null : null,
        averageEntryPrice: hasExistingPosition ? averageEntryPrice || null : null,
      })
    );
  }

  async function handleWatchlistTicker(item) {
    if (running) return;
    setTicker(item.symbol);
    await runAnalysis(item.symbol);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (running) {
      stopAnalysis();
      return;
    }
    await runAnalysis(ticker);
  }

  return {
    ticker,
    setTicker,
    date,
    setDate,
    rounds,
    setRounds,
    timeHorizonMonths,
    setTimeHorizonMonths,
    analysisDepth,
    setDepth,
    responseDetail,
    setDetail,
    hasExistingPosition,
    setHasExistingPosition,
    positionQuantity,
    setPositionQuantity,
    averageEntryPrice,
    setAverageEntryPrice,
    error,
    setError,
    running,
    watchlistItems,
    handleSubmit,
    handleWatchlistTicker,
  };
}
