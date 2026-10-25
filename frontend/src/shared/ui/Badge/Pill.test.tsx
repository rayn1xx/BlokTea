import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ToneLabel } from './Pill';

describe('ToneLabel', () => {
  it.each([
    ['attention', 'yellow'],
    ['positive', 'green'],
    ['negative', 'red'],
    ['info', 'blue'],
    ['neutral', 'grey'],
  ] as const)('тон %s рисуется пилюлей %s', (tone, pill) => {
    render(<ToneLabel tone={tone}>Статус</ToneLabel>);
    const el = screen.getByText('Статус');
    expect(el).toHaveClass('pill', pill);
  });
});
