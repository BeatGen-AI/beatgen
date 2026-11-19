import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ControlKnob from './ControlKnob';

describe('ControlKnob with PrimeReact 11', () => {
  it('renders the compound range and value arcs with the existing dimensions and colors', () => {
    const { container, getByText } = render(
      <ControlKnob value={50} min={0} max={100} size={30} color="#1976d2" onChange={vi.fn()} />
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('width')).toBe('30');
    expect(svg?.getAttribute('height')).toBe('30');
    const paths = svg?.querySelectorAll('path');
    expect(paths).toHaveLength(2);
    expect(paths?.[0].getAttribute('d')).toContain('M ');
    expect(paths?.[1].getAttribute('d')).toContain('M ');
    expect(paths?.[1].getAttribute('stroke')).toBe('#1976d2');
    expect(getByText('50')).toBeInTheDocument();
  });
});
