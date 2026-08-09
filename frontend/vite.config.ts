import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/sprint-planning-poker/' : '/',
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 4200,
    proxy: {
      '/api/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4200,
    proxy: {
      '/sprint-planning-poker/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    exclude: ['e2e/**', 'node_modules/**'],
    setupFiles: './src/test/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/test/**'],
    },
  },
}));
