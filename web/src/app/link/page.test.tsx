import { render } from '@testing-library/react';
import { expect, test } from 'vitest';
import { currentPath, navigate } from '../../test/nav';
import LinkPage from './page';

test("once signed in, the bot's link shows the account page", () => {
  navigate('/link');
  render(<LinkPage />);
  expect(currentPath()).toBe('/account');
});
