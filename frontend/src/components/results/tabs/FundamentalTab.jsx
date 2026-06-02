import PropTypes from 'prop-types';

import FinancialHighlightsTable from '../FinancialHighlightsTable';

export default function FundamentalTab({ financialHighlights }) {
  return <FinancialHighlightsTable financialHighlights={financialHighlights} />;
}

FundamentalTab.propTypes = {
  financialHighlights: PropTypes.object,
};
