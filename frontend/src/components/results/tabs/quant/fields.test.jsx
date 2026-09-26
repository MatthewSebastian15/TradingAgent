import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NumberField, SliderField } from './charts';

describe('NumberField v2', () => {
  afterEach(() => cleanup());

  it('keeps the unit inside the input and in the accessible name', () => {
    const onChange = vi.fn();
    render(<NumberField label="Base FCF" value={100} onChange={onChange} suffix="M" />);
    const input = screen.getByRole('spinbutton', { name: 'Base FCF (M)' });
    expect(screen.getByText('M').getAttribute('aria-hidden')).toBe('true');
    fireEvent.change(input, { target: { value: '250' } });
    expect(onChange).toHaveBeenCalledWith(250);
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('shows a field error, badge and reset button', () => {
    const onReset = vi.fn();
    render(
      <NumberField
        label="WACC"
        value={2}
        onChange={() => {}}
        suffix="%"
        error="WACC must be greater than terminal growth."
        badge="Fundamentals"
        onReset={onReset}
      />
    );
    const input = screen.getByRole('spinbutton', { name: 'WACC (%)' });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const error = screen.getByText('WACC must be greater than terminal growth.');
    expect(input.getAttribute('aria-describedby')).toContain(error.id);
    expect(screen.getByText('Fundamentals')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reset WACC' }));
    expect(onReset).toHaveBeenCalled();
  });
});

describe('SliderField v2', () => {
  afterEach(() => cleanup());

  it('pairs a slider with a clamped number input that commits on blur', () => {
    const onChange = vi.fn();
    render(<SliderField label="Fast SMA" value={20} min={5} max={49} onChange={onChange} />);
    const slider = screen.getByRole('slider', { name: 'Fast SMA (slider)' });
    const number = screen.getByRole('spinbutton', { name: 'Fast SMA' });
    expect(slider.getAttribute('max')).toBe('49');
    expect(number.getAttribute('max')).toBe('49');

    fireEvent.change(slider, { target: { value: '30' } });
    expect(onChange).toHaveBeenLastCalledWith(30);

    fireEvent.change(number, { target: { value: '1' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.change(number, { target: { value: '120' } });
    fireEvent.blur(number);
    expect(onChange).toHaveBeenLastCalledWith(49);

    fireEvent.change(number, { target: { value: '12' } });
    fireEvent.keyDown(number, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(12);
  });
});
