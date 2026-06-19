import { defineConfig } from 'vitest/config';

// Config separada da do Vite (e fora de qualquer tsconfig) para não interferir
// no `tsc -b` do build. Testes de lógica pura rodam no ambiente Node padrão.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
