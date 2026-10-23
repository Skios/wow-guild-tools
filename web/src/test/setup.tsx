import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { navigate } from './navState';

vi.mock('next/navigation', async () => {
  const { useTestPath } = await import('./navState');
  return {
    usePathname: () => useTestPath(),
    useParams: () => ({ id: decodeURIComponent(useTestPath().split('/')[2] ?? '') }),
  };
});

vi.mock('next/link', async () => {
  const { navigate } = await import('./navState');
  return {
    default: ({ href, ...rest }: { href: string } & React.ComponentProps<'a'>) => (
      <a href={href} {...rest} onClick={e => { e.preventDefault(); navigate(href); }} />
    ),
  };
});

afterEach(() => {
  cleanup();
  try { sessionStorage.clear(); localStorage.clear(); } catch { /* storage unavailable */ }
  navigate('/events');
});
