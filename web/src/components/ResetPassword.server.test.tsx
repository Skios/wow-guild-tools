// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ResetPassword } from './ResetPassword';

// Next prerenders /reset on the server, where there is no window (this broke the Vercel build).
test('renders on the server without touching window', () => {
  expect(() => renderToString(<ResetPassword />)).not.toThrow();
});
