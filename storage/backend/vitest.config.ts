import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Fija STORAGE_PATH antes de que los módulos lo lean al importarse.
    setupFiles: ['src/test-setup.ts'],
  },
});
