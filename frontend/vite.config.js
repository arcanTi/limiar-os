import { fileURLToPath } from 'node:url';
import autoprefixer from 'autoprefixer';
import tailwindcss from 'tailwindcss';
import { defineConfig } from 'vite';
import { htmlPartialsPlugin } from './build/htmlPartials.js';

const frontendRoot = fileURLToPath(new URL('.', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const distDir = fileURLToPath(new URL('../dist', import.meta.url));
const tailwindConfig = fileURLToPath(new URL('./tailwind.config.js', import.meta.url));

// Vite owns all three pages; tests, development and production share the same
// frontend root while the generated output remains at repository-level dist/.
export default defineConfig(({ command }) => ({
  root: frontendRoot,
  base: command === 'build' ? '/dist/' : '/',
  cacheDir: fileURLToPath(new URL('./node_modules/.vite', import.meta.url)),
  publicDir: false,
  plugins: [htmlPartialsPlugin(repositoryRoot)],
  resolve: {
    alias: {
      // data/seed/*.json is the source of truth for reference data; the
      // backend also reads it directly (backend/config.py REFERENCE_DIR), so
      // it stays outside frontend/ rather than being duplicated.
      '@seed': fileURLToPath(new URL('../data/seed', import.meta.url)),
    },
  },
  css: {
    postcss: {
      plugins: [tailwindcss({ config: tailwindConfig }), autoprefixer()],
    },
  },
  build: {
    outDir: distDir,
    emptyOutDir: true,
    target: 'es2020',
    rollupOptions: {
      input: [
        fileURLToPath(new URL('./index.html', import.meta.url)),
        fileURLToPath(new URL('./login.html', import.meta.url)),
        fileURLToPath(new URL('./campaign-map.html', import.meta.url)),
      ],
      output: {
        manualChunks(id) {
          if (id.includes('/games/nexus/')) return 'nexus';
          if (id.includes('/src/domain/')) return 'domain';
          return undefined;
        },
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
      reporter: ['text-summary', 'json-summary'],
      // `all: true` + o src inteiro. Até 2026-07-28 este include listava quatro
      // pastas de domínio (dice/economy/character/conditions) e o relatório
      // publicava 92% — medindo 1.423 das 21.994 linhas do src, ou 6,5% dele.
      // Ficavam de fora os dois maiores domínios do produto (combat, items) e
      // toda a borda: ui/, pages/, infrastructure/, framework/. É a segunda vez
      // que este gate mede outra coisa: o comentário anterior registra que os
      // globs tinham ficado obsoletos e passavam a 60% sem medir nada.
      // Sem `all: true` os arquivos que nenhum teste importa somem da conta e o
      // número sobe justamente por não haver teste.
      all: true,
      include: ['src/**/*.{js,ts}'],
      exclude: ['**/*.d.ts'],
      thresholds: {
        // Piso = o valor real medido em 2026-07-28, arredondado para baixo.
        // Serve para impedir regressão, não para declarar suficiência: 57% de
        // linhas com ui/ em 46% e framework/ em 11% não é uma meta, é o ponto
        // de partida honesto. Subir estes números é trabalho de teste, não de
        // configuração.
        lines: 57,
        statements: 47,
        branches: 46,
        functions: 44,
      },
    },
  },
}));
