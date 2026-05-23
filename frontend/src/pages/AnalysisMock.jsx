import React from 'react';
import AnalysisWorkspace from '../components/AnalysisWorkspace';
import StockFormMock from '../components/StockFormMock';

export default function AnalysisMock() {
  return (
    <AnalysisWorkspace
      FormComponent={StockFormMock}
      historyKey="ta_analysis_mock_history"
      emptyDescription="Configure parameters on the left and execute analysis to receive a structured trade decision."
    />
  );
}
