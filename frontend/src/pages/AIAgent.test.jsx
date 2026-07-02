import { cleanup, render, screen } from '@testing-library/react';
import PropTypes from 'prop-types';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AIAgent from './AIAgent';
import StockForm from '../components/StockForm';
import { AI_AGENT_PATH } from '../constants/routes';

vi.mock('../components/AnalysisWorkspace', () => {
  function AnalysisWorkspaceStub({ FormComponent, historyKey, resultPathBase }) {
    return (
      <div data-testid="workspace">
        {historyKey}|{resultPathBase}|{FormComponent === StockForm ? 'StockForm' : 'other'}
      </div>
    );
  }
  AnalysisWorkspaceStub.propTypes = {
    FormComponent: PropTypes.elementType,
    historyKey: PropTypes.string,
    resultPathBase: PropTypes.string,
  };
  return { default: AnalysisWorkspaceStub };
});
vi.mock('../components/StockForm', () => ({
  default: function StockFormStub() {
    return null;
  },
}));

describe('AIAgent page', () => {
  afterEach(() => cleanup());

  it('wires StockForm and the shared history key into the workspace', () => {
    render(<AIAgent />);

    expect(screen.getByTestId('workspace').textContent).toBe(
      `ta_analysis_history|${AI_AGENT_PATH}|StockForm`
    );
  });
});
