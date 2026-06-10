import React from 'react';

import StockForm from './StockForm';
import { useMockAnalysisJob } from '../hooks/useMockAnalysisJob';
import { searchMockTickers } from '../../dev/mockData';

export default function StockFormMock(props) {
  return (
    <StockForm
      {...props}
      tickerSearch={searchMockTickers}
      useAnalysisJobHook={useMockAnalysisJob}
    />
  );
}
