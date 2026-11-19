/*
 * <bunker-launcher> — the shared app launcher ("9 dots" menu) for every
 * ElBunkerDelIngeniero sub-app.
 *
 * Single source of truth: the app list lives in apps.json next to this file
 * and both are served once by the platform at /launcher/. Every sub-app
 * (React, Angular, external repos served on the same domain) loads this
 * script and renders <bunker-launcher>. Shadow DOM keeps host CSS out, so the
 * launcher looks the same everywhere and never inherits a missing/transparent
 * background from a host that names its CSS variables differently.
 *
 * Attributes (all optional):
 *   roles      Keycloak realm roles of the current user, space/comma separated.
 *              Also settable as a property with an array.
 *   current    id of the current app; auto-detected from the URL path if absent.
 *   placement  "down" (default) | "up" — panel opens above the button.
 *   align      "end" (default, panel's right edge under the button) | "start".
 *   variant    "default" | "floating" — floating gives the button its own
 *              solid surface + shadow (for buttons drawn over a map).
 *   theme      "light" | "dark" — forces a theme. Otherwise follows
 *              <html data-theme="..."> and falls back to prefers-color-scheme.
 *   registry   URL of the apps.json to use (defaults to the one next to
 *              this script).
 *
 * Plain classic script (no modules, no build step) so it can be injected the
 * same way from any framework.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || !window.customElements) return;
  if (window.customElements.get('bunker-launcher')) return;

  var TAG = 'bunker-launcher';
  var VIEWPORT_MARGIN = 8;
  var LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];

  var scriptSrc = (document.currentScript && document.currentScript.src) || '';
  var DEFAULT_REGISTRY = scriptSrc
    ? new URL('apps.json', scriptSrc).href
    : '/launcher/apps.json';

  // ── Pure helpers (exposed as statics for tests) ───────────────────────────

  var registryCache = new Map();

  function loadRegistry(url) {
    if (!registryCache.has(url)) {
      var promise = fetch(url, { credentials: 'same-origin' })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (data) {
          if (!data || !Array.isArray(data.apps)) throw new Error('Invalid registry');
          return data.apps;
        })
        .catch(function (err) {
          // Do not cache failures: the next element/open retries.
          registryCache.delete(url);
          throw err;
        });
      registryCache.set(url, promise);
    }
    return registryCache.get(url);
  }

  function parseRoles(value) {
    if (Array.isArray(value)) return value.filter(function (r) { return typeof r === 'string' && r; });
    if (typeof value !== 'string') return [];
    return value.split(/[\s,]+/).filter(Boolean);
  }

  // roles: null → visible to everyone, signed in or not (public apps).
  function visibleApps(apps, roles) {
    return apps.filter(function (app) {
      return !app.roles || app.roles.some(function (r) { return roles.indexOf(r) !== -1; });
    });
  }

  function isLocalHost(hostname) {
    return LOCAL_HOSTS.indexOf(hostname) !== -1;
  }

  function appHref(app, hostname) {
    return isLocalHost(hostname) && app.devUrl ? app.devUrl : app.path;
  }

  // Longest path prefix wins, so "/" (Calendario) is only the fallback.
  function detectCurrent(apps, pathname) {
    var best = null;
    apps.forEach(function (app) {
      if (typeof app.path !== 'string') return;
      if (pathname === app.path || pathname.indexOf(app.path) === 0 ||
          pathname + '/' === app.path) {
        if (!best || app.path.length > best.path.length) best = app;
      }
    });
    return best ? best.id : null;
  }

  function systemTheme() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  function resolveTheme(forced) {
    if (forced === 'light' || forced === 'dark') return forced;
    var attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') return attr;
    return systemTheme();
  }

  // ── Template ──────────────────────────────────────────────────────────────

  var STYLE = [
    ':host {',
    '  all: initial;',
    '  display: inline-block;',
    '  position: relative;',
    '  vertical-align: middle;',
    "  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', 'Segoe UI', system-ui, sans-serif;",
    '}',
    ':host([hidden]) { display: none; }',
    '.root {',
    '  --bl-bg: #ffffff;',
    '  --bl-hover: #f5f5f7;',
    '  --bl-current: #e8e8ed;',
    '  --bl-border: #e5e5ea;',
    '  --bl-text: #1d1d1f;',
    '  --bl-text-2: #6e6e73;',
    '  --bl-focus: #0071e3;',
    '  --bl-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);',
    '  position: relative;',
    '}',
    '.root[data-theme="dark"] {',
    '  --bl-bg: #1c1c1e;',
    '  --bl-hover: #2c2c2e;',
    '  --bl-current: #3a3a3c;',
    '  --bl-border: #3a3a3c;',
    '  --bl-text: #f5f5f7;',
    '  --bl-text-2: #aeaeb2;',
    '  --bl-focus: #0a84ff;',
    '  --bl-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);',
    '}',
    '.btn {',
    '  all: unset;',
    '  box-sizing: border-box;',
    '  cursor: pointer;',
    '  width: 32px;',
    '  height: 32px;',
    '  border-radius: 8px;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  color: var(--bl-text-2);',
    '  transition: background 150ms ease, color 150ms ease;',
    '}',
    '.btn:hover, .btn[aria-expanded="true"] { background: var(--bl-hover); color: var(--bl-text); }',
    '.btn:focus-visible { outline: 2px solid var(--bl-focus); outline-offset: 2px; }',
    '.root[data-variant="floating"] .btn {',
    '  width: 36px;',
    '  height: 36px;',
    '  background: var(--bl-bg);',
    '  color: var(--bl-text);',
    '  border: 1px solid var(--bl-border);',
    '  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);',
    '}',
    '.root[data-variant="floating"] .btn:hover,',
    '.root[data-variant="floating"] .btn[aria-expanded="true"] { background: var(--bl-hover); }',
    '.panel {',
    '  box-sizing: border-box;',
    '  position: absolute;',
    '  top: calc(100% + 8px);',
    '  right: 0;',
    '  background: var(--bl-bg);',
    '  border: 1px solid var(--bl-border);',
    '  border-radius: 16px;',
    '  box-shadow: var(--bl-shadow);',
    '  padding: 12px;',
    '  z-index: 1000;',
    '  min-width: 210px;',
    '  max-height: calc(100vh - 88px);',
    '  max-height: calc(100dvh - 88px);',
    '  overflow-y: auto;',
    '  overscroll-behavior: contain;',
    '  animation: bl-in 150ms ease;',
    '}',
    '.panel[hidden] { display: none; }',
    '.root[data-align="start"] .panel { right: auto; left: 0; }',
    '.root[data-placement="up"] .panel { top: auto; bottom: calc(100% + 8px); animation-name: bl-in-up; }',
    '.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }',
    '@media (min-width: 600px) { .grid { grid-template-columns: repeat(4, 1fr); } }',
    '.app {',
    '  display: flex;',
    '  flex-direction: column;',
    '  align-items: center;',
    '  gap: 6px;',
    '  padding: 10px 6px;',
    '  border-radius: 12px;',
    '  text-decoration: none;',
    '  outline: none;',
    '  transition: background 150ms ease;',
    '}',
    '.app:hover { background: var(--bl-hover); }',
    '.app:focus-visible { box-shadow: 0 0 0 2px var(--bl-focus); }',
    '.app[aria-current="page"] { background: var(--bl-current); }',
    '.icon {',
    '  width: 48px;',
    '  height: 48px;',
    '  border-radius: 12px;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  flex-shrink: 0;',
    '}',
    '.name {',
    '  font-size: 11px;',
    '  font-weight: 500;',
    '  line-height: 1.2;',
    '  color: var(--bl-text-2);',
    '  text-align: center;',
    '  white-space: nowrap;',
    '}',
    '.app[aria-current="page"] .name { color: var(--bl-text); font-weight: 600; }',
    '.message { font-size: 12px; color: var(--bl-text-2); padding: 8px; text-align: center; }',
    '@keyframes bl-in { from { opacity: 0; transform: scale(0.95) translateY(-4px); } to { opacity: 1; transform: none; } }',
    '@keyframes bl-in-up { from { opacity: 0; transform: scale(0.95) translateY(4px); } to { opacity: 1; transform: none; } }',
    '@media (prefers-reduced-motion: reduce) { .panel { animation: none; } }',
  ].join('\n');

  var GRID_ICON =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<rect x="3" y="3" width="4" height="4" rx="1"/><rect x="10" y="3" width="4" height="4" rx="1"/>' +
    '<rect x="17" y="3" width="4" height="4" rx="1"/><rect x="3" y="10" width="4" height="4" rx="1"/>' +
    '<rect x="10" y="10" width="4" height="4" rx="1"/><rect x="17" y="10" width="4" height="4" rx="1"/>' +
    '<rect x="3" y="17" width="4" height="4" rx="1"/><rect x="10" y="17" width="4" height="4" rx="1"/>' +
    '<rect x="17" y="17" width="4" height="4" rx="1"/></svg>';

  function appIconSvg(icon) {
    return (
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" ' +
      'stroke-width="1.8" aria-hidden="true">' + (icon || '') + '</svg>'
    );
  }

  // ── Element ───────────────────────────────────────────────────────────────

  class BunkerLauncher extends HTMLElement {
    static get observedAttributes() {
      return ['roles', 'current', 'placement', 'align', 'variant', 'theme', 'registry'];
    }
  }

  var proto = BunkerLauncher.prototype;

  proto._init = function () {
    if (this._root) return;
    this._open = false;
    this._apps = null;
    this._error = false;
    this._rolesProp = null;

    var shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML =
      '<style>' + STYLE + '</style>' +
      '<div class="root" part="root">' +
      '<button class="btn" type="button" part="button" aria-haspopup="true" aria-expanded="false" ' +
      'aria-label="Apps" title="Apps">' + GRID_ICON + '</button>' +
      '<nav class="panel" part="panel" aria-label="Apps" hidden><div class="grid"></div></nav>' +
      '</div>';

    this._root = shadow.querySelector('.root');
    this._button = shadow.querySelector('.btn');
    this._panel = shadow.querySelector('.panel');
    this._grid = shadow.querySelector('.grid');

    var self = this;
    this._button.addEventListener('click', function () { self.toggle(); });
    this._panel.addEventListener('click', function (e) {
      var target = e.target;
      if (target && target.closest && target.closest('a')) self.close();
    });
    this._onDocPointer = function (e) {
      if (!self._open) return;
      var path = e.composedPath ? e.composedPath() : [];
      if (path.indexOf(self) === -1 && !self.contains(e.target)) self.close();
    };
    this._onKey = function (e) {
      if (!self._open) return;
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.stopPropagation();
        self.close();
        self._button.focus();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' ||
                 e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        self._moveFocus(e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1, e);
      }
    };
    this._onFocusOut = function (e) {
      // Keyboard users tabbing out of the panel close it.
      if (!self._open) return;
      var next = e.relatedTarget;
      if (next && next !== self && !self.contains(next) &&
          !self.shadowRoot.contains(next)) {
        self.close();
      }
    };
    this._onResize = function () { if (self._open) self._clampToViewport(); };
    this._onThemeChange = function () { self._applyTheme(); };
  };

  proto.connectedCallback = function () {
    this._init();
    // A framework may have set `el.roles = [...]` before this script loaded;
    // that own property would shadow the accessor, so re-apply it.
    if (Object.prototype.hasOwnProperty.call(this, 'roles')) {
      var early = this.roles;
      delete this.roles;
      this.roles = early;
    }
    document.addEventListener('mousedown', this._onDocPointer, true);
    document.addEventListener('touchstart', this._onDocPointer, true);
    this.shadowRoot.addEventListener('keydown', this._onKey);
    this.shadowRoot.addEventListener('focusout', this._onFocusOut);
    window.addEventListener('resize', this._onResize);

    this._themeObserver = new MutationObserver(this._onThemeChange);
    this._themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    if (window.matchMedia) {
      this._mql = window.matchMedia('(prefers-color-scheme: dark)');
      if (this._mql.addEventListener) this._mql.addEventListener('change', this._onThemeChange);
      else if (this._mql.addListener) this._mql.addListener(this._onThemeChange);
    }

    this._syncAttrs();
    this._applyTheme();
    this._load();
  };

  proto.disconnectedCallback = function () {
    document.removeEventListener('mousedown', this._onDocPointer, true);
    document.removeEventListener('touchstart', this._onDocPointer, true);
    this.shadowRoot.removeEventListener('keydown', this._onKey);
    this.shadowRoot.removeEventListener('focusout', this._onFocusOut);
    window.removeEventListener('resize', this._onResize);
    if (this._themeObserver) this._themeObserver.disconnect();
    if (this._mql) {
      if (this._mql.removeEventListener) this._mql.removeEventListener('change', this._onThemeChange);
      else if (this._mql.removeListener) this._mql.removeListener(this._onThemeChange);
    }
  };

  proto.attributeChangedCallback = function (name) {
    if (!this._root) return;
    if (name === 'theme') this._applyTheme();
    else if (name === 'registry') { this._apps = null; this._load(); }
    else if (name === 'roles') { this._rolesProp = null; this._render(); }
    else { this._syncAttrs(); this._render(); }
  };

  Object.defineProperty(proto, 'roles', {
    get: function () {
      return this._rolesProp ? this._rolesProp.slice() : parseRoles(this.getAttribute('roles'));
    },
    set: function (value) {
      this._init();
      this._rolesProp = parseRoles(value);
      this._render();
    },
  });

  Object.defineProperty(proto, 'open', {
    get: function () { return !!this._open; },
  });

  proto._syncAttrs = function () {
    this._root.setAttribute('data-placement', this.getAttribute('placement') === 'up' ? 'up' : 'down');
    this._root.setAttribute('data-align', this.getAttribute('align') === 'start' ? 'start' : 'end');
    this._root.setAttribute('data-variant', this.getAttribute('variant') === 'floating' ? 'floating' : 'default');
  };

  proto._applyTheme = function () {
    this._root.setAttribute('data-theme', resolveTheme(this.getAttribute('theme')));
  };

  proto._load = function () {
    var self = this;
    var url = this.getAttribute('registry') || DEFAULT_REGISTRY;
    this._error = false;
    return loadRegistry(url).then(
      function (apps) { self._apps = apps; self._render(); },
      function () { self._error = true; self._render(); }
    );
  };

  proto._render = function () {
    if (!this._grid) return;
    var grid = this._grid;
    while (grid.firstChild) grid.removeChild(grid.firstChild);

    if (!this._apps) {
      if (this._error) {
        var msg = document.createElement('p');
        msg.className = 'message';
        msg.textContent = "Couldn't load the app list.";
        grid.appendChild(msg);
      }
      return;
    }

    var apps = visibleApps(this._apps, this.roles);
    var current = this.getAttribute('current') || detectCurrent(this._apps, window.location.pathname);
    var hostname = window.location.hostname;

    apps.forEach(function (app) {
      var a = document.createElement('a');
      a.className = 'app';
      a.setAttribute('href', appHref(app, hostname));
      a.setAttribute('data-app-id', app.id);
      if (app.id === current) a.setAttribute('aria-current', 'page');

      var icon = document.createElement('span');
      icon.className = 'icon';
      icon.style.background = app.color;
      // Icon markup comes from the same-origin, reviewed registry (apps.json is
      // validated by the launcher test suite: shape elements only, no handlers).
      icon.innerHTML = appIconSvg(app.icon);

      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = app.name;

      a.appendChild(icon);
      a.appendChild(name);
      grid.appendChild(a);
    });

    if (this._open) this._clampToViewport();
  };

  proto.toggle = function () {
    if (this._open) this.close();
    else this.show();
  };

  proto.show = function () {
    this._init();
    if (this._open) return;
    this._open = true;
    this._panel.hidden = false;
    this._button.setAttribute('aria-expanded', 'true');
    if (this._error) this._load();
    this._clampToViewport();
    this.dispatchEvent(new CustomEvent('bunker-launcher-toggle', { detail: { open: true } }));
  };

  proto.close = function () {
    if (!this._open) return;
    this._open = false;
    this._panel.hidden = true;
    this._panel.style.left = '';
    this._panel.style.right = '';
    this._button.setAttribute('aria-expanded', 'false');
    this.dispatchEvent(new CustomEvent('bunker-launcher-toggle', { detail: { open: false } }));
  };

  proto._moveFocus = function (delta, event) {
    var links = Array.prototype.slice.call(this._grid.querySelectorAll('a'));
    if (!links.length) return;
    var active = this.shadowRoot.activeElement;
    var index = links.indexOf(active);
    var next = index === -1 ? (delta > 0 ? 0 : links.length - 1)
      : (index + delta + links.length) % links.length;
    links[next].focus();
    event.preventDefault();
  };

  // If the panel would overflow the viewport horizontally (button near the
  // edge of a narrow sidebar or a phone screen), re-anchor it with an explicit
  // `left` instead of the fixed right/left: 0 from the stylesheet.
  proto._clampToViewport = function () {
    var panel = this._panel;
    panel.style.left = '';
    panel.style.right = '';
    var rect = panel.getBoundingClientRect();
    if (!rect.width) return; // not laid out (e.g. jsdom)
    var hostRect = this._root.getBoundingClientRect();
    var maxLeft = window.innerWidth - VIEWPORT_MARGIN - rect.width;
    var desired = Math.max(VIEWPORT_MARGIN, Math.min(rect.left, maxLeft));
    if (desired !== rect.left) {
      panel.style.left = (desired - hostRect.left) + 'px';
      panel.style.right = 'auto';
    }
  };

  BunkerLauncher.parseRoles = parseRoles;
  BunkerLauncher.visibleApps = visibleApps;
  BunkerLauncher.detectCurrent = detectCurrent;
  BunkerLauncher.appHref = appHref;
  BunkerLauncher.resolveTheme = resolveTheme;
  BunkerLauncher.loadRegistry = loadRegistry;
  BunkerLauncher.clearRegistryCache = function () { registryCache.clear(); };
  BunkerLauncher.DEFAULT_REGISTRY = DEFAULT_REGISTRY;

  window.customElements.define(TAG, BunkerLauncher);
})();
