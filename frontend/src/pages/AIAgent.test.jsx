import { cleanup, render, screen } from '@testing-library/react';
import PropTypes from 'prop-types';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AIAgent from './AIAgent';
import StockForm from '../components/StockForm';
import { AI_AGENT_PATH } from '../constants/routes';

vi.mock('../components/AnalysisWorkspace', () => {
  function AnalysisWorkspaceStub({ FormComponent, historyKey, resultPathBase, formProps }) {
    return (
      <div data-testid="workspace">
        {historyKey}|{resultPathBase}|{FormComponent === StockForm ? 'StockForm' : 'other'}
        <span data-testid="form-props">{JSON.stringify(formProps ?? null)}</span>
      </div>
    );
  }
  AnalysisWorkspaceStub.propTypes = {
    FormComponent: PropTypes.elementType,
    historyKey: PropTypes.string,
    resultPathBase: PropTypes.string,
    formProps: PropTypes.object,
  };
  return { default: AnalysisWorkspaceStub };
});
vi.mock('../components/StockForm', () => ({
  default: function StockFormStub() {
    return null;
  },
}));

function renderAt(entry) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AIAgent />
    </MemoryRouter>
  );
}

describe('AIAgent page', () => {
  afterEach(() => cleanup());

  it('wires StockForm and the shared history key into the workspace', () => {
    renderAt(AI_AGENT_PATH);

    expect(screen.getByTestId('workspace').textContent).toContain(
      `ta_analysis_history|${AI_AGENT_PATH}|StockForm`
    );
  });

  it('prefills the form ticker from router location state (Research hand-off)', () => {
    renderAt({ pathname: AI_AGENT_PATH, state: { prefillTicker: 'MSFT' } });

    expect(JSON.parse(screen.getByTestId('form-props').textContent)).toEqual({
      initialTicker: 'MSFT',
    });
  });

  it('adds no form props when there is no hand-off', () => {
    renderAt(AI_AGENT_PATH);

    expect(screen.getByTestId('form-props').textContent).toBe('null');
  });

  it('ignores a malformed hand-off value', () => {
    renderAt({ pathname: AI_AGENT_PATH, state: { prefillTicker: { not: 'a string' } } });

    expect(screen.getByTestId('form-props').textContent).toBe('null');
  });
});
