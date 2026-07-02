import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Config separada da do Vite (e fora de qualquer tsconfig) para não interferir
// no `tsc -b` do build. Testes rodam em jsdom para que hooks e componentes React
// também possam ser testados, além da lógica pura.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**'],
      exclude: ['src/test/**', 'src/**/*.test.{ts,tsx}', 'src/main.tsx', 'src/assets/**'],
    },
  },
});
