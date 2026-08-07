// Compiled by Vite/PostCSS from src/tailwind.css, which is imported only by the
// main application entry. There is no standalone generated stylesheet.
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './templates/**/*.html',
    './src/**/*.{js,ts}',
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"Share Tech Mono"', 'monospace'],
        sans: ['"Chakra Petch"', 'sans-serif'],
      },
      colors: {
        cyber: {
          bg: '#080a07',
          surface: '#0b0e0a',
          panel: '#0d120c',
          card: '#0e120d',
          border: '#1e2b1c',
          line: '#2a3a26',
          cyan: '#3fe0d0',
          'cyan-dim': '#2aa89c',
          red: '#c0635b',
          'red-dim': '#7a3d38',
          gold: '#d6aa4e',
          'gold-dim': '#7a5f24',
          purple: '#b388ff',
          dim: '#4a5a44',
          muted: '#6f7a64',
          text: '#c8d8c8',
          bright: '#f0ead8',
        },
      },
      // Grids auto-fit nomeados. Como classe arbitraria
      // (`grid-cols-[repeat(auto-fit,minmax(260px,1fr))]`) o scanner de conteudo
      // nao reconhece o valor — parenteses aninhados com virgula escapam do
      // extractor e a regra simplesmente nao entra no CSS gerado. Nomeados aqui,
      // viram classes estaticas que sempre compilam.
      gridTemplateColumns: {
        'fit-sm': 'repeat(auto-fit,minmax(150px,1fr))',
        'fit-md': 'repeat(auto-fit,minmax(160px,1fr))',
        'fit-lg': 'repeat(auto-fit,minmax(260px,1fr))',
      },
      boxShadow: {
        neon: '0 0 12px rgba(63,224,208,0.45)',
        'neon-sm': '0 0 6px rgba(63,224,208,0.3)',
        gold: '0 0 10px rgba(214,170,78,0.35)',
        red: '0 0 10px rgba(192,99,91,0.4)',
      },
    },
  },
  plugins: [],
};
