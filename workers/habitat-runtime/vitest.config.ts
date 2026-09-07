import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      // Tests never spend Workers AI quota. Provider adapters are mocked directly.
      remoteBindings: false,
      wrangler: { configPath: './wrangler.jsonc' },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
  },
});
