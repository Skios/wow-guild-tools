import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    globalSetup: ['./src/test/tz.ts'],
    setupFiles: ['./src/test/setup.tsx'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      // layout.tsx is pure wiring (html shell, <script>, <App>); it is exercised by `next build`, not jsdom.
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/app/layout.tsx'],
      reporter: ['text', 'html'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
