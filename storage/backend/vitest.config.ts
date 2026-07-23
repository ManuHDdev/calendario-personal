import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      STORAGE_PATH: path.join(__dirname, '.test-storage'),
    },
  },
});
