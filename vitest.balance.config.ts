import { defineConfig } from 'vitest/config';

// `npm run balance`: the balance tool runs as a test file so it can read the game's data the way the game does.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tools/*.run.ts'],
    testTimeout: 600_000,
  },
});
