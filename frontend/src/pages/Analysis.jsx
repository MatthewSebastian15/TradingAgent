import React from 'react';
import AnalysisWorkspace from '../components/AnalysisWorkspace';
import StockForm from '../components/StockForm';

export default function Analysis() {
  return (
    <AnalysisWorkspace
      FormComponent={StockForm}
      historyKey="ta_analysis_history"
      emptyDescription="Select a market tab, configure parameters on the left, and execute analysis to receive a structured trade decision."
    />
  );
}
