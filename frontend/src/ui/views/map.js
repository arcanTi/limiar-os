// SYS.03 // MAP: the live-triangulation node map and its GM node editor.
export function mapRenderVals(state = {}, deps = {}) {
  const S = state;
  const mapLocations = S.mapLocations || [];
  const mapNodes = mapLocations.map((n, i) => {
    const sel = i === S.mapSel;
    const c = n.active ? '#3fe0d0' : sel ? '#d6aa4e' : '#6f7a64';
    return {
      ...n,
      onClick: () => deps.setMapSel(i),
      labelColor: sel ? '#f0ead8' : '#9a9883',
      dotStyle: 'width:' + (sel ? 16 : 12) + 'px;height:' + (sel ? 16 : 12) + 'px;border:2px solid ' + c + ';background:' + (n.active ? 'rgba(63,224,208,0.3)' : sel ? 'rgba(214,170,78,0.25)' : 'transparent') + ';box-shadow:0 0 ' + (n.active ? '14px #3fe0d0' : sel ? '10px #d6aa4e' : '0') + ';' + (n.active ? 'animation:auraPulse 1.6s ease-in-out infinite;' : '') + 'border-radius:50%;',
    };
  });
  const mn = mapLocations[S.mapSel] || mapLocations[0] || { name: 'NO MAP DATA', sub: 'EMPTY', threat: 'NONE', desc: 'Map API returned no locations.' };
  const threatColors = { NONE: '#3fe0d0', LOW: '#3fe0d0', MED: '#d6aa4e', HIGH: '#d6aa4e', CRITICAL: '#c0635b' };
  const mapInfo = { ...mn, threatColor: threatColors[mn.threat] || '#9a9883' };
  const gmMapDraft = S.gmMapDraft || {};

  return {
    mapNodes,
    mapInfo,
    mapImageUrl: S.mapImageUrl,
    gmMapName: gmMapDraft.name,
    gmMapThreat: gmMapDraft.threat,
    onGmMapName: (e) => deps.setGmMapField('name', e.target.value),
    onGmMapThreat: (e) => deps.setGmMapField('threat', e.target.value),
    triggerGmMapUpload: deps.triggerGmMapUpload,
    onGmMapImageUpload: deps.onGmMapImageUpload,
    upsertGmMap: deps.upsertGmMap,
  };
}

// component: the Component instance. triggerFileInput/uploadImage/ensureGm/
// flash/api/store/setState already live there (shared across every GM
// upload/upsert flow, not map-specific).
export function mapHandlers(component) {
  return {
    setMapSel: (i) => component.setState({ mapSel: i }),
    setGmMapField: (key, value) => component.setState(s => ({ gmMapDraft: { ...s.gmMapDraft, [key]: value } })),
    triggerGmMapUpload: () => component.triggerFileInput('gm-map-upload'),

    async onGmMapImageUpload(e) {
      const file = e.target.files && e.target.files[0];
      const asset = await component.uploadImage(file, 'map-image', 'current-map');
      if (asset && asset.url) {
        component.setState(s => ({ mapImageUrl: asset.url, gmMapDraft: { ...s.gmMapDraft, imageUrl: asset.url }, gmStatus: 'Map image uploaded' }));
      }
      e.target.value = '';
    },

    async upsertGmMap() {
      if (!component.ensureGm('Login do mestre necessario para salvar mapa')) return;
      const d = component.state.gmMapDraft;
      if (!(d.name || '').trim()) { component.flash('Nome do node obrigatorio.'); return; }
      const name = (d.name || 'NEW NODE').trim().toUpperCase();
      const node = {
        id: component.store().slug ? component.store().slug(name) : name.toLowerCase(),
        name, sub: 'GM NODE', left: 50, top: 50, active: false,
        threat: (d.threat || 'MED').trim().toUpperCase(),
        desc: 'GM-created map node. Adjust position, threat, and description for the scene.',
        imageUrl: d.imageUrl,
      };
      component._mapTouched = true;
      const saved = component.api() ? await component.api().map.upsert(node) : node;
      component.setState(s => ({
        mapLocations: [...(s.mapLocations || []).filter(n => n.id !== saved.id), saved],
        mapSel: Math.max(0, (s.mapLocations || []).length),
        gmStatus: 'Map node saved: ' + saved.name,
      }));
    },
  };
}
