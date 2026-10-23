import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { PasswordChecklist } from './PasswordChecklist';

test('ticks each rule the password meets, announced politely to screen readers', () => {
  const { rerender } = render(<PasswordChecklist password="" nickname="ulfgaar" />);
  const item = (name: RegExp) => screen.getByText(name).closest('li')!;
  expect(item(/At least 12/)).toHaveAttribute('data-ok', 'false');
  expect(screen.getByRole('list', { name: 'Password rules' })).toHaveAttribute('aria-live', 'polite');

  rerender(<PasswordChecklist password="Correct-horse1" nickname="ulfgaar" />);
  expect(item(/At least 12/)).toHaveAttribute('data-ok', 'true');
  expect(item(/3 of/)).toHaveAttribute('data-ok', 'true');
  expect(item(/nickname/)).toHaveAttribute('data-ok', 'true');
  expect(item(/At least 12/)).toHaveTextContent('✓');
});
