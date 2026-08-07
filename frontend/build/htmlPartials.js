import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

const INCLUDE_PATTERN = /<!--\s*@include\s+([^\s]+)\s*-->/g;

export function expandHtmlPartials(html, options = {}) {
  const root = resolve(options.root || process.cwd());
  const partialRoot = resolve(root, 'frontend/templates');
  const load = options.load || ((file) => readFileSync(file, 'utf8'));
  let expanded = String(html || '');

  for (let depth = 0; depth < 10 && INCLUDE_PATTERN.test(expanded); depth += 1) {
    INCLUDE_PATTERN.lastIndex = 0;
    expanded = expanded.replace(INCLUDE_PATTERN, (_match, requested) => {
      const file = resolve(root, requested);
      const outsideRoot = relative(partialRoot, file).startsWith('..') || isAbsolute(relative(partialRoot, file));
      if (outsideRoot) throw new Error(`HTML partial must live under frontend/templates: ${requested}`);
      return load(file);
    });
  }

  INCLUDE_PATTERN.lastIndex = 0;
  if (INCLUDE_PATTERN.test(expanded)) throw new Error('HTML partial expansion exceeded the nesting limit');
  INCLUDE_PATTERN.lastIndex = 0;
  return expanded;
}

export function htmlPartialsPlugin(root) {
  return {
    name: 'limiar-html-partials',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => expandHtmlPartials(html, { root }),
    },
  };
}
