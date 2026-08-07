import { describe, expect, it, vi } from 'vitest';

import { mapHandlers, mapRenderVals } from '../../../src/ui/views/map.js';

const baseDeps = () => ({
  setMapSel: vi.fn(),
  setGmMapField: vi.fn(),
  triggerGmMapUpload: vi.fn(),
  onGmMapImageUpload: vi.fn(),
  upsertGmMap: vi.fn(),
});

describe('ui/views/map mapRenderVals', () => {
  const locations = [
    { id: 'a', name: 'Night Market', threat: 'MED', active: false },
    { id: 'b', name: 'Arasaka Tower', threat: 'CRITICAL', active: true },
  ];

  it('marks the selected node with the selected label color', () => {
    const vals = mapRenderVals({ mapLocations: locations, mapSel: 0 }, baseDeps());
    expect(vals.mapNodes).toHaveLength(2);
    expect(vals.mapNodes[0].labelColor).toBe('#f0ead8'); // selected
    expect(vals.mapNodes[1].labelColor).toBe('#9a9883'); // not selected
  });

  it('an active node gets the teal active dot regardless of selection', () => {
    const vals = mapRenderVals({ mapLocations: locations, mapSel: 0 }, baseDeps());
    expect(vals.mapNodes[1].dotStyle).toContain('#3fe0d0');
    expect(vals.mapNodes[1].dotStyle).toContain('auraPulse');
  });

  it('clicking a node calls deps.setMapSel with its index', () => {
    const deps = baseDeps();
    const vals = mapRenderVals({ mapLocations: locations, mapSel: 0 }, deps);
    vals.mapNodes[1].onClick();
    expect(deps.setMapSel).toHaveBeenCalledWith(1);
  });

  it('mapInfo reflects the selected location with a threat color', () => {
    const vals = mapRenderVals({ mapLocations: locations, mapSel: 1 }, baseDeps());
    expect(vals.mapInfo).toMatchObject({ name: 'Arasaka Tower', threatColor: '#c0635b' });
  });

  it('falls back to a placeholder when there are no map locations', () => {
    const vals = mapRenderVals({ mapLocations: [], mapSel: 0 }, baseDeps());
    expect(vals.mapInfo).toMatchObject({ name: 'NO MAP DATA', threat: 'NONE' });
  });

  it('wires the GM map draft fields through deps', () => {
    const deps = baseDeps();
    const vals = mapRenderVals({ mapLocations: [], gmMapDraft: { name: 'Pier 9', threat: 'HIGH' } }, deps);
    expect(vals.gmMapName).toBe('Pier 9');
    expect(vals.gmMapThreat).toBe('HIGH');
    vals.onGmMapName({ target: { value: 'New Name' } });
    expect(deps.setGmMapField).toHaveBeenCalledWith('name', 'New Name');
    vals.onGmMapThreat({ target: { value: 'LOW' } });
    expect(deps.setGmMapField).toHaveBeenCalledWith('threat', 'LOW');
  });
});

function fakeComponent(overrides = {}) {
  return {
    state: { mapLocations: [], gmMapDraft: { name: '', threat: 'MED', imageUrl: '' }, ...overrides.state },
    setState: vi.fn(function (patch) {
      const next = typeof patch === 'function' ? patch(this.state) : patch;
      this.state = { ...this.state, ...next };
    }),
    ensureGm: overrides.ensureGm || vi.fn(() => true),
    flash: vi.fn(),
    store: vi.fn(() => ({ slug: (s) => s.toLowerCase().replace(/\s+/g, '-') })),
    api: overrides.api || vi.fn(() => ({ map: { upsert: vi.fn(async (node) => node) } })),
    triggerFileInput: vi.fn(),
    uploadImage: overrides.uploadImage || vi.fn(async () => ({ url: 'blob://map.png' })),
  };
}

describe('ui/views/map mapHandlers', () => {
  it('setMapSel updates mapSel', () => {
    const component = fakeComponent();
    mapHandlers(component).setMapSel(2);
    expect(component.state.mapSel).toBe(2);
  });

  it('setGmMapField merges a single field into gmMapDraft', () => {
    const component = fakeComponent();
    mapHandlers(component).setGmMapField('name', 'Pier 9');
    expect(component.state.gmMapDraft.name).toBe('Pier 9');
  });

  it('triggerGmMapUpload delegates to component.triggerFileInput', () => {
    const component = fakeComponent();
    mapHandlers(component).triggerGmMapUpload();
    expect(component.triggerFileInput).toHaveBeenCalledWith('gm-map-upload');
  });

  it('onGmMapImageUpload stores the uploaded url on both mapImageUrl and the draft', async () => {
    const component = fakeComponent();
    const input = { files: [{ name: 'x.png' }], value: 'x.png' };
    await mapHandlers(component).onGmMapImageUpload({ target: input });
    expect(component.state.mapImageUrl).toBe('blob://map.png');
    expect(component.state.gmMapDraft.imageUrl).toBe('blob://map.png');
    expect(input.value).toBe('');
  });

  it('upsertGmMap requires GM auth', async () => {
    const component = fakeComponent({ ensureGm: vi.fn(() => false) });
    await mapHandlers(component).upsertGmMap();
    expect(component.state.mapLocations).toEqual([]);
  });

  it('upsertGmMap requires a node name', async () => {
    const component = fakeComponent({ state: { gmMapDraft: { name: '', threat: 'MED' } } });
    await mapHandlers(component).upsertGmMap();
    expect(component.flash).toHaveBeenCalledWith('Nome do node obrigatorio.');
  });

  it('upsertGmMap saves a new node, uppercasing name/threat and slugging the id', async () => {
    const component = fakeComponent({ state: { gmMapDraft: { name: 'pier 9', threat: 'high', imageUrl: 'x' } } });
    await mapHandlers(component).upsertGmMap();
    expect(component.state.mapLocations).toHaveLength(1);
    expect(component.state.mapLocations[0]).toMatchObject({ id: 'pier-9', name: 'PIER 9', threat: 'HIGH' });
    expect(component.state.gmStatus).toBe('Map node saved: PIER 9');
    expect(component._mapTouched).toBe(true);
  });

  it('upsertGmMap replaces an existing node with the same id instead of duplicating it', async () => {
    const component = fakeComponent({ state: { mapLocations: [{ id: 'pier-9', name: 'PIER 9', threat: 'MED' }], gmMapDraft: { name: 'pier 9', threat: 'high' } } });
    await mapHandlers(component).upsertGmMap();
    expect(component.state.mapLocations).toHaveLength(1);
    expect(component.state.mapLocations[0].threat).toBe('HIGH');
  });
});
