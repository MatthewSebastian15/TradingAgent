import React from 'react';

import StockForm from './StockForm';
import { useMockAnalysisJob } from '../hooks/useMockAnalysisJob';

export default function StockFormMock(props) {
  return <StockForm {...props} useAnalysisJobHook={useMockAnalysisJob} />;
}
