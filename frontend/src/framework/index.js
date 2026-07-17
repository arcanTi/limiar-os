// Micro-framework (ex-support.js): DCLogic base + mustache template engine + DOM patcher.
// Refactored to an ES module: the component class is now imported and handed to
// `mountComponent` directly, instead of being fetched and built via `new Function`.

const kebab = (key) => key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
const toCss = (value) => {
  if (!value || typeof value !== 'object') return value == null ? '' : String(value);
  return Object.entries(value).map(([k, v]) => kebab(k) + ':' + v).join(';');
};
const escapeHtml = (value) => String(value == null ? '' : value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

// Attribute values are written with setAttribute (the DOM neutralizes quote
// breakout on its own), so HTML-escaping them is wrong — it would corrupt
// legitimate values like `&` in query strings. The real attribute-level risk
// is dangerous URL schemes and active CSS, so we sanitize those instead.
const URL_ATTRS = new Set(['src', 'data-src', 'href', 'xlink:href', 'poster', 'formaction']);
const DANGEROUS_SCHEME = /^\s*(?:javascript|vbscript)\s*:/i;
// Block every data: URL except inline raster/vector images, which portraits use.
const UNSAFE_DATA_URL = /^\s*data\s*:(?!image\/(?:png|jpe?g|gif|webp|avif|svg\+xml)\s*[;,])/i;
const sanitizeUrl = (value) => {
  const str = String(value == null ? '' : value);
  if (DANGEROUS_SCHEME.test(str) || UNSAFE_DATA_URL.test(str)) return '';
  return str;
};
const sanitizeCss = (value) => String(value == null ? '' : value)
  .replace(/(?:javascript|vbscript)\s*:/gi, '')
  .replace(/expression\s*\(/gi, '')
  // url() may only point at http(s) or inline images, never script/text payloads.
  .replace(/url\(\s*(['"]?)\s*(?:javascript|vbscript|data:(?!image\/))[^)]*\1\s*\)/gi, 'url()');
const applyAttr = (node, targetName, name, raw) => {
  let value = raw;
  if (name === 'style') value = sanitizeCss(value);
  if (URL_ATTRS.has(name)) value = sanitizeUrl(value);
  node.setAttribute(targetName, value);
};

export class DCLogic {
  constructor(props) {
    this.props = props || {};
    this.state = this.state || {};
  }
  setState(update) {
    const patch = typeof update === 'function' ? update(this.state, this.props) : update;
    if (!patch) return;
    this.state = { ...this.state, ...patch };
    if (this.__render) this.__render();
  }
}
if (typeof window !== 'undefined') window.DCLogic = DCLogic;

const readPath = (path, vals, ctx) => {
  const parts = String(path || '').trim().split('.').filter(Boolean);
  let cur = Object.prototype.hasOwnProperty.call(ctx, parts[0]) ? ctx[parts[0]] : vals[parts[0]];
  for (let i = 1; i < parts.length; i++) cur = cur == null ? undefined : cur[parts[i]];
  return cur;
};
const unwrap = (raw) => {
  const m = String(raw || '').match(/^\s*\{\{\s*([\s\S]*?)\s*\}\}\s*$/);
  return m ? m[1] : null;
};
const replaceMustache = (text, vals, ctx, attrMode) => String(text || '').replace(/\{\{\s*([\s\S]*?)\s*\}\}/g, (_, expr) => {
  const value = readPath(expr, vals, ctx);
  // Text-node interpolation is assigned with textContent, so the DOM already
  // treats it as literal text. Escaping here would render visible entities like
  // &gt; in chat and roll messages.
  return attrMode ? String(value == null ? '' : value) : String(value == null ? '' : value);
});

const processNode = (node, vals, ctx, events) => {
  if (node.nodeType === Node.TEXT_NODE) {
    node.textContent = replaceMustache(node.textContent, vals, ctx, false);
    return [node];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return [node];

  const tag = node.tagName.toLowerCase();
  if (tag === 'sc-if') {
    const expr = unwrap(node.getAttribute('value'));
    const show = !!readPath(expr, vals, ctx);
    if (!show) return [];
    return [...node.childNodes].flatMap((child) => processNode(child.cloneNode(true), vals, ctx, events));
  }
  if (tag === 'sc-for') {
    const listExpr = unwrap(node.getAttribute('list'));
    const list = readPath(listExpr, vals, ctx) || [];
    const as = node.getAttribute('as') || 'item';
    return Array.from(list).flatMap((item, index) => {
      const nextCtx = { ...ctx, [as]: item, index };
      return [...node.childNodes].flatMap((child) => processNode(child.cloneNode(true), vals, nextCtx, events));
    });
  }
  if (tag === 'helmet') return [];

  [...node.attributes].forEach((attr) => {
    const name = attr.name.toLowerCase();
    const targetName = name === 'data-src' ? 'src' : attr.name;
    if (name === 'style-hover') {
      node.setAttribute('data-dc-hover-style', sanitizeCss(replaceMustache(attr.value, vals, ctx, true)));
      node.removeAttribute(attr.name);
      return;
    }
    if (name.startsWith('hint-')) {
      node.removeAttribute(attr.name);
      return;
    }
    if (name === 'onclick' || name === 'oninput' || name === 'onchange') {
      const expr = unwrap(attr.value);
      const fn = readPath(expr, vals, ctx);
      node.removeAttribute(attr.name);
      if (typeof fn === 'function') {
        const id = String(events.length);
        events.push(fn);
        node.setAttribute('data-dc-' + name.slice(2), id);
      }
      return;
    }
    const fullExpr = unwrap(attr.value);
    if (fullExpr != null) {
      const value = readPath(fullExpr, vals, ctx);
      if (name === 'data-src') node.removeAttribute(attr.name);
      applyAttr(node, targetName, name, attr.name === 'style' ? toCss(value) : String(value == null ? '' : value));
    } else if (attr.value.includes('{{')) {
      if (name === 'data-src') node.removeAttribute(attr.name);
      applyAttr(node, targetName, name, replaceMustache(attr.value, vals, ctx, true));
    }
  });

  [...node.childNodes].forEach((child) => {
    const processed = processNode(child, vals, ctx, events);
    if (processed.length === 1 && processed[0] === child) return;
    processed.forEach((next) => node.insertBefore(next, child));
    node.removeChild(child);
  });
  return [node];
};

const isSameNode = (current, next) => {
  if (!current || !next || current.nodeType !== next.nodeType) return false;
  if (current.nodeType === Node.ELEMENT_NODE) {
    if (current.tagName !== next.tagName) return false;
    const currentId = current.getAttribute('id');
    const nextId = next.getAttribute('id');
    return !currentId || !nextId || currentId === nextId;
  }
  return true;
};

const syncFormValue = (current, next) => {
  const tag = current.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') {
    const nextValue = next.getAttribute('value');
    if (nextValue != null && current.value !== nextValue) current.value = nextValue;
    if (current.checked !== next.checked) current.checked = next.checked;
  } else if (tag === 'SELECT' && current.value !== next.value) {
    current.value = next.value;
  }
};

const syncAttributes = (current, next) => {
  // When a re-render lands on an element the cursor is currently hovering, the
  // live `style` holds base+hover and `data-dc-base-style` holds the pristine
  // base. A naive sync would drop that bookkeeping, so a later mouseout would
  // restore to '' — wiping clip-path/background and flashing the raw element.
  const hovered = current.hasAttribute('data-dc-base-style');
  const nextHover = next.getAttribute('data-dc-hover-style') || '';
  [...current.attributes].forEach((attr) => {
    if (hovered && attr.name === 'data-dc-base-style') return;
    if (!next.hasAttribute(attr.name)) current.removeAttribute(attr.name);
  });
  [...next.attributes].forEach((attr) => {
    if (hovered && attr.name === 'style') {
      // `next` carries the un-hovered style: record it as the new base and
      // keep the element showing base+hover so mouseout restores correctly.
      if (current.getAttribute('data-dc-base-style') !== attr.value) current.setAttribute('data-dc-base-style', attr.value);
      const live = attr.value + ';' + nextHover;
      if (current.getAttribute('style') !== live) current.setAttribute('style', live);
      return;
    }
    if (current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name, attr.value);
  });
  syncFormValue(current, next);
};

const primeFormValues = (node) => {
  if (node.nodeType !== Node.ELEMENT_NODE) return node;
  syncFormValue(node, node);
  node.querySelectorAll('input, textarea, select').forEach((el) => syncFormValue(el, el));
  return node;
};

const patchChildren = (current, next) => {
  let child = current.firstChild;
  let nextChild = next.firstChild;
  while (nextChild) {
    const followingNext = nextChild.nextSibling;
    if (!child) {
      current.appendChild(primeFormValues(nextChild.cloneNode(true)));
    } else {
      const followingCurrent = child.nextSibling;
      patchNode(current, child, nextChild);
      child = followingCurrent;
    }
    nextChild = followingNext;
  }
  while (child) {
    const followingCurrent = child.nextSibling;
    current.removeChild(child);
    child = followingCurrent;
  }
};

const patchNode = (parent, current, next) => {
  if (!isSameNode(current, next)) {
    if (
      current.nodeType === Node.ELEMENT_NODE &&
      next.nodeType === Node.ELEMENT_NODE &&
      current.id &&
      current.id === next.id &&
      current.getAttribute('data-dc-preserve-children') === 'true'
    ) {
      syncAttributes(current, next);
      return;
    }
    parent.replaceChild(primeFormValues(next.cloneNode(true)), current);
    return;
  }
  if (current.nodeType === Node.TEXT_NODE) {
    if (current.textContent !== next.textContent) current.textContent = next.textContent;
    return;
  }
  if (current.nodeType !== Node.ELEMENT_NODE) return;
  syncAttributes(current, next);
  if (current.getAttribute('data-dc-preserve-children') === 'true' && current.childNodes.length && !next.childNodes.length) return;
  patchChildren(current, next);
};

export const patchRoot = (root, nodes) => {
  const holder = document.createElement('div');
  holder.append(...nodes);
  patchChildren(root, holder);
};

const closestEventTarget = (target, selector, root) => {
  if (!target || target.nodeType !== Node.ELEMENT_NODE) target = target && target.parentElement;
  const el = target && target.closest ? target.closest(selector) : null;
  return el && root.contains(el) ? el : null;
};

const bindDelegatedEvents = (root, component, getEvents) => {
  root.addEventListener('click', (e) => {
    const el = closestEventTarget(e.target, '[data-dc-click]', root);
    if (!el) return;
    const fn = getEvents()[Number(el.getAttribute('data-dc-click'))];
    if (typeof fn === 'function') fn.call(component, e);
  });
  root.addEventListener('input', (e) => {
    const el = closestEventTarget(e.target, '[data-dc-input]', root);
    if (!el) return;
    const fn = getEvents()[Number(el.getAttribute('data-dc-input'))];
    if (typeof fn === 'function') fn.call(component, e);
  });
  root.addEventListener('change', (e) => {
    const el = closestEventTarget(e.target, '[data-dc-change]', root);
    if (!el) return;
    const fn = getEvents()[Number(el.getAttribute('data-dc-change'))];
    if (typeof fn === 'function') fn.call(component, e);
  });
  root.addEventListener('mouseover', (e) => {
    const el = closestEventTarget(e.target, '[data-dc-hover-style]', root);
    if (!el || (e.relatedTarget && el.contains(e.relatedTarget))) return;
    el.setAttribute('data-dc-base-style', el.getAttribute('style') || '');
    el.setAttribute('style', (el.getAttribute('data-dc-base-style') || '') + ';' + (el.getAttribute('data-dc-hover-style') || ''));
  });
  root.addEventListener('mouseout', (e) => {
    const el = closestEventTarget(e.target, '[data-dc-hover-style]', root);
    if (!el || (e.relatedTarget && el.contains(e.relatedTarget))) return;
    el.setAttribute('style', el.getAttribute('data-dc-base-style') || '');
    el.removeAttribute('data-dc-base-style');
  });
};

const renderMountError = (root, err) => {
  console.error('DC mount failed:', err);
  if (!root) return;
  const message = err && (err.stack || err.message) ? (err.stack || err.message) : String(err || 'unknown error');
  root.innerHTML = '<div style="min-height:100vh;background:#080a07;color:#f0ead8;font:14px monospace;padding:24px;box-sizing:border-box;">'
    + '<div style="border:1px solid rgba(192,99,91,.5);background:rgba(192,99,91,.08);padding:16px;white-space:pre-wrap;">'
    + '<strong style="color:#c0635b;">LIMIAR OS BOOT ERROR</strong>\n'
    + escapeHtml(message)
    + '</div></div>';
};

// Mount a component class into the page's <x-dc> root. The root's innerHTML is the
// template; the class provides renderVals() for the value bag and event handlers.
export function mountComponent(ComponentClass, props) {
  const root = document.querySelector('x-dc');
  try {
    if (!root) return null;
    document.querySelectorAll('[data-dc-helmet]').forEach((node) => node.remove());
    root.querySelectorAll('helmet > *').forEach((node) => {
      const clone = node.cloneNode(true);
      if (clone.nodeType === Node.ELEMENT_NODE) clone.setAttribute('data-dc-helmet', '');
      document.head.appendChild(clone);
    });
    const template = root.innerHTML;
    const component = new ComponentClass(props || {});
    let currentEvents = [];
    bindDelegatedEvents(root, component, () => currentEvents);
    const render = () => {
      const vals = component.renderVals ? component.renderVals() : {};
      const temp = document.createElement('template');
      temp.innerHTML = template;
      const events = [];
      const nodes = [...temp.content.childNodes].flatMap((node) => processNode(node.cloneNode(true), vals, {}, events));
      currentEvents = events;
      patchRoot(root, nodes);
    };
    component.__render = render;
    render();
    if (component.componentDidMount) component.componentDidMount();
    if (typeof window !== 'undefined') window.__dcComponent = component;
    return component;
  } catch (err) {
    renderMountError(root, err);
    return null;
  }
}
