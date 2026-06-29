import PropTypes from 'prop-types';
import { memo } from 'react';

import QuantPanel from './QuantPanel';

// Thin wrapper: pulls the price series out of an AI-agent result and hands it to
// the shared QuantPanel. Quant math needs only the price series, not the pipeline.
function QuantTab({ result }) {
  const points = result?.price_chart?.points ?? [];
  const currency = result?.price_chart?.currency || result?.currency || '';
  const symbol = result?.normalized_ticker || result?.ticker || '';
  return <QuantPanel points={points} currency={currency} symbol={symbol} />;
}

QuantTab.propTypes = { result: PropTypes.object.isRequired };

export default memo(QuantTab);
