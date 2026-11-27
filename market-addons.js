/*
 * Catálogo único de Prizmothyn.
 * Mezcla en una sola cuadrícula los contenidos de tu Apps Script y de la Store (PlayFab).
 * Orden aleatorio. Descarga de la Store mediante el worker + WASM.
 * Se carga con <script src="market-addons.js"></script> dentro de index.html.
 */
(function () {
  'use strict';

  var API_URL = 'https://script.google.com/macros/s/AKfycbzG8QOsYT3RICly7rITgydaCDQtgmZSx0rvh2xnZUzc4_o0yTW21wtoHHzHWfwocSHG/exec';
  var PF = 'https://20ca2.playfabapi.com';
  var SCID = '4fc10100-5f7a-4470-899b-280835760c07';
  var KEYS_URL = 'https://toolcoin.site/api/keys.php';
  var WORKER_URL = 'assets/marketplace/worker.js';
  var PAGE_SIZE = 24;
  var FILTER = "(contentType eq 'MarketplaceDurableCatalog_V1.2')";
  var CATALOG_CACHE_NAME = 'prizmothyn-catalog-v2';
  var CATALOG_CACHE_URL = location.origin + '/__prizmothyn_catalog__.json';
  var CATALOG_META_KEY = 'prizmothyn_catalog_meta_v2';
  var CATALOG_CACHE_VERSION = 2;
  var SYNC_INTERVAL = 10 * 60 * 1000;
  var AD_EVERY = 15;
  var AD_KEY = '8dbb602ebcae476bccc44b9d9dae9e97';
  var AD_SCRIPT_URL = 'https://bauval.org/22/' + AD_KEY;

  var CATEGORY_MAP = {
    Addon: 'Addons', Mashup: 'Addons', World: 'Mapas', SkinPack: 'Skins',
    TexturePack: 'Texturas', DLC: 'Versiones', Server: 'Scripts', Persona: 'Skins'
  };
  // #addons es alias del catálogo completo; la categoría Addons usa #complementos.
  var CATEGORY_LABEL_BY_HASH = {
    texturas: 'Texturas', complementos: 'Addons', mapas: 'Mapas', skins: 'Skins',
    scripts: 'Scripts', versiones: 'Versiones', semillas: 'Semillas'
  };
  var CATEGORY_HASH_BY_LABEL = {
    Texturas: 'texturas', Addons: 'complementos', Mapas: 'mapas', Skins: 'skins',
    Scripts: 'scripts', Versiones: 'versiones', Semillas: 'semillas'
  };

  var VIEW_KEY = 'prizmothyn_catalog_view_v1';
  var STATS_KEY = 'prizmothyn_catalog_stats_v1';

  var state = {
    q: '', cat: '', page: 0,
    all: [], visible: [], order: [],
    cats: [],
    loading: true, progress: '', error: '',
    token: '', owned: null,
    loadStarted: false, syncing: false, fromCache: false,
    cacheIndex: new Map(), lastSyncAt: 0, syncNote: '',
    restoredScroll: null
  };

  var worker = null, workerSeq = 0;
  var pending = new Map();

  // Estadísticas que consume el menú lateral: totales exactos y cambios de hoy.
  window.PrizmothynCatalog = { getStats: function () { return getStats(); } };

  function todayKey_() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
      '-' + String(d.getDate()).padStart(2, '0');
  }
  function readStats_() {
    var empty = { date: todayKey_(), newIds: [], updatedIds: [], removed: 0 };
    try {
      var s = JSON.parse(localStorage.getItem(STATS_KEY) || 'null');
      if (!s || s.date !== empty.date) return empty;
      return {
        date: s.date,
        newIds: Array.isArray(s.newIds) ? s.newIds : [],
        updatedIds: Array.isArray(s.updatedIds) ? s.updatedIds : [],
        removed: Number(s.removed) || 0
      };
    } catch (e) { return empty; }
  }
  function writeStats_(stats) {
    try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) { /* sin espacio */ }
  }
  function getStats() {
    var saved = readStats_();
    var app = 0, market = 0;
    state.all.forEach(function (it) {
      if (it.source === 'market') market++; else app++;
    });
    return {
      total: state.all.length,
      app: app,
      market: market,
      newToday: saved.newIds.length,
      updatedToday: saved.updatedIds.length,
      removed: saved.removed
    };
  }
  function publishStats() {
    try {
      if (typeof window.CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent('prizmothyn:catalogstats', { detail: getStats() }));
      }
    } catch (e) { /* evento solo informativo */ }
  }
  function recordSyncStats_(added, updated, removed) {
    var saved = readStats_();
    var news = new Set(saved.newIds);
    var ups = new Set(saved.updatedIds);
    var gone = new Set((removed || []).map(function (id) { return String(id); }));
    (added || []).forEach(function (it) { news.add(it.id); ups.delete(it.id); });
    (updated || []).forEach(function (it) { ups.add(it.id); });
    gone.forEach(function (id) { news.delete(id); ups.delete(id); });
    saved.newIds = Array.from(news);
    saved.updatedIds = Array.from(ups);
    saved.removed = saved.removed + gone.size;
    writeStats_(saved);
  }

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function safeUrl(v) {
    if (!v) return '';
    var u = String(v).trim();
    return /^https?:\/\//i.test(u) ? esc(u) : '';
  }
  function fmt(n) { var x = Number(n); return isFinite(x) ? x.toLocaleString('es-ES') : '0'; }

  // ── Caché del catálogo y señales de carga ─────────────────────────────
  function catalogHash(value) {
    var text = String(value || '');
    var h1 = 2166136261, h2 = 374761393;
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619);
      h2 = Math.imul(h2 + c, 668265263);
    }
    return (h1 >>> 0).toString(36) + '-' + (h2 >>> 0).toString(36);
  }

  // La descripción entra en la firma: si cambia en PlayFab o en la hoja,
  // la sincronización detecta el addon como actualizado.
  function itemFingerprint(it) {
    return [
      it.nombre, it.version, it.creador, it.categoria, it.likes, it.descargas,
      it.fecha, it.imagen, (it.imagenes || []).join('|'), it.descripcion || '',
      it.urlDescarga || '', it.tipo || '',
      (it.variantes || []).map(function (g) { return (g || []).join('|'); }).join('||')
    ].join('\u001f');
  }

  function itemHash(it) { return catalogHash(itemFingerprint(it)); }

  function buildIndex(items) {
    var map = new Map();
    items.forEach(function (it) { map.set(it.id, itemHash(it)); });
    return map;
  }

  function packItems(items) {
    return items.map(function (it) { return { fp: itemHash(it), it: it }; });
  }

  function updateBootText(label, count, extra) {
    var boot = $('#bootScreen');
    if (!boot) return;
    var span = boot.querySelector('span');
    if (!span) return;
    var line2 = count === null || count === undefined
      ? (extra || '')
      : fmt(count) + ' addons' + (extra ? ' · ' + extra : '');
    span.textContent = label + '\n' + line2;
  }

  function signal(type, count, extra) {
    var loadingLabels = { start: 1, progress: 1, cached: 1, ready: 1, error: 1 };
    updateBootText(
      loadingLabels[type] ? 'Cargando catálogos' : 'Actualizando catálogos',
      count,
      extra && extra.label ? extra.label : ''
    );
    try {
      if (typeof window.CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent('prizmothyn:catalog', {
          detail: { type: type, count: count || 0, extra: extra || {} }
        }));
      }
    } catch (e) { /* el evento es solo informativo */ }
  }

  function readMeta() {
    try { return JSON.parse(localStorage.getItem(CATALOG_META_KEY) || 'null'); }
    catch (e) { return null; }
  }

  async function readCatalogCache() {
    try {
      var meta = readMeta();
      if (!meta || meta.v !== CATALOG_CACHE_VERSION || !meta.count) return null;
      if (!('caches' in window)) return null;
      var cache = await caches.open(CATALOG_CACHE_NAME);
      var res = await cache.match(CATALOG_CACHE_URL);
      if (!res || !res.ok) return null;
      var payload = await res.json();
      if (!payload || payload.v !== CATALOG_CACHE_VERSION || !Array.isArray(payload.items)) return null;
      if (payload.items.length !== meta.count) return null;
      var items = payload.items.map(function (entry) { return entry.it; }).filter(Boolean);
      if (!items.length) return null;
      return { items: items, index: buildIndex(items), savedAt: payload.savedAt || meta.savedAt || 0 };
    } catch (e) {
      return null;
    }
  }

  async function writeCatalogCache(items) {
    var meta = {
      v: CATALOG_CACHE_VERSION,
      count: items.length,
      app: items.filter(function (i) { return i.source === 'app'; }).length,
      market: items.filter(function (i) { return i.source === 'market'; }).length,
      savedAt: Date.now()
    };
    var payload = { v: CATALOG_CACHE_VERSION, savedAt: meta.savedAt, items: packItems(items) };
    try {
      if ('caches' in window) {
        var cache = await caches.open(CATALOG_CACHE_NAME);
        await cache.put(CATALOG_CACHE_URL, new Response(JSON.stringify(payload), {
          headers: { 'Content-Type': 'application/json' }
        }));
      }
    } catch (e) { /* sin espacio o modo privado: seguimos con los metadatos */ }
    try { localStorage.setItem(CATALOG_META_KEY, JSON.stringify(meta)); }
    catch (e) { /* sin espacio */ }
    return meta;
  }

  async function cleanOldCatalogCache() {
    try {
      if ('caches' in window) {
        var keys = await caches.keys();
        await Promise.all(keys.filter(function (key) {
          return key.indexOf('prizmothyn-catalog-') === 0 && key !== CATALOG_CACHE_NAME;
        }).map(function (key) { return caches.delete(key); }));
      }
      localStorage.removeItem('prizmothyn_catalog_meta_v1');
    } catch (e) { /* nada que limpiar */ }
  }

  function dateLabel(v) {
    if (!v) return '';
    var d = new Date(v);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function localText(v) {
    if (!v || typeof v !== 'object') return '';
    var keys = Object.keys(v);
    return v.neutral || v.NEUTRAL || v['en-US'] || (keys.length ? String(v[keys[0]]) : '');
  }

  // Vista del catálogo dentro de esta pestaña: al volver de ID.html queremos
  // el mismo orden, filtros, página y scroll, no un catálogo recién aleatorizado.
  function readView() {
    try {
      var raw = sessionStorage.getItem(VIEW_KEY);
      if (!raw) return null;
      var v = JSON.parse(raw);
      return v && Array.isArray(v.order) ? v : null;
    } catch (e) { return null; }
  }
  function saveView() {
    try {
      sessionStorage.setItem(VIEW_KEY, JSON.stringify({
        order: state.order.slice(),
        q: state.q,
        cat: state.cat,
        page: state.page,
        scrollY: Math.round(window.scrollY || window.pageYOffset || 0)
      }));
    } catch (e) { /* sesión sin almacenamiento */ }
  }
  function restoreView() {
    var v = readView();
    if (!v) return;
    state.order = v.order.filter(function (id) { return typeof id === 'string'; });
    state.q = String(v.q || '');
    state.cat = String(v.cat || '');
    state.page = Math.max(0, Number(v.page) || 0);
    state.restoredScroll = Math.max(0, Number(v.scrollY) || 0);
    // Evitamos que el navegador restaure su propio scroll por encima del nuestro.
    if (state.restoredScroll && 'scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
  }

  function scrollToY(y) {
    var root = document.documentElement;
    var prev = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    try { window.scrollTo({ top: y, left: 0, behavior: 'instant' }); }
    catch (e) { window.scrollTo(0, y); }
    root.style.scrollBehavior = prev;
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // ── Worker: claves y descarga ──────────────────────────────────────────
  function getWorker() {
    if (worker) return worker;
    worker = new Worker(WORKER_URL, { type: 'module' });
    worker.onmessage = function (e) {
      var d = e.data || {}, p = pending.get(d.id);
      if (!p) return;
      if (d.type === 'PROGRESS') { p.onProgress && p.onProgress(d.payload); return; }
      pending.delete(d.id);
      if (d.type === 'ERROR') p.reject(new Error(d.error || 'Error del worker'));
      else p.resolve({ type: d.type, payload: d.payload || {} });
    };
    worker.onerror = function (e) {
      pending.forEach(function (p) { p.reject(new Error(e.message || 'Error del worker')); });
      pending.clear(); worker = null;
    };
    return worker;
  }
  function callWorker(type, payload, transfer, onProgress) {
    var w = getWorker(), id = ++workerSeq;
    return new Promise(function (resolve, reject) {
      pending.set(id, { resolve: resolve, reject: reject, onProgress: onProgress });
      w.postMessage({ id: id, type: type, payload: payload }, transfer || []);
    });
  }
  async function loadKeys() {
    if (state.owned) return state.owned;
    // Las claves son ~1,2 MB y el servidor puede tardar: se piden una sola vez
    // por página y se deja que el navegador/CDN aplique su caché HTTP.
    var r = await fetch(KEYS_URL, { credentials: 'omit' });
    if (!r.ok) throw new Error('No se pudieron cargar las claves (HTTP ' + r.status + ')');
    var key = r.headers.get('X-Decryption-Key') || r.headers.get('x-decryption-key') || '';
    var buf = await r.arrayBuffer();
    var res = await callWorker('LOAD_KEYS_ENCRYPTED', { encryptedBuffer: buf, key: key }, [buf]);
    var set = new Set();
    (res.payload.ownedUuids || []).forEach(function (id) { set.add(String(id).trim().toLowerCase()); });
    state.owned = set;
    return set;
  }

  // ── API Prizmothyn (Apps Script) ───────────────────────────────────────
  async function api(action, extra) {
    var payload = { action: action, token: '' };
    if (extra) Object.keys(extra).forEach(function (k) { payload[k] = extra[k]; });
    var r = await fetch(API_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload), redirect: 'follow', cache: 'no-store', credentials: 'omit'
    });
    var j = await r.json();
    if (!j || j.ok !== true) throw new Error((j && j.message) || 'Error de la API');
    return j.data;
  }

  async function fetchAppItems(onProgress) {
    var data = await api('getAddonCategoryLists');
    var out = (data.addons || []).map(function (a) {
      return {
        id: 'app:' + a.id,
        source: 'app',
        rawId: a.id,
        nombre: a.nombre || 'Sin nombre',
        version: a.version || '',
        creador: a.subidoPor || 'Prizmothyn',
        categoria: a.categoria || 'Addons',
        likes: Number(a.likes) || 0,
        descargas: Number(a.descargas) || 0,
        fecha: a.fecha || '',
        imagen: safeUrl(a.imagen),
        imagenes: (Array.isArray(a.imagenes) ? a.imagenes : []).map(safeUrl).filter(Boolean),
        descripcion: a.descripcion || '',
        urlDescarga: safeUrl(a.urlDescarga)
      };
    });
    if (onProgress) onProgress(out.length);
    return out;
  }

  // ── Store (PlayFab) ────────────────────────────────────────────────────
  async function pf(path, body, token) {
    var headers = { 'Content-Type': 'application/json', 'Accept-Language': 'en-US' };
    if (token) headers['X-EntityToken'] = token;
    var r = await fetch(PF + path, { method: 'POST', headers: headers, body: JSON.stringify(body), credentials: 'omit' });
    var j = await r.json();
    if (j.code && j.code !== 200) throw new Error(j.errorMessage || 'Error de PlayFab ' + j.code);
    return j.data || {};
  }
  function newDeviceId() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID().replace(/-/g, '')
      : 'pf_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }
  async function auth() {
    if (state.token) return state.token;
    var token = localStorage.getItem('pf_master_token') || '';
    var expiry = localStorage.getItem('pf_token_expiry') || '';
    if (token && Date.parse(expiry) > Date.now() + 300000) { state.token = token; return token; }
    var device = localStorage.getItem('pf_device_id') || newDeviceId();
    localStorage.setItem('pf_device_id', device);
    var login = await pf('/Client/LoginWithIOSDeviceID', { CreateAccount: true, TitleId: '20CA2', DeviceId: device, OS: 'IOS' });
    var ent = await pf('/Authentication/GetEntityToken',
      { Entity: { Id: login.PlayFabId, Type: 'master_player_account' } },
      login.EntityToken && login.EntityToken.EntityToken);
    state.token = ent.EntityToken;
    localStorage.setItem('pf_master_token', ent.EntityToken);
    localStorage.setItem('pf_token_expiry', ent.TokenExpiration || '');
    return state.token;
  }
  function typeOf(raw) {
    var tags = Array.isArray(raw.Tags) ? raw.Tags.map(String) : [];
    if (tags.some(function (t) { return t.indexOf('persona') !== -1; })) return 'Persona';
    if (tags.indexOf('skinpack') !== -1) return 'SkinPack';
    if (tags.indexOf('worldtemplate') !== -1) return 'World';
    if (tags.indexOf('resourcepack') !== -1) return 'TexturePack';
    if (tags.indexOf('mashup') !== -1) return 'Mashup';
    if (tags.indexOf('addon') !== -1) return 'Addon';
    return String(raw.ContentType || '').indexOf('3PServerContent') !== -1 ? 'Server' : 'DLC';
  }
  function available(item) {
    if (item.tipo === 'SkinPack') return true;
    // Las claves del worker usan el UUID de PlayFab (rawId), no el id interno con prefijo.
    var id = item.rawId || item.id;
    return !!state.owned && (state.owned.has(String(id).toLowerCase()) || state.owned.has(id));
  }
  function normalizeMarket(raw) {
    var dp = raw.DisplayProperties || {};
    var identity = Array.isArray(dp.packIdentity) ? dp.packIdentity[0] : null;
    // PlayFab suele devolver el Thumbnail al final del array. Lo ordenamos como
    // la Store original: portada, icono, panorama y luego capturas.
    var buckets = { thumb: [], icon: [], pano: [], shot: [], other: [] };
    (Array.isArray(raw.Images) ? raw.Images : []).forEach(function (img) {
      var u = safeUrl(img.Url);
      if (!u) return;
      var tag = String(img.Tag || '').toLowerCase();
      var type = String(img.Type || '').toLowerCase();
      var key = (tag === 'thumbnail' || type === 'thumbnail') ? 'thumb'
        : tag === 'packicon' ? 'icon'
        : tag === 'panorama' ? 'pano'
        : tag === 'screenshot' ? 'shot' : 'other';
      if (buckets[key].indexOf(u) === -1) buckets[key].push(u);
    });
    var imgs = buckets.thumb.concat(buckets.icon, buckets.pano, buckets.shot, buckets.other)
      .filter(function (u, i, a) { return a.indexOf(u) === i; });
    var variants = [];
    if (Array.isArray(raw.Contents)) {
      var groups = new Map();
      raw.Contents.forEach(function (c) {
        if (!c.Url) return;
        var k = (Array.isArray(c.Tags) ? c.Tags.slice().sort().join(',') : '') || 'Standard';
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(String(c.Url));
      });
      Array.from(groups.values()).forEach(function (u) { variants.push(u); });
    }
    var tipo = typeOf(raw);
    return {
      id: 'market:' + raw.Id, source: 'market', rawId: raw.Id,
      nombre: localText(raw.Title || dp.Title) || 'Sin título',
      version: identity && identity.version ? String(identity.version) : '',
      creador: dp.creatorName || 'Desconocido',
      categoria: CATEGORY_MAP[tipo] || 'Addons',
      likes: Number(raw.Rating && raw.Rating.Average) || 0,
      descargas: Number(raw.Rating && raw.Rating.TotalCount) || 0,
      fecha: raw.CreationDate || '',
      imagen: imgs[0] || '',
      imagenes: imgs,
      descripcion: localText(raw.Description),
      urlDescarga: '',
      variantes: variants,
      tipo: tipo
    };
  }
  async function fetchMarketItems(onProgress) {
    var out = [];
    var token = await auth();
    await loadKeys();
    var skip = 0, total = Infinity;
    while (skip < Math.min(total, 10000)) {
      state.progress = 'Cargando contenido… ' + fmt(out.length) + ' elementos';
      var data = await pf('/Catalog/Search', {
        count: true, filter: FILTER, scid: SCID, select: 'contents, images',
        top: 300, skip: skip, orderBy: 'startDate DESC'
      }, token);
      var items = Array.isArray(data.Items) ? data.Items : [];
      total = Number(data.Count) || items.length;
      items.forEach(function (raw) {
        var item = normalizeMarket(raw);
        if (item.tipo === 'Persona' || !available(item)) return;
        out.push(item);
      });
      if (onProgress) onProgress(out.length);
      skip += 300;
      if (items.length < 300) break;
    }
    return out;
  }

  // ── Carga y presentación ───────────────────────────────────────────────
  function catalogCategories(items) {
    return (items || []).map(function (i) { return i.categoria; })
      .filter(function (v, i, a) { return v && a.indexOf(v) === i; }).sort();
  }

  function setSyncNote(text) {
    state.syncNote = text || '';
    render();
  }

  function commit(items, fromCache, savedAt) {
    // Primera carga: orden aleatorio. Cargas posteriores (caché o sync):
    // mantenemos el orden anterior y añadimos los nuevos al final.
    var byId = new Map();
    items.forEach(function (it) { byId.set(it.id, it); });
    var ordered = [];
    if (state.order.length) {
      state.order.forEach(function (id) {
        if (byId.has(id)) { ordered.push(byId.get(id)); byId.delete(id); }
      });
      items.forEach(function (it) {
        if (byId.has(it.id)) { ordered.push(it); byId.delete(it.id); }
      });
    } else {
      ordered = shuffle(items.slice());
    }
    state.all = ordered;
    state.order = ordered.map(function (it) { return it.id; });
    state.cats = catalogCategories(ordered);
    state.cacheIndex = buildIndex(ordered);
    state.fromCache = !!fromCache;
    state.lastSyncAt = savedAt || Date.now();
    publishStats();
    state.loading = false;
    state.progress = '';
    render();
    if (state.restoredScroll !== null) {
      var y = state.restoredScroll;
      state.restoredScroll = null;
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { scrollToY(y); });
      });
    }
  }

  async function loadAll() {
    if (state.loadStarted) return;
    state.loadStarted = true;
    state.error = '';
    signal('start', 0);

    // Segunda visita: mostramos el catálogo guardado de inmediato y
    // comprobamos cambios en segundo plano.
    var cached = await readCatalogCache();
    if (cached) {
      commit(cached.items, true, cached.savedAt);
      signal('cached', state.all.length);
      syncCatalog();
      return;
    }

    state.loading = true;
    render();
    try {
      var appItems = await fetchAppItems(function (n) { signal('progress', n); });
      var marketItems = await fetchMarketItems(function (n) { signal('progress', appItems.length + n); });
      var items = appItems.concat(marketItems);
      commit(items, false, Date.now());
      await writeCatalogCache(items);
      setSyncNote('Catálogo guardado en caché');
      signal('ready', items.length);
    } catch (e) {
      state.error = (e && e.message) || 'No se pudo cargar el catálogo';
      state.loading = false;
      state.progress = '';
      render();
      signal('error', null, { label: 'No se pudo cargar' });
    } finally {
      state.loading = false;
      state.progress = '';
    }
  }

  // Sincronización incremental: solo sustituye lo que cambió y añade lo nuevo.
  async function syncCatalog() {
    if (state.syncing || state.loading || !state.loadStarted) return;
    state.syncing = true;
    setSyncNote('Comprobando actualizaciones del catálogo…');
    signal('sync-start', 0);
    try {
      var appItems = await fetchAppItems();
      var marketItems = await fetchMarketItems();
      var fresh = appItems.concat(marketItems);
      var freshIndex = buildIndex(fresh);
      var currentIndex = (state.cacheIndex && state.cacheIndex.size)
        ? state.cacheIndex : buildIndex(state.all);

      var added = [], updated = [], removed = [];
      fresh.forEach(function (it) {
        var oldHash = currentIndex.get(it.id);
        if (!oldHash) added.push(it);
        else if (oldHash !== itemHash(it)) updated.push(it);
      });
      state.all.forEach(function (it) {
        if (!freshIndex.has(it.id)) removed.push(it.id);
      });

      var total = added.length + updated.length;
      if (!total && !removed.length) {
        state.lastSyncAt = Date.now();
        setSyncNote('Catálogo al día');
        publishStats();
        signal('sync-done', 0, { label: 'sin cambios' });
        return;
      }

      var byId = new Map();
      state.all.forEach(function (it) { byId.set(it.id, it); });
      added.concat(updated).forEach(function (it) { byId.set(it.id, it); });
      removed.forEach(function (id) { byId.delete(id); });
      var merged = Array.from(byId.values());

      recordSyncStats_(added, updated, removed);
      commit(merged, false, Date.now());
      await writeCatalogCache(merged);

      var note = 'Actualizado: ' + fmt(added.length) + ' nuevos · ' +
        fmt(updated.length) + ' actualizados' +
        (removed.length ? ' · ' + fmt(removed.length) + ' eliminados' : '');
      setSyncNote(note);
      signal('sync-done', total, { label: 'nuevos o actualizados' });
    } catch (e) {
      setSyncNote('No se pudo actualizar: ' + ((e && e.message) || 'error de conexión'));
      signal('sync-error', 0, { label: 'sin cambios' });
    } finally {
      state.syncing = false;
    }
  }

  function toolbarHTML() {
    var catOpts = '<option value="">Todas las categorías</option>' + state.cats.map(function (c) {
      return '<option value="' + esc(c) + '"' + (c === state.cat ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    return '<section class="card addons-toolbar" id="uniToolbar">' +
      '<div class="addons-search"><input type="search" id="uSearch" maxlength="80" value="' + esc(state.q) +
        '" placeholder="Buscar en todo el catálogo..." aria-label="Buscar"></div>' +
      '<select class="addons-sort" id="uCategory" aria-label="Categoría">' + catOpts + '</select>' +
      '<button class="btn ghost small" id="uShuffle" type="button" title="Orden aleatorio">🎲 Mezclar</button>' +
      '</section>' +
      '<div class="catalog-sort-wrap" style="padding:0 2px 12px">' +
        '<label id="uSummary"></label><span class="muted" id="uInfo"></span></div>';
  }

  function ensureToolbar() {
    var grid = $('#addonsGrid');
    if (!grid) return false;
    if (!$('#uniToolbar')) {
      var box = document.createElement('div');
      box.id = 'uniToolbarMount';
      box.innerHTML = toolbarHTML();
      grid.parentNode.insertBefore(box, grid);
    }
    return true;
  }

  function applyFilters() {
    var q = state.q.trim().toLocaleLowerCase('es');
    state.visible = state.all.filter(function (it) {
      if (state.cat && it.categoria !== state.cat) return false;
      if (!q) return true;
      return [it.nombre, it.creador, it.version, it.categoria, it.descripcion]
        .some(function (v) { return String(v || '').toLocaleLowerCase('es').indexOf(q) !== -1; });
    });
    var max = Math.max(0, Math.ceil(state.visible.length / PAGE_SIZE) - 1);
    if (state.page > max) state.page = max;
  }

  function descriptionLangParam() {
    try { return localStorage.getItem('wl_description_lang') === 'en' ? 'en' : 'es'; }
    catch (e) { return 'es'; }
  }

  function cardHTML(it) {
    var detailUrl = 'ID.html?ID=' + encodeURIComponent(it.id) +
      '&lang=' + descriptionLangParam();
    return '<article class="addon-card">' +
      '<a class="addon-card-open" data-u-card="' + esc(it.id) + '" href="' + esc(detailUrl) + '">' +
        '<div class="addon-cover"><div class="addon-cover-fallback" aria-hidden="true">🧩</div>' +
          (it.imagen ? '<img src="' + it.imagen + '" alt="' + esc(it.nombre) + '" loading="lazy" ' +
            'onerror="this.onerror=null;this.style.display=\'none\'">' : '') + '</div>' +
        '<span class="addon-body">' +
          '<span class="addon-title">' + esc(it.nombre) + '</span>' +
          '<span class="addon-meta"><span class="addon-chip">' + esc(it.categoria || 'Contenido') + '</span>' +
            (it.version ? '<span class="addon-chip">v' + esc(it.version) + '</span>' : '') + '</span>' +
          '<span class="addon-stats"><span>❤️ ' + fmt(it.likes) + '</span>' +
            '<span>⬇️ ' + fmt(it.descargas) + '</span></span>' +
          '<span class="addon-meta"><span>por ' + esc(it.creador) + '</span>' +
            (it.fecha ? '<span>' + esc(dateLabel(it.fecha)) + '</span>' : '') + '</span>' +
        '</span>' +
      '</a></article>';
  }

  function createInlineAdSlot(position, listKey) {
    var slot = document.createElement('aside');
    slot.className = 'addon-inline-ad';
    slot.dataset.addonAdPosition = String(position);
    slot.dataset.addonAdList = listKey;
    slot.setAttribute('aria-label', 'Publicidad');
    slot.innerHTML = '<p class="addon-inline-ad-label">Publicidad</p>' +
      '<div class="addon-banner-frame"></div>';
    return slot;
  }

  function loadInlineAd(slot) {
    if (!slot || slot.dataset.addonAdLoaded === 'true') return;
    var frame = slot.querySelector('.addon-banner-frame');
    if (!frame) return;
    slot.dataset.addonAdLoaded = 'true';
    window.atOptions = {
      key: AD_KEY,
      format: 'iframe',
      height: 250,
      width: 300,
      params: {}
    };
    var script = document.createElement('script');
    script.async = false;
    script.setAttribute('data-cfasync', 'false');
    script.src = AD_SCRIPT_URL;
    script.onerror = function () { slot.classList.add('hidden'); };
    frame.appendChild(script);
  }

  function render() {
    var page = $('.addons-page');
    if (!page || !ensureToolbar()) return;

    $$('.catalog-filter-row, [data-addon-search-form], #addonsNotice, .addons-guest-bar', page)
      .forEach(function (el) { el.classList.add('hidden'); });

    // El toolbar se crea antes de cargar los datos, así que refrescar las categorías
    // cada vez que pintamos (sin perder la selección actual).
    var catSel = $('#uCategory');
    if (catSel) {
      var wanted = state.cat;
      catSel.innerHTML = '<option value="">Todas las categorías</option>' + state.cats.map(function (c) {
        return '<option value="' + esc(c) + '"' + (c === wanted ? ' selected' : '') + '>' + esc(c) + '</option>';
      }).join('');
      catSel.value = wanted;
    }

    var grid = $('#addonsGrid'), footer = $('#addonsFooter');
    var adListKey = state.q + '|' + state.cat + '|' + state.page;
    if (state.loading || state.error) {
      grid.innerHTML = state.error
        ? '<div class="addon-empty" style="grid-column:1/-1"><p>' + esc(state.error) + '</p></div>'
        : '<div class="addon-empty" style="grid-column:1/-1"><div class="spinner"></div><p>' + esc(state.progress) + '</p></div>';
      footer.innerHTML = '';
      var sum = $('#uSummary'), info = $('#uInfo');
      if (sum) sum.textContent = 'Cargando contenido…';
      if (info) info.textContent = state.progress + (state.syncNote ? ' · ' + state.syncNote : '');
      return;
    }

    applyFilters();
    var start = state.page * PAGE_SIZE;
    var slice = state.visible.slice(start, start + PAGE_SIZE);
    if (!slice.length) {
      grid.innerHTML = '<div class="addon-empty" style="grid-column:1/-1">No hay resultados.</div>';
    } else {
      // Reutilizamos los slots ya cargados para no volver a pedir el banner
      // cada vez que se repinta la cuadrícula.
      var existingSlots = {};
      $$('[data-addon-ad-position]', grid).forEach(function (slot) {
        if (slot.dataset.addonAdList === adListKey) {
          existingSlots[slot.dataset.addonAdPosition] = slot;
        }
      });
      grid.innerHTML = '';
      slice.forEach(function (it, i) {
        grid.insertAdjacentHTML('beforeend', cardHTML(it));
        var position = i + 1;
        if (position % AD_EVERY !== 0) return;
        var slot = existingSlots[String(position)] || createInlineAdSlot(position, adListKey);
        grid.appendChild(slot);
        loadInlineAd(slot);
      });
    }

    var pages = Math.max(1, Math.ceil(state.visible.length / PAGE_SIZE));
    function b(to, label, dis, active) {
      return '<button class="btn ' + (active ? 'primary' : 'ghost') + ' small" type="button" data-upage="' + to + '"' +
        (dis ? ' disabled' : '') + '>' + label + '</button>';
    }
    footer.innerHTML = pages <= 1 ? '' :
      '<div class="catalog-sort-control" style="flex-wrap:wrap;justify-content:center">' +
      b(0, '«', state.page === 0, false) + b(Math.max(0, state.page - 1), '‹', state.page === 0, false) +
      '<span class="muted">Página ' + (state.page + 1) + ' de ' + pages + '</span>' +
      b(Math.min(pages - 1, state.page + 1), '›', state.page >= pages - 1, false) +
      b(pages - 1, '»', state.page >= pages - 1, false) + '</div>';

    $('#uSummary').textContent = fmt(state.all.length) + ' contenidos en un solo catálogo';
    $('#uInfo').textContent = fmt(state.visible.length) + ' resultados · ' +
      (slice.length ? 'mostrando ' + (start + 1) + '–' + (start + slice.length) : 'sin resultados') +
      (state.syncNote ? ' · ' + state.syncNote : '');
  }

  // ── Ficha única ────────────────────────────────────────────────────────
  // ── Eventos ────────────────────────────────────────────────────────────
  function bind() {
    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-u-card]')) saveView();
      if (e.target.closest('#uShuffle')) {
        shuffle(state.all);
        state.order = state.all.map(function (it) { return it.id; });
        state.page = 0; saveView(); render(); return;
      }
      var pg = e.target.closest('[data-upage]');
      if (pg) {
        state.page = Number(pg.getAttribute('data-upage')) || 0;
        saveView(); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return;
      }
    });
    document.addEventListener('input', function (e) {
      if (e.target.id === 'uSearch') {
        state.q = e.target.value; state.page = 0; saveView(); render();
        var input = $('#uSearch');
        if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
      }
    });
    document.addEventListener('change', function (e) {
      if (e.target.id === 'uCategory') {
        // El hash y el estado de la app se sincronizan en un solo sitio.
        window.dispatchEvent(new CustomEvent('prizmothyn:categorychange', {
          detail: { category: e.target.value }
        }));
      }
    });
    function applyCategoryFromApp_(e) {
      var label = String((e.detail && e.detail.category) || '');
      var next = CATEGORY_HASH_BY_LABEL[label] || 'catalogo';
      var wanted = next === 'catalogo' ? '' : label;
      if (state.cat !== wanted) {
        state.cat = wanted;
        state.page = 0;
        saveView();
        render();
      }
      var sel = $('#uCategory');
      if (sel) sel.value = wanted;
    }
    window.addEventListener('prizmothyn:categorychange', applyCategoryFromApp_);
    var target = $('#view') || document.body;
    new MutationObserver(function () {
      if (ensureToolbar()) render();
    }).observe(target, { childList: true });

    // La app original vuelve a pintar su grid cuando termina de cargar;
    // si lo hace, restauramos la lista unificada.
    new MutationObserver(function (records) {
      var grid = $('#addonsGrid');
      if (!grid || state.loading || state.error) return;
      var touched = records.some(function (r) { return r.target === grid; });
      // Con 0 resultados el grid se queda sin tarjetas propias: no debemos volver
      // a pintarlo o entraríamos en un bucle que congela la página (p. ej. "reali").
      if (touched && !grid.querySelector('[data-u-card]') && state.visible.length) render();
    }).observe(document.body, { childList: true, subtree: true });

    // Cubre recarga manual, cierre de pestaña y navegación a ID.html.
    window.addEventListener('pagehide', saveView);
    window.addEventListener('beforeunload', saveView);
  }

  function init() {
    restoreView();
    var initialHash = String(window.location.hash || '').replace(/^#/, '');
    if (CATEGORY_LABEL_BY_HASH[initialHash]) state.cat = CATEGORY_LABEL_BY_HASH[initialHash];
    else if (initialHash === 'catalogo' || initialHash === 'addons' || !initialHash) state.cat = '';
    bind();
    var tries = 0;
    var timer = setInterval(function () {
      if ($('.addons-page') && $('#addonsGrid')) {
        clearInterval(timer);
        ensureToolbar(); render();
        cleanOldCatalogCache();
        loadAll();
        window.setInterval(syncCatalog, SYNC_INTERVAL);
      } else if (++tries > 80) clearInterval(timer);
    }, 150);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
