import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// In dev the admin talks to the API through /api, so the browser sees a single origin (no CORS).
const API_TARGET = process.env.API_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: API_TARGET, rewrite: path => path.replace(/^\/api/, '') } },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    globalSetup: ['./src/test/tz.ts'],
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx'],
      reporter: ['text', 'html'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
