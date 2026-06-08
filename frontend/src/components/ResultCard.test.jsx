import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import ResultCard from './ResultCard';
import {
  MOCK_HOLD_RESPONSE,
  MOCK_IDX_NEWS_UNAVAILABLE_RESPONSE,
  MOCK_MISSING_PRICE_RESPONSE,
  MOCK_PTRO_WAIT_RESPONSE,
  MOCK_RESPONSE,
  MOCK_SELL_RESPONSE,
  MOCK_TPIA_REDUCE_SCENARIO_RESPONSE,
} from '../../dev/mockData';

function countWords(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

describe('ResultCard risk-engine contract', () => {
  afterEach(() => cleanup());

  it('renders the full disclaimer permanently without expand or collapse controls', () => {
    render(<ResultCard result={MOCK_HOLD_RESPONSE} />);

    expect(screen.getByText(/Disclaimer/i)).toBeTruthy();
    expect(screen.getByText(/automated AI-assisted analysis engine/i)).toBeTruthy();
    expect(screen.getByText(/may contain errors/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /read full disclaimer/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /hide disclaimer/i })).toBeNull();
  });

  it('keeps the full disclaimer visible across all result tabs', () => {
    render(<ResultCard result={MOCK_RESPONSE} />);

    expect(screen.getByText(/automated AI-assisted analysis engine/i)).toBeTruthy();

    fireEvent.click(screen.getByText('Profil'));
    expect(screen.getByText(/automated AI-assisted analysis engine/i)).toBeTruthy();

    fireEvent.click(screen.getByText('Fundamental'));
    expect(screen.getByText(/automated AI-assisted analysis engine/i)).toBeTruthy();

    fireEvent.click(screen.getByText('Chart & Price'));
    expect(screen.getByText(/automated AI-assisted analysis engine/i)).toBeTruthy();

    fireEvent.click(screen.getByText('News'));
    expect(screen.getByText(/automated AI-assisted analysis engine/i)).toBeTruthy();
  });

  it('does not render Key Levels in the Analisis tab', () => {
    render(<ResultCard result={MOCK_RESPONSE} />);

    expect(screen.getByText('EXECUTIVE SUMMARY')).toBeTruthy();
    expect(screen.queryByText('KEY LEVELS')).toBeNull();
    expect(screen.queryByText('Nearest Support')).toBeNull();
    expect(screen.queryByText('Nearest Resistance')).toBeNull();
    expect(screen.queryByText('Invalidation Level')).toBeNull();
  });

  it('renders recommendation reasons and risk summary as one paragraph between 100 and 150 words', () => {
    const keyReasonsParagraph =
      'The recommendation is supported by improving earnings visibility, resilient margin structure, disciplined balance sheet quality, and a more balanced risk/reward setup. Price momentum remains constructive, but the model still requires confirmation from fresh market data and reliable vendor inputs before increasing conviction. News flow and catalyst quality should be monitored because valuation sensitivity can reduce upside if earnings delivery weakens. Position sizing should remain controlled until volatility, liquidity, thesis confirmation, entry timing, and source reliability improve together.';
    const miniRiskSummary =
      'Main risks include earnings miss, crowded positioning, valuation compression, stale market data, weaker liquidity, and negative catalyst surprises, so sizing must stay moderate and stop discipline must remain active.';

    const result = {
      ...MOCK_RESPONSE,
      key_reasons_paragraph: keyReasonsParagraph,
      mini_risk_summary: miniRiskSummary,
      analysis_overview: {
        ...MOCK_RESPONSE.analysis_overview,
        key_reasons_paragraph: keyReasonsParagraph,
      },
    };

    const { container } = render(<ResultCard result={result} />);

    const paragraph = screen.getByText((content) =>
      content.includes('The recommendation is supported by improving earnings visibility')
    );
    const section = paragraph.closest('.px-4');

    expect(paragraph).toBeTruthy();
    expect(section.querySelector('ul')).toBeNull();
    expect(section.querySelector('li')).toBeNull();
    expect(paragraph.textContent).not.toContain('+');
    expect(paragraph.textContent).toContain('Main risks include earnings miss');
    expect(countWords(paragraph.textContent)).toBeGreaterThanOrEqual(100);
    expect(countWords(paragraph.textContent)).toBeLessThanOrEqual(150);
    expect(container.textContent).toContain('KEY REASONS & RISK SUMMARY');
    expect(container.textContent).not.toContain('MINI RISK SUMMARY');
  });

  it('truncates an overly long recommendation and risk paragraph to 150 words', () => {
    const longParagraph = Array.from({ length: 180 }, (_, index) => `word${index + 1}`).join(' ');

    const result = {
      ...MOCK_RESPONSE,
      key_reasons_paragraph: longParagraph,
      mini_risk_summary:
        'Risk remains elevated while source freshness and execution levels need confirmation.',
      analysis_overview: {
        ...MOCK_RESPONSE.analysis_overview,
        key_reasons_paragraph: longParagraph,
      },
    };

    render(<ResultCard result={result} />);

    const paragraph = screen.getByText((content) => content.startsWith('word1 word2 word3'));

    expect(paragraph).toBeTruthy();
    expect(countWords(paragraph.textContent)).toBeLessThanOrEqual(150);
  });

  it('renders compact Agent Pipeline without expanded detail rows', () => {
    render(
      <ResultCard
        result={{
          ...MOCK_RESPONSE,
          agent_pipeline: [
            {
              name: 'Custom Risk Agent',
              role: 'Checks drawdown, liquidity, and sizing limits.',
              status: 'ok',
              output_summary: 'Risk is acceptable with moderate allocation.',
              duration_seconds: 4.25,
            },
          ],
          total_pipeline_seconds: 4.25,
        }}
      />
    );

    expect(screen.getByText('Agent Pipeline')).toBeTruthy();
    expect(screen.getByText('Custom Risk Agent')).toBeTruthy();
    expect(screen.getByText(/Execution: 4\.3s · 1\/1 completed/)).toBeTruthy();
    expect(screen.getAllByText('4.3s').length).toBeGreaterThan(0);
    expect(screen.queryByText('Risk is acceptable with moderate allocation.')).toBeNull();
  });

  it('renders financial highlights only inside Fundamental', () => {
    render(<ResultCard result={MOCK_RESPONSE} />);

    expect(screen.queryByText('Key Financial Highlights')).toBeNull();
    fireEvent.click(screen.getByText('Fundamental'));
    expect(screen.getByText('Key Financial Highlights')).toBeTruthy();
    expect(screen.getAllByText('Q1 2026').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Revenue').length).toBeGreaterThan(0);
  });

  it('renders the trimmed Fundamental sections and hides removed valuation detail blocks', () => {
    const { rerender } = render(<ResultCard result={MOCK_RESPONSE} />);

    fireEvent.click(screen.getByText('Fundamental'));
    expect(screen.queryByText('FINANCIAL TREND ANALYSIS')).toBeNull();
    expect(screen.getByText('VALUATION MULTIPLES')).toBeTruthy();
    expect(screen.queryByText('FAIR VALUE RANGE')).toBeNull();
    expect(screen.queryByText('BULL / BASE / BEAR SCENARIO')).toBeNull();
    expect(screen.getByText('QUALITY OF EARNINGS')).toBeTruthy();
    expect(screen.getByText('BALANCE SHEET RISK')).toBeTruthy();
    expect(screen.getByText('DIVIDEND QUALITY')).toBeTruthy();
    expect(screen.getByText('PEER COMPARISON')).toBeTruthy();

    rerender(<ResultCard result={{ ...MOCK_RESPONSE, peer_comparison: null }} />);
    expect(screen.queryByText('PEER COMPARISON')).toBeNull();
  });

  it('uses Analisis as the default tab and opens the Profile tab', () => {
    render(<ResultCard result={MOCK_RESPONSE} />);

    expect(screen.getByText('Analisis')).toBeTruthy();
    expect(screen.queryByText('Risk / Data Quality')).toBeNull();
    expect(screen.getByText('EXECUTIVE SUMMARY')).toBeTruthy();
    expect(screen.getByText('Chart & Price').disabled).toBe(false);
    expect(screen.getByText('News').disabled).toBe(false);
    expect(screen.queryByText('COMPANY PROFILE')).toBeNull();

    fireEvent.click(screen.getByText('Profil'));

    expect(screen.getByText('COMPANY PROFILE')).toBeTruthy();
    expect(screen.getByText('NVIDIA Corporation')).toBeTruthy();
    expect(screen.queryByText('EXECUTIVE SUMMARY')).toBeNull();
  });

  it('opens the Chart & Price tab and keeps News available', () => {
    render(<ResultCard result={MOCK_RESPONSE} />);

    fireEvent.click(screen.getByText('Chart & Price'));

    expect(screen.getByText('CHART & PRICE')).toBeTruthy();
    expect(screen.getByLabelText(/OHLC candlestick price chart/i)).toBeTruthy();
    expect(screen.getByLabelText(/Trading volume chart/i)).toBeTruthy();
    expect(screen.getByText('PRICE STATISTICS')).toBeTruthy();
    expect(screen.getByText('News').disabled).toBe(false);
    expect(screen.queryByText('EXECUTIVE SUMMARY')).toBeNull();
  });

  it('opens the News tab and renders related vendor articles with a safe original link', () => {
    render(<ResultCard result={MOCK_RESPONSE} />);

    fireEvent.click(screen.getByText('News'));

    expect(screen.getByText('HIGH-IMPACT NEWS')).toBeTruthy();
    expect(
      screen.getAllByText(/NVDA earnings outlook remains constructive/i).length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/Impact: HIGH/i).length).toBeGreaterThan(0);
    const link = screen.getAllByText('OPEN ORIGINAL SOURCE')[0];
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('renders the News empty state when provider coverage is unavailable', () => {
    render(<ResultCard result={MOCK_IDX_NEWS_UNAVAILABLE_RESPONSE} />);

    fireEvent.click(screen.getByText('News'));

    expect(screen.getByText('NEWS UNAVAILABLE')).toBeTruthy();
    expect(screen.getByText('Related news is unavailable.')).toBeTruthy();
  });

  it('does not render a clickable News source for an unsafe URL', () => {
    render(
      <ResultCard
        result={{
          ...MOCK_RESPONSE,
          related_news: {
            available: true,
            items: [{ title: 'Unsafe vendor URL', url: 'javascript:alert(1)' }],
          },
          news_impact: {
            available: false,
            high_impact_news: [],
            data_quality: { status: 'unavailable', sources_used: [] },
          },
          catalyst_tracker: {
            positive_catalysts: [],
            negative_catalysts: [],
            upcoming_events: [],
            summary: {},
          },
          analyst_consensus: { available: false },
        }}
      />
    );

    fireEvent.click(screen.getByText('News'));

    expect(screen.getByText('Unsafe vendor URL')).toBeTruthy();
    expect(screen.queryByText('OPEN ORIGINAL SOURCE')).toBeNull();
  });

  it('renders Chart & Price empty state when chart data is unavailable', () => {
    render(
      <ResultCard
        result={{
          ...MOCK_RESPONSE,
          price_chart: { available: false, warning: 'Chart fetch failed.' },
        }}
      />
    );

    fireEvent.click(screen.getByText('Chart & Price'));

    expect(screen.getByText('CHART DATA UNAVAILABLE')).toBeTruthy();
    expect(screen.getByText('Chart fetch failed.')).toBeTruthy();
  });

  it('renders Chart & Price empty state when fewer than two valid OHLC points remain', () => {
    render(
      <ResultCard
        result={{
          ...MOCK_RESPONSE,
          price_chart: {
            available: true,
            points: [
              { date: '2026-05-17', open: 10, high: 12, low: 9, close: 11, volume: 100 },
              { date: '2026-05-18', open: null, high: 13, low: 10, close: 12, volume: 200 },
            ],
          },
        }}
      />
    );

    fireEvent.click(screen.getByText('Chart & Price'));

    expect(screen.getByText('CHART DATA UNAVAILABLE')).toBeTruthy();
    expect(
      screen.getByText('Valid OHLC price chart data is not available for this analysis.')
    ).toBeTruthy();
  });

  it('renders Phase 3 price statistics without technical entry quality', () => {
    render(<ResultCard result={MOCK_RESPONSE} />);

    fireEvent.click(screen.getByText('Chart & Price'));

    expect(screen.getByText('PRICE STATISTICS')).toBeTruthy();
    expect(screen.queryByText('PRICE PERFORMANCE')).toBeNull();
    expect(screen.queryByText('AVG CLOSE')).toBeNull();
    expect(screen.queryByText('LOOKBACK')).toBeNull();
    expect(screen.queryByText('TRADE DATE')).toBeNull();
    expect(screen.queryByText('AVERAGE VOLUME')).toBeNull();
    expect(screen.queryByText('PERIOD HIGH')).toBeNull();
    expect(screen.queryByText('PERIOD LOW')).toBeNull();
    expect(screen.queryByText('LATEST CLOSE')).toBeNull();
    expect(screen.getByText('YOY Price Window (2025-05-18 to 2026-05-18)')).toBeTruthy();
    expect(
      screen.getByText(/Window: YOY · Start Date: 2025-05-18 · End Date: 2026-05-18/)
    ).toBeTruthy();
    expect(screen.getByText(/Source:/)).toBeTruthy();
    expect(screen.queryByText('POINTS')).toBeNull();
    expect(screen.queryByText('TECHNICAL ENTRY QUALITY')).toBeNull();
    expect(screen.queryByText('ENTRY QUALITY')).toBeNull();
    expect(screen.queryByText('RSI SIGNAL')).toBeNull();
  });

  it('renders Phase 3 news impact, catalyst, and analyst consensus sections', () => {
    render(<ResultCard result={MOCK_RESPONSE} />);

    fireEvent.click(screen.getByText('News'));

    expect(screen.getByText('HIGH-IMPACT NEWS')).toBeTruthy();
    expect(screen.getByText('POSITIVE CATALYSTS')).toBeTruthy();
    expect(screen.getByText('ANALYST RECOMMENDATION TREND')).toBeTruthy();
    expect(screen.getByText('FULL NEWS LIST')).toBeTruthy();
  });

  it('renders Profile empty state when company profile is unavailable', () => {
    render(
      <ResultCard
        result={{
          ...MOCK_RESPONSE,
          company_profile: { available: false, ticker: 'NVDA', warning: 'Profile fetch failed.' },
        }}
      />
    );

    fireEvent.click(screen.getByText('Profil'));

    expect(screen.getByText('PROFILE UNAVAILABLE')).toBeTruthy();
    expect(screen.getByText('Profile fetch failed.')).toBeTruthy();
  });

  it('renders Last Price for a Buy result', () => {
    render(<ResultCard result={MOCK_RESPONSE} />);

    expect(screen.getAllByText('LAST PRICE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$920').length).toBeGreaterThan(0);
  });

  it('renders Buy entry, stop loss, and take profit when trade_plan_valid is true', () => {
    render(<ResultCard result={MOCK_RESPONSE} />);

    expect(screen.getAllByText('ENTRY').length).toBeGreaterThan(0);
    expect(screen.getAllByText('STOP LOSS').length).toBeGreaterThan(0);
    expect(screen.getAllByText('TAKE PROFIT').length).toBeGreaterThan(0);
  });

  it('renders backend risk/reward display as 1:3 for Buy', () => {
    render(<ResultCard result={MOCK_RESPONSE} />);

    expect(screen.getAllByText('R/R RATIO').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1:3').length).toBeGreaterThan(0);
  });

  it('does not render higher RR variants for valid Buy and Sell results', () => {
    const higherRiskRewardPattern = /1:[45]/;
    const { rerender } = render(<ResultCard result={MOCK_RESPONSE} />);

    expect(screen.queryByText(higherRiskRewardPattern)).toBeNull();

    rerender(<ResultCard result={MOCK_SELL_RESPONSE} />);

    expect(screen.queryByText(higherRiskRewardPattern)).toBeNull();
  });

  it('does not render removed action-plan fields', () => {
    render(<ResultCard result={MOCK_RESPONSE} />);

    expect(screen.queryByText('PRICE TARGET')).toBeNull();
    expect(screen.queryByText('RISK PER SHARE')).toBeNull();
    expect(screen.queryByText('REWARD PER SHARE')).toBeNull();
  });

  it('does not render removed action-plan fields for Sell result', () => {
    render(<ResultCard result={MOCK_SELL_RESPONSE} />);

    expect(screen.queryByText('PRICE TARGET')).toBeNull();
    expect(screen.queryByText('RISK PER SHARE')).toBeNull();
    expect(screen.queryByText('REWARD PER SHARE')).toBeNull();
  });

  it('does not render PRICE TARGET in decision hero key metrics', () => {
    render(<ResultCard result={MOCK_RESPONSE} />);

    expect(screen.queryByText('PRICE TARGET')).toBeNull();
  });

  it('renders action plan as exactly 12 metrics for a valid Buy result', () => {
    render(<ResultCard result={MOCK_RESPONSE} />);

    expect(screen.getAllByTestId('action-plan-metric')).toHaveLength(12);
  });

  it('renders action plan as exactly 12 metrics for a valid Sell result', () => {
    render(<ResultCard result={MOCK_SELL_RESPONSE} />);

    expect(screen.getAllByTestId('action-plan-metric')).toHaveLength(12);
  });

  it('renders action plan metrics in the required order', () => {
    render(<ResultCard result={MOCK_RESPONSE} />);

    const labels = screen
      .getAllByTestId('action-plan-metric')
      .map((node) => node.querySelector('div')?.textContent);

    expect(labels).toEqual([
      'CURRENT PRICE',
      'ENTRY',
      'STOP LOSS',
      'TAKE PROFIT',
      'MAX DRAWDOWN',
      'VOLATILITY',
      'VOLATILITY SCORE',
      'REBALANCING',
      'POSITION ACTION',
      'NEW ENTRY ACTION',
      'POSITION SIZE HINT',
      'R/R RATIO',
    ]);
  });

  it('renders a complete Sell action plan when trade_plan_valid is true', () => {
    render(<ResultCard result={MOCK_SELL_RESPONSE} />);

    expect(screen.getByText('▼ SELL')).toBeTruthy();
    expect(screen.getAllByText('CURRENT PRICE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ENTRY').length).toBeGreaterThan(0);
    expect(screen.getAllByText('STOP LOSS').length).toBeGreaterThan(0);
    expect(screen.getAllByText('TAKE PROFIT').length).toBeGreaterThan(0);
    expect(screen.getAllByText('MAX DRAWDOWN').length).toBeGreaterThan(0);
    expect(screen.getAllByText('VOLATILITY').length).toBeGreaterThan(0);
    expect(screen.getAllByText('REBALANCING').length).toBeGreaterThan(0);
    expect(screen.getAllByText('POSITION SIZE HINT').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Exit position').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1:3').length).toBeGreaterThan(0);
  });

  it('renders WAIT wording for no-position mock scenario', () => {
    render(<ResultCard result={MOCK_PTRO_WAIT_RESPONSE} />);

    expect(screen.getByText('◇ WAIT')).toBeTruthy();
    expect(screen.getByText('No position to rebalance')).toBeTruthy();
    expect(screen.getByText('Wait for valid entry setup')).toBeTruthy();
    expect(screen.getByText('0% allocation until setup improves.')).toBeTruthy();
  });

  it('renders REDUCE wording for existing-position mock scenario', () => {
    render(<ResultCard result={MOCK_TPIA_REDUCE_SCENARIO_RESPONSE} />);

    expect(screen.getByText('◒ REDUCE')).toBeTruthy();
    expect(screen.getAllByText('Trim position').length).toBeGreaterThan(0);
    expect(screen.getByText('Do not add; reduce existing exposure')).toBeTruthy();
    expect(
      screen.getByText('Reduce position size gradually; no new exposure suggested.')
    ).toBeTruthy();
  });

  it('keeps Hold result limited to status metrics', () => {
    render(<ResultCard result={MOCK_HOLD_RESPONSE} />);

    expect(screen.getByText('◇ WAIT')).toBeTruthy();
    expect(screen.getAllByText('CURRENT PRICE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('VOLATILITY').length).toBeGreaterThan(0);
    expect(screen.getAllByText('VOLATILITY SCORE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('REBALANCING').length).toBeGreaterThan(0);
    expect(screen.getAllByText('POSITION SIZE HINT').length).toBeGreaterThan(0);
  });

  it('does not render Hold trade-plan metrics even when backend sends debug fields', () => {
    render(
      <ResultCard
        result={{
          ...MOCK_HOLD_RESPONSE,
          price_target: 220,
          entry_price: 190,
          stop_loss: 180,
          take_profit: 220,
          risk_per_share: 10,
          reward_per_share: 30,
          risk_reward_ratio: 3,
          risk_reward_display: '1:3',
          max_drawdown_estimate: '6-10%',
        }}
      />
    );

    expect(screen.queryByText('ACTION PLAN')).toBeNull();
    expect(screen.queryByText('ENTRY')).toBeNull();
    expect(screen.queryByText('STOP LOSS')).toBeNull();
    expect(screen.queryByText('TAKE PROFIT')).toBeNull();
    expect(screen.queryByText('R/R RATIO')).toBeNull();
    expect(screen.queryByText('RISK PER SHARE')).toBeNull();
    expect(screen.queryByText('REWARD PER SHARE')).toBeNull();
    expect(screen.queryByText('MAX DRAWDOWN')).toBeNull();
  });

  it('does not show decision adjusted warning for a normal Hold', () => {
    render(<ResultCard result={MOCK_HOLD_RESPONSE} />);

    expect(screen.queryByText('DECISION ADJUSTED')).toBeNull();
    expect(screen.queryByText(/LLM: BUY → FINAL:/)).toBeNull();
  });

  it('shows decision adjusted warning and reason when backend downgrades a decision', () => {
    render(
      <ResultCard
        result={{
          ...MOCK_HOLD_RESPONSE,
          llm_decision: 'Buy',
          raw_ai_signal: 'BUY',
          display_signal: 'WAIT',
          decision_adjusted: true,
          decision_adjusted_reason: 'Invalid risk reward structure',
        }}
      />
    );

    expect(screen.getByText('DECISION ADJUSTED')).toBeTruthy();
    expect(screen.getByText('Invalid risk reward structure')).toBeTruthy();
    expect(screen.getByText(/LLM: BUY → FINAL: WAIT/)).toBeTruthy();
  });

  it('renders IDX news unavailable as non-blocking while keeping trade plan valid', () => {
    render(<ResultCard result={MOCK_IDX_NEWS_UNAVAILABLE_RESPONSE} />);

    expect(screen.getAllByTestId('action-plan-metric')).toHaveLength(12);
    expect(screen.queryByText('Risk / Data Quality')).toBeNull();
  });

  it('does not render action plan for invalid actionable trade plan', () => {
    render(<ResultCard result={{ ...MOCK_RESPONSE, trade_plan_valid: false }} />);

    expect(screen.getByText('TRADE PLAN NOT VALID')).toBeTruthy();
    expect(screen.queryByText('ACTION PLAN')).toBeNull();
    expect(screen.queryByText('ENTRY')).toBeNull();
  });

  it('handles missing current price without rendering NaN or fake levels', () => {
    render(<ResultCard result={MOCK_MISSING_PRICE_RESPONSE} />);

    expect(screen.getByText('PRICE DATA MISSING')).toBeTruthy();
    expect(screen.queryByText('Risk / Data Quality')).toBeNull();
    expect(screen.queryByText(/NaN/)).toBeNull();
    expect(screen.queryByText('ACTION PLAN')).toBeNull();
    expect(screen.queryByText('ENTRY')).toBeNull();
  });

  it('does not crash when backend sends invalid optional fields', () => {
    expect(() =>
      render(
        <ResultCard
          result={{
            ...MOCK_RESPONSE,
            current_price: Number.NaN,
            last_price: Number.NaN,
            price_target: Number.NaN,
            validation_warnings: 'not-an-array',
            data_quality: null,
          }}
        />
      )
    ).not.toThrow();

    expect(screen.getByText('PRICE DATA MISSING')).toBeTruthy();
    expect(screen.queryByText(/NaN/)).toBeNull();
  });

  it('does not render PRICE TARGET even when backend sends price_target field', () => {
    render(
      <ResultCard
        result={{
          ...MOCK_RESPONSE,
          price_target: 1200,
          risk_per_share: 40,
          reward_per_share: 120,
        }}
      />
    );

    expect(screen.queryByText('PRICE TARGET')).toBeNull();
    expect(screen.queryByText('RISK PER SHARE')).toBeNull();
    expect(screen.queryByText('REWARD PER SHARE')).toBeNull();
  });
});
