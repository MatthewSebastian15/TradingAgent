import React from 'react';
import AnalysisWorkspace from '../components/AnalysisWorkspace';
import StockFormMock from '../components/StockFormMock';

async function lookupMockResult(requestId) {
  const { getMockAnalysisResponseByRequestId } = await import('../../dev/mockData');
  return getMockAnalysisResponseByRequestId(requestId);
}

export default function AnalysisMock() {
  return (
    <AnalysisWorkspace
      FormComponent={StockFormMock}
      historyKey="ta_analysis_mock_history"
      emptyDescription="Select a market tab, configure parameters on the left, and execute analysis to receive a structured trade decision."
      resultPathBase="/analysis.test"
      lookupResult={lookupMockResult}
      mockReportExport
    />
  );
}
