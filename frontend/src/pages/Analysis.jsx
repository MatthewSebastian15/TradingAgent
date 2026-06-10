import React from 'react';
import AnalysisWorkspace from '../components/AnalysisWorkspace';
import StockForm from '../components/StockForm';
import { AI_RESEARCH_PATH } from '../constants/routes';

export default function Analysis() {
  return (
    <AnalysisWorkspace
      FormComponent={StockForm}
      historyKey="ta_analysis_history"
      emptyDescription="Search a yfinance ticker, configure the terminal controls at the top, then execute the agent pipeline for a structured trade decision."
      resultPathBase={AI_RESEARCH_PATH}
    />
  );
}
