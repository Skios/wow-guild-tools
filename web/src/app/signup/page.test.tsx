import { render } from '@testing-library/react';
import { expect, test } from 'vitest';
import { currentPath, navigate } from '../../test/nav';
import SignupPage from './page';

test('a signed-in visitor of /signup is sent to the site', () => {
  navigate('/signup');
  render(<SignupPage />);
  expect(currentPath()).toBe('/events');
});
