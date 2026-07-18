import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Builds the modular src/ tree into a single, stable, unhashed bundle that the
// Python server serves at /dist/limiar-app.js. The page's HTML, vendor scripts,
// CSS and static dirs stay at the project root, served by server.py unchanged.
export default defineConfig({
  resolve: {
    alias: {
      // data/seed/*.json is the source of truth for reference data; the
      // backend also reads it directly (backend/config.py REFERENCE_DIR), so
      // it stays outside frontend/ rather than being duplicated.
      '@seed': fileURLToPath(new URL('../data/seed', import.meta.url)),
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2020',
    rollupOptions: {
      input: {
        'limiar-app': 'src/main.js',
        'campaign-map': 'src/pages/campaign-map.js',
        'login': 'src/pages/login.js',
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
  // Dev server (npm run dev): serves src/ with HMR and proxies the API to Python.
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8765',
      '/uploads': 'http://127.0.0.1:8765',
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.{js,ts}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        'src/domain/dice/**/*.js',
        'src/domain/economy/**/*.js',
        'src/domain/character/**/*.js',
        'src/domain/conditions/**/*.js',
      ],
      thresholds: {
        lines: 60,
      },
    },
  },
});
