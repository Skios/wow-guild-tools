import { createHash, timingSafeEqual } from 'node:crypto';

// Compare digests so length differences don't leak through timing.
export function safeEqual(received: unknown, expected: string): boolean {
  if (typeof received !== 'string') return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(received), digest(expected));
}
