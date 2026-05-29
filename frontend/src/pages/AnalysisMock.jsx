import React from 'react';
import AnalysisWorkspace from '../components/AnalysisWorkspace';
import StockFormMock from '../components/StockFormMock';
import { getMockAnalysisResponseByRequestId } from '../mockData';

export default function AnalysisMock() {
  return (
    <AnalysisWorkspace
      FormComponent={StockFormMock}
      historyKey="ta_analysis_mock_history"
      emptyDescription="Select a market tab, configure parameters on the left, and execute analysis to receive a structured trade decision."
      resultPathBase="/analysis.test"
      lookupResult={getMockAnalysisResponseByRequestId}
      lookupResultFirst
      mockReportExport
    />
  );
}
