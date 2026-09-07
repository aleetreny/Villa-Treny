import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/** RoomLab needs the licensed sheets locally. Only final scenes and fonts ship. */
function observerAssets(): Plugin {
  let output = '';
  return {
    name: 'observer-public-assets',
    apply: 'build',
    configResolved(config) { output = resolve(config.root, config.build.outDir); },
    async closeBundle() {
      await Promise.all(['fonts', 'habitat'].map((name) => cp(
        resolve(import.meta.dirname, 'public', name), resolve(output, name), { recursive: true },
      )));
    },
  };
}

export default defineConfig({
  base: process.env.GITHUB_PAGES_BASE_PATH ?? '/',
  plugins: [react(), observerAssets()],
  server: { proxy: { '/__habitat': {
    target: process.env.HABITAT_PROXY_TARGET ?? 'https://aleetreny-habitat-runtime.alejandrotreny100.workers.dev',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/__habitat/, ''),
  } } },
  build: { outDir: 'dist', sourcemap: true, copyPublicDir: false },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
