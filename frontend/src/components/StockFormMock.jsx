import PropTypes from 'prop-types';
import React from 'react';

import StockForm from './StockForm';
import { searchMockTickers } from '../../dev/mockData';
import { useMockAnalysisJob } from '../hooks/useMockAnalysisJob';

export default function StockFormMock(props) {
  return (
    <StockForm
      {...props}
      tickerSearch={searchMockTickers}
      useAnalysisJobHook={useMockAnalysisJob}
    />
  );
}

StockFormMock.propTypes = {
  onAgentProgress: PropTypes.func.isRequired,
  onLoading: PropTypes.func.isRequired,
  onResult: PropTypes.func.isRequired,
  onStatus: PropTypes.func.isRequired,
  selectedResult: PropTypes.object,
};
