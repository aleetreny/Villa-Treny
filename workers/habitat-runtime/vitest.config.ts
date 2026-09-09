import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';
import { unstable_readConfig, type Unstable_Config } from 'wrangler';

// Read public configuration only: Wrangler's full local-binding resolver loads
// .dev.vars and adds assets, neither of which belongs in isolated API tests.
// Explicit assets:undefined is not a supported removal in this Miniflare version.
const runtime: Unstable_Config = unstable_readConfig({ config: './wrangler.jsonc' });
if (!runtime.main || !runtime.compatibility_date) throw new Error('Tests need the configured Worker entry and compatibility date.');
const durableObjects = Object.fromEntries(runtime.durable_objects.bindings.map((binding) => {
  const lifecycle = runtime.exports?.[binding.class_name];
  if (binding.script_name || lifecycle?.type !== 'durable-object' || !('storage' in lifecycle)) {
    throw new Error('Worker tests require locally declared Durable Objects.');
  }
  return [binding.name, { className: binding.class_name, useSQLite: lifecycle.storage === 'sqlite' }];
}));

export default defineConfig({
  plugins: [
    cloudflareTest({
      // Tests never spend Workers AI quota. Provider adapters are mocked directly.
      remoteBindings: false,
      main: runtime.main,
      // No assets or remote provider bindings. HTTP asset routing is checked
      // after build by test-hosting.mjs, separately from this pre-build suite.
      miniflare: {
        compatibilityDate: runtime.compatibility_date,
        compatibilityFlags: runtime.compatibility_flags,
        modulesRules: [{ type: 'CompiledWasm', include: ['**/*.wasm'], fallthrough: true }],
        bindings: runtime.vars,
        durableObjects,
      },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
  },
});
