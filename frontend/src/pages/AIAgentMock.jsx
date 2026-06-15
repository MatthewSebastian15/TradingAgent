import React from 'react';
import AnalysisWorkspace from '../components/AnalysisWorkspace';
import StockFormMock from '../components/StockFormMock';
import { AI_AGENT_MOCK_PATH } from '../constants/routes';

async function lookupMockResult(requestId) {
  const { getMockAnalysisResponseByRequestId } = await import('../../dev/mockData');
  return getMockAnalysisResponseByRequestId(requestId);
}

export default function AIAgentMock() {
  return (
    <AnalysisWorkspace
      FormComponent={StockFormMock}
      historyKey="ta_analysis_mock_history"
      emptyDescription="Search a mock yfinance ticker, configure the terminal controls at the top, then execute the mock agent pipeline for a structured trade decision."
      resultPathBase={AI_AGENT_MOCK_PATH}
      lookupResult={lookupMockResult}
      backendHistoryEnabled={false}
      mockReportExport
    />
  );
}
