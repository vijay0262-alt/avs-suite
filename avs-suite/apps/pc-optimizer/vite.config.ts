import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Vite config for the AVS PC Optimizer renderer process.
 *
 * - Alias `@` -> src (feature-relative imports).
 * - Alias `@avs/*` -> workspace packages for HMR without needing a build step.
 * - Emits to `dist/` which electron-builder packs into the installer.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@avs/ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@avs/core': path.resolve(__dirname, '../../packages/core/src'),
      '@avs/shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@avs/licensing': path.resolve(__dirname, '../../packages/licensing/src'),
      '@avs/updater': path.resolve(__dirname, '../../packages/updater/src'),
      '@avs/analytics': path.resolve(__dirname, '../../packages/analytics/src'),
    },
  },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    target: 'chrome120',
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
