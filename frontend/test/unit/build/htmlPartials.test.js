import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { expandHtmlPartials } from '../../../build/htmlPartials.js';

const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const sourcePath = fileURLToPath(new URL('../../../index.html', import.meta.url));

describe('HTML partials', () => {
  it('expands the shared character sheet body into both layouts', () => {
    const source = readFileSync(sourcePath, 'utf8');
    const expanded = expandHtmlPartials(source, { root: repositoryRoot });

    expect(source.match(/@include frontend\/templates\/character-sheet-content\.html/g)).toHaveLength(2);
    expect(expanded).not.toContain('@include');
    expect(expanded.match(/data-limiar-skill-columns="edit"/g)).toHaveLength(2);
    // Two layouts, and inside each the CORE headings render twice: a foldable
    // button for the GM and a plain title for the player.
    expect(expanded.match(/DOSSIER COMPLETO \/\/ STATUS OPERACIONAL/g)).toHaveLength(4);
    expect(expanded.match(/class="lm-sheet-fold"/g)).toHaveLength(8);
    expect(expanded.match(/NETRUNNING \/\/ INTERFACE/g)).toHaveLength(2);
    expect(expanded.match(/class="lm-core-attrs"/g)).toHaveLength(2);
  });

  it('rejects partials outside the dedicated template directory', () => {
    expect(() => expandHtmlPartials('<!-- @include README.md -->', { root: repositoryRoot }))
      .toThrow(/frontend\/templates/);
  });
});
