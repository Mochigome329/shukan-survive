import { existsSync, renameSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/** ビルド成果物の index.html を uchikiri.html にリネームする。 */
function renameToUchikiriHtml(outDir: string): Plugin {
  return {
    name: 'rename-to-uchikiri-html',
    enforce: 'post',
    closeBundle() {
      const src = resolve(outDir, 'index.html');
      const dst = resolve(outDir, 'uchikiri.html');
      if (!existsSync(src)) return;
      if (existsSync(dst)) rmSync(dst);
      renameSync(src, dst);
    },
  };
}

const OUT_DIR = resolve(import.meta.dirname, 'dist');

export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile({ removeViteModuleLoader: true }), renameToUchikiriHtml(OUT_DIR)],
  build: {
    target: 'es2022',
    outDir: OUT_DIR,
    assetsInlineLimit: 100 * 1024 * 1024,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 100 * 1024 * 1024,
    reportCompressedSize: false,
    emptyOutDir: true,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
