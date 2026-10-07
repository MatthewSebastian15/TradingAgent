import React from 'react';
import { useLocation } from 'react-router-dom';

import AnalysisWorkspace from '../components/AnalysisWorkspace';
import StockForm from '../components/StockForm';
import { AI_AGENT_PATH } from '../constants/routes';

export default function AIAgent() {
  // Research's "Run Full Analysis" hands the ticker over via router state; it only seeds the
  // form, the user still reviews the settings and starts the run.
  const prefill = useLocation().state?.prefillTicker;
  const formProps =
    typeof prefill === 'string' && prefill.trim() ? { initialTicker: prefill.trim() } : undefined;

  return (
    <AnalysisWorkspace
      FormComponent={StockForm}
      historyKey="ta_analysis_history"
      emptyDescription="Search a yfinance ticker, configure the terminal controls at the top, then execute the agent pipeline for a structured trade decision."
      resultPathBase={AI_AGENT_PATH}
      formProps={formProps}
    />
  );
}
