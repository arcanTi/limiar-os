// Shared text helpers used across domain modules. Pure — no DOM, no state.

// Slugify into a lowercase, dash-separated id (falls back to "item").
export function slug(text: unknown): string {
  return String(text || 'item').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'item';
}
