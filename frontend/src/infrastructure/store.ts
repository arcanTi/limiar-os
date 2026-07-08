// Infrastructure asset helpers plus API factory reexports.
// Fase 6 moved network resources into infrastructure/api/*; main.js injects the
// API/Store into Component instead of relying on window globals.

export { createLimiarAPI } from './api/index.ts';

export const slug = (text: unknown): string => String(text || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)/g, '') || 'item';

export const svgCard = (code: unknown, name: unknown, cat: unknown, accent: unknown): string => {
  const safeCode = String(code || 'ITEM').replace(/[<>&]/g, '');
  const safeName = String(name || cat || 'Cyberware').replace(/[<>&]/g, '');
  const safeCat = String(cat || 'GEAR').replace(/[<>&]/g, '');
  const color = accent || '#d6aa4e';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="560" viewBox="0 0 900 560">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop stop-color="#080a07"/>
          <stop offset=".52" stop-color="#10170f"/>
          <stop offset="1" stop-color="#071614"/>
        </linearGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <rect width="900" height="560" fill="url(#bg)"/>
      <path d="M50 78H850M50 482H850M88 42V518M812 42V518" stroke="${color}" stroke-opacity=".32" stroke-width="2"/>
      <g stroke="#3fe0d0" stroke-opacity=".16" stroke-width="1">
        <path d="M0 116H900M0 188H900M0 260H900M0 332H900M0 404H900"/>
        <path d="M156 0V560M300 0V560M444 0V560M588 0V560M732 0V560"/>
      </g>
      <circle cx="450" cy="275" r="145" fill="none" stroke="${color}" stroke-opacity=".35" stroke-width="4" filter="url(#glow)"/>
      <path d="M332 282h236M450 164v236M366 198l168 168M534 198L366 366" stroke="#3fe0d0" stroke-opacity=".42" stroke-width="3"/>
      <text x="450" y="252" fill="#f0ead8" font-family="monospace" font-size="54" font-weight="700" text-anchor="middle">${safeCode}</text>
      <text x="450" y="304" fill="${color}" font-family="monospace" font-size="22" letter-spacing="5" text-anchor="middle">${safeCat}</text>
      <text x="450" y="438" fill="#a8a48f" font-family="monospace" font-size="25" text-anchor="middle">${safeName}</text>
    </svg>`;
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
};

export const LimiarStore = { svgCard, slug };
