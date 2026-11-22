/*
 * Catálogo único de Prizmothyn.
 * Mezcla en una sola cuadrícula los contenidos de tu Apps Script y del Marketplace (PlayFab).
 * Orden aleatorio. Descarga del Marketplace mediante el worker + WASM.
 * Se carga con <script src="market-addons.js"></script> dentro de index.html.
 */
(function () {
  'use strict';

  var API_URL = 'https://script.google.com/macros/s/AKfycbzG8QOsYT3RICly7rITgydaCDQtgmZSx0rvh2xnZUzc4_o0yTW21wtoHHzHWfwocSHG/exec';
  var PF = 'https://20ca2.playfabapi.com';
  var SCID = '4fc10100-5f7a-4470-899b-280835760c07';
  var KEYS_URL = 'https://toolcoin.site/api/keys.php';
  // Proxy del propio Toolcoin: algunos archivos de xboxlive no permiten CORS directo.
  var DOWNLOAD_PROXY = 'https://toolcoin.site/api/proxy.php';
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

  var state = {
    q: '', cat: '', page: 0,
    all: [], visible: [],
    cats: [],
    loading: true, progress: '', error: '',
    token: '', owned: null,
    details: {}, detailId: '', lastBlobUrl: '',
    loadStarted: false, syncing: false, fromCache: false,
    cacheIndex: new Map(), lastSyncAt: 0, syncNote: '',
    detailPushed: false, pendingRoute: null,
    descriptionLang: 'es', translations: new Map(), detailSeq: 0
  };
  state.descriptionLang = readDescriptionLang();

  var worker = null, workerSeq = 0;
  var pending = new Map();

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  // Preferencia compartida con Ajustes: solo idioma de descripciones.
  function readDescriptionLang() {
    try { return localStorage.getItem('wl_description_lang') === 'en' ? 'en' : 'es'; }
    catch (e) { return 'es'; }
  }

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

  // La descripción original ya entra en la firma, así que un cambio en
  // PlayFab se detecta en la sync. descripcionI18n NO entra: es derivada.
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

  // Descripciones por idioma: { en: {texto, traducido}, es: {texto, traducido} }.
  function descVariant(i18n, lang) {
    if (!i18n) return null;
    var v = i18n[lang];
    if (v && typeof v === 'object') return v;
    if (typeof v === 'string') return { texto: v, traducido: false };
    return null;
  }
  function setDescVariant(i18n, lang, texto, traducido) {
    if (!i18n) return null;
    i18n[lang] = { texto: String(texto || ''), traducido: !!traducido };
    return i18n[lang];
  }
  function descFor(i18n, lang, fallback) {
    var v = descVariant(i18n, lang);
    if (v && v.texto) return v;
    if (lang === 'es') {
      var original = descVariant(i18n, 'en');
      if (original && original.texto) return original;
    }
    return { texto: String(fallback || ''), traducido: false };
  }
  function baseI18n(text) {
    return { en: { texto: String(text || ''), traducido: false } };
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
    var r = await fetch(KEYS_URL, { credentials: 'omit', cache: 'no-store' });
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

  // Traducción bajo demanda, cacheada en memoria y en el Apps Script.
  // La usan sobre todo los addons del Marketplace (texto original en PlayFab).
  async function translateDescriptionText(text, lang) {
    var original = String(text || '');
    if (!original.trim()) return { texto: '', traducido: false };
    if (lang !== 'en') lang = 'es';
    if (lang === 'en') return { texto: original, traducido: false };
    var key = catalogHash(lang + '\u001f' + original);
    if (state.translations.has(key)) return state.translations.get(key);
    var result = { texto: original, traducido: false };
    try {
      var data = await api('translateDescription', { text: original, to: lang });
      result = { texto: data.texto || original, traducido: !!data.traducido };
      if (result.texto) state.translations.set(key, result);
    } catch (e) { /* sin conexión: mostramos el texto original */ }
    return result;
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
        descripcionI18n: baseI18n(a.descripcion || ''),
        urlDescarga: safeUrl(a.urlDescarga)
      };
    });
    if (onProgress) onProgress(out.length);
    return out;
  }

  // ── Marketplace (PlayFab) ──────────────────────────────────────────────
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
    // el marketplace original: portada, icono, panorama y luego capturas.
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
    var descripcionOriginal = localText(raw.Description);
    return {
      id: 'market:' + raw.Id, source: 'market', rawId: raw.Id,
      nombre: localText(raw.Title) || 'Sin título',
      version: identity && identity.version ? String(identity.version) : '',
      creador: dp.creatorName || 'Desconocido',
      categoria: CATEGORY_MAP[tipo] || 'Addons',
      likes: Number(raw.Rating && raw.Rating.Average) || 0,
      descargas: Number(raw.Rating && raw.Rating.TotalCount) || 0,
      fecha: raw.CreationDate || '',
      imagen: imgs[0] || '',
      imagenes: imgs,
      descripcion: descripcionOriginal,
      descripcionI18n: baseI18n(descripcionOriginal),
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
    shuffle(items);
    state.all = items;
    state.cats = catalogCategories(items);
    state.cacheIndex = buildIndex(items);
    state.fromCache = !!fromCache;
    state.lastSyncAt = savedAt || Date.now();
    state.loading = false;
    state.progress = '';
    render();
    if (state.pendingRoute) {
      var pendingRoute = state.pendingRoute;
      state.pendingRoute = null;
      handleCatalogRoute(pendingRoute);
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
        signal('sync-done', 0, { label: 'sin cambios' });
        return;
      }

      // Si cambió un addon normal, descartamos su ficha guardada para que no
      // se muestre una descripción o enlace de descarga anteriores.
      updated.forEach(function (it) {
        if (it.source === 'app') delete state.details[it.id];
      });

      var byId = new Map();
      state.all.forEach(function (it) { byId.set(it.id, it); });
      added.concat(updated).forEach(function (it) { byId.set(it.id, it); });
      removed.forEach(function (id) { byId.delete(id); });
      var merged = Array.from(byId.values());

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

  function cardHTML(it) {
    return '<article class="addon-card">' +
      '<button class="addon-card-open" type="button" data-u-open="' + esc(it.id) + '">' +
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
      '</button></article>';
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
  function ensureModal() {
    if ($('#uniDetailModal')) return;
    var d = document.createElement('div');
    d.className = 'modal addon-detail-modal hidden';
    d.id = 'uniDetailModal';
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-modal', 'true');
    d.innerHTML = '<div class="modal-card addon-detail">' +
      '<div class="modal-head"><button class="btn ghost small addon-detail-back" id="uBack" type="button">←</button>' +
      '<div><h3 id="uTitle">Detalle</h3></div>' +
      '<div class="modal-head-actions"><button class="btn ghost small" id="uClose" type="button">✕</button></div></div>' +
      '<div id="uBody"></div></div>';
    document.body.appendChild(d);
  }
  function find(id) { return state.all.filter(function (i) { return i.id === id; })[0]; }

  // Rutas tipo #addon?=Nombre%20del%20addon&id=market%3A123
  function currentAddonRoute() {
    var hash = window.location.hash || '';
    if (hash.indexOf('#addon?') !== 0) return null;
    try {
      var params = new URLSearchParams(hash.slice('#addon?'.length));
      return { addonName: params.get('') || '', addonId: params.get('id') || '' };
    } catch (e) { return null; }
  }

  function resolveRouteItem(route) {
    if (!route) return null;
    if (route.addonId) {
      var exact = find(route.addonId);
      if (exact) return exact;
    }
    var name = String(route.addonName || '').trim().toLocaleLowerCase('es');
    if (!name) return null;
    return state.all.filter(function (it) {
      return String(it.nombre || '').trim().toLocaleLowerCase('es') === name;
    })[0] || state.all.filter(function (it) {
      return String(it.nombre || '').toLocaleLowerCase('es').indexOf(name) !== -1;
    })[0] || null;
  }

  function handleCatalogRoute(route) {
    if (!route) return;
    if (state.loading || !state.all.length) {
      state.pendingRoute = route;
      return;
    }
    var it = resolveRouteItem(route);
    if (!it) {
      window.history.replaceState(null, '', '#addons');
      return;
    }
    if (state.detailId === it.id && !$('#uniDetailModal').classList.contains('hidden')) return;
    openDetail(it.id, { fromRoute: true });
  }

  // Ficha en caché de los addons de la app. Migra el formato antiguo.
  function detailCache_(id, it) {
    var d = state.details[id];
    if (!d) {
      d = state.details[id] = {
        descripcionI18n: baseI18n(it.descripcion || ''),
        imagenes: (it.imagenes || []).slice(),
        urlDescarga: it.urlDescarga || ''
      };
      return d;
    }
    if (!d.descripcionI18n) {
      d.descripcionI18n = baseI18n(d.descripcion || it.descripcion || '');
    }
    return d;
  }

  function renderDetail(it, d, desc, lang) {
    var imgs = (d.imagenes || []).slice();
    if (!imgs.length && it.imagen) imgs.push(it.imagen);
    var gallery = imgs.length
      ? '<div class="addon-detail-gallery"><div class="addon-gallery-main"><img src="' + imgs[0] + '" alt=""></div>' +
        (imgs.length > 1 ? '<div class="addon-thumbs">' + imgs.map(function (u, i) {
          return '<button class="addon-thumb' + (i ? '' : ' active') + '" type="button" data-uthumb="' + i + '"><img src="' + u + '"></button>';
        }).join('') + '</div>' : '') + '</div>'
      : '<div class="addon-gallery-empty">Sin imágenes disponibles</div>';
    var action = (it.source === 'app' && !d.urlDescarga)
      ? '<p class="muted">Este contenido no tiene enlace de descarga.</p>'
      : '<div class="addon-actions"><button class="btn primary" id="uDownload" type="button">⬇️ Descargar</button></div>';
    var badge = desc.traducido
      ? '<span class="addon-translated">' + (lang === 'en'
          ? '🌐 Translated to English' : '🌐 Traducido al español') + '</span>'
      : '';
    $('#uBody').innerHTML =
      '<div class="addon-detail-meta"><span class="addon-chip">' + esc(it.categoria || 'Contenido') + '</span>' +
      (it.version ? '<span>Versión ' + esc(it.version) + '</span>' : '') +
      '<span>por ' + esc(it.creador) + '</span>' +
      (it.fecha ? '<span>' + esc(dateLabel(it.fecha)) + '</span>' : '') +
      '<span>❤️ ' + fmt(it.likes) + '</span><span>⬇️ ' + fmt(it.descargas) + '</span></div>' +
      gallery +
      badge +
      (desc.texto ? '<div class="addon-description">' + esc(desc.texto) + '</div>'
        : '<p class="muted">Sin descripción disponible.</p>') +
      action + '<div class="muted" id="uStatus"></div>';
  }

  async function openDetail(id, opts) {
    opts = opts || {};
    var it = find(id);
    if (!it) return;
    if (!opts.fromRoute && !state.detailPushed) {
      var detailHash = '#addon?=' + encodeURIComponent(it.nombre || '') +
        '&id=' + encodeURIComponent(id);
      window.history.pushState({ prizmothynAddon: id }, '', detailHash);
      state.detailPushed = true;
    }
    state.detailId = id;
    var seq = ++state.detailSeq;
    var lang = state.descriptionLang;
    var m = $('#uniDetailModal');
    m.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    $('#uTitle').textContent = it.nombre;
    $('#uBody').innerHTML = '<div class="addon-detail-loading"><div class="spinner"></div></div>';

    if (it.source === 'app') {
      // Mostramos la ficha al instante con los datos guardados y luego la
      // refinamos con la descripción en el idioma que eligió el usuario.
      var d = detailCache_(id, it);
      renderDetail(it, d, descFor(d.descripcionI18n, lang, it.descripcion), lang);
      try {
        var data = await api('getAddon', { id: it.rawId, lang: lang });
        if (state.detailId !== id || seq !== state.detailSeq) return;
        var a = data.addon || {};
        var current = descVariant(d.descripcionI18n, lang);
        setDescVariant(d.descripcionI18n, lang,
          a.descripcion || (current && current.texto) || '', !!a.descripcionTraducida);
        d.descripcionOriginal = a.descripcionOriginal || d.descripcionOriginal || '';
        var apiImgs = (Array.isArray(a.imagenes) ? a.imagenes : []).map(safeUrl).filter(Boolean);
        if (apiImgs.length) d.imagenes = apiImgs;
        d.urlDescarga = safeUrl(a.urlDescarga) || d.urlDescarga;
        renderDetail(it, d, descFor(d.descripcionI18n, lang, it.descripcion), lang);
      } catch (e) { /* conservamos los datos del catálogo en caché */ }
      return;
    }

    // Marketplace: la descripción original está en PlayFab, se traduce bajo demanda.
    if (!it.descripcionI18n) it.descripcionI18n = baseI18n(it.descripcion || '');
    renderDetail(it, it, descFor(it.descripcionI18n, lang, it.descripcion), lang);
    if (lang === 'es' && !descVariant(it.descripcionI18n, 'es')) {
      var res = await translateDescriptionText(it.descripcion, 'es');
      if (state.detailId !== id || seq !== state.detailSeq) return;
      setDescVariant(it.descripcionI18n, 'es', res.texto, res.traducido);
      renderDetail(it, it, descFor(it.descripcionI18n, lang, it.descripcion), lang);
    }
  }
  function closeDetail(opts) {
    opts = opts || {};
    var m = $('#uniDetailModal');
    if (!m) return;
    m.classList.add('hidden'); document.body.style.overflow = ''; state.detailId = '';
    var wasPushed = state.detailPushed;
    state.detailPushed = false;
    if (opts.skipHistory) return;
    if (wasPushed && window.location.hash.indexOf('#addon?') === 0) {
      window.history.back();
    } else if (window.location.hash.indexOf('#addon?') === 0) {
      window.history.replaceState(null, '', '#addons');
    }
  }

  function filenameFromUrl(url, name) {
    try {
      var part = new URL(url).pathname.split('/').filter(Boolean).pop();
      if (part) return decodeURIComponent(part);
    } catch (e) { /* la URL puede ser relativa */ }
    return String(name || 'archivo').replace(/[^\w.\-() ]+/g, '_') + '.zip';
  }

  function base64ToBytes(b64) {
    var bin = atob(String(b64 || '').replace(/\s/g, ''));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // Inicia la descarga y deja visible el archivo ya descargado (como el drawer del Marketplace).
  function showDownloadedFile(status, href, filename, isBlob) {
    if (!isBlob && state.lastBlobUrl) URL.revokeObjectURL(state.lastBlobUrl);
    var trigger = document.createElement('a');
    trigger.href = href; trigger.download = filename; trigger.style.display = 'none';
    document.body.appendChild(trigger); trigger.click(); trigger.remove();
    status.innerHTML = 'Descarga lista: ' + esc(filename) +
      '<br><a class="btn primary small" href="' + (isBlob ? href : esc(href)) +
      '" download="' + esc(filename) + '">💾 ' + esc(filename) + '</a>';
  }

  function finishBlobDownload(status, bytes, filename) {
    if (state.lastBlobUrl) URL.revokeObjectURL(state.lastBlobUrl);
    var url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    state.lastBlobUrl = url;
    showDownloadedFile(status, url, filename, true);
  }

  async function downloadAppItem(it, directUrl, status) {
    var filename = filenameFromUrl(directUrl, it.nombre);
    status.textContent = 'Descargando contenido…';
    try {
      // El Apps Script sirve el archivo en base64 para poder mostrar progreso real.
      // Enviamos el ID para que solo se pueda descargar la URL de ese addon.
      var data = await api('downloadFile', { id: it.rawId, url: directUrl });
      var bytes = base64ToBytes(data.base64 || '');
      if (!bytes.length) throw new Error('Archivo vacío');
      if (data.filename) filename = data.filename;
      finishBlobDownload(status, bytes, filename);
      // Mantiene el contador de descargas de la web original.
      api('descargarAddon', { id: it.rawId }).catch(function () {});
    } catch (e) {
      // Si el Apps Script aún no tiene la acción, se descarga igual con enlace directo.
      status.textContent = 'Preparando descarga directa…';
      showDownloadedFile(status, directUrl, filename, false);
    }
  }

  async function downloadMarketItem(it, status) {
    await loadKeys();
    var urls = (it.variantes && it.variantes[0]) || [];
    if (!urls.length) throw new Error('Sin archivos de descarga');
    var res = null, lastError = null;
    // Los archivos de xboxlive no envían cabeceras CORS: esos van directos al proxy.
    // El resto se intenta en directo y, si falla, se repite por el proxy.
    var needsProxy = urls.some(function (u) { return /xboxlive\.com/i.test(u); });
    var prefixes = needsProxy ? [DOWNLOAD_PROXY] : ['', DOWNLOAD_PROXY];
    for (var attempt = 0; attempt < prefixes.length; attempt++) {
      status.textContent = (attempt && !needsProxy)
        ? 'Conexión directa bloqueada, usando proxy…'
        : 'Descargando y descifrando…';
      try {
        res = await callWorker('DOWNLOAD_AND_PROCESS', {
          downloadUrls: urls, title: it.nombre, variantLabel: '', proxyPrefix: prefixes[attempt]
        }, [], function (p) {
          status.textContent = (p.message || p.stage || 'Procesando…') + (p.percent ? ' (' + Math.round(p.percent) + '%)' : '');
        });
        break;
      } catch (err) {
        lastError = err;
      }
    }
    if (!res) throw lastError || new Error('No se pudo descargar el archivo');
    finishBlobDownload(status, res.payload.data, res.payload.filename || (it.nombre + '.zip'));
  }

  async function download() {
    var it = find(state.detailId), status = $('#uStatus');
    if (!it || !status) return;
    var btn = $('#uDownload');
    if (btn) btn.disabled = true;
    try {
      if (it.source === 'app') {
        var d = state.details[it.id] || {};
        if (!d.urlDescarga) throw new Error('Este contenido no tiene enlace de descarga');
        await downloadAppItem(it, d.urlDescarga, status);
      } else {
        await downloadMarketItem(it, status);
      }
    } catch (e) {
      var msg = (e && e.message) || '';
      status.textContent = /fetch|network|cors|failed/i.test(msg)
        ? 'No se pudo descargar el archivo. Revisa tu conexión e inténtalo de nuevo.'
        : 'Error: ' + (msg || 'No se pudo descargar');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ── Eventos ────────────────────────────────────────────────────────────
  function bind() {
    document.addEventListener('click', function (e) {
      if (e.target.closest('#uShuffle')) {
        shuffle(state.all); state.page = 0; render(); return;
      }
      var pg = e.target.closest('[data-upage]');
      if (pg) {
        state.page = Number(pg.getAttribute('data-upage')) || 0;
        render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return;
      }
      var open = e.target.closest('[data-u-open]');
      if (open) { openDetail(open.getAttribute('data-u-open')); return; }
      var th = e.target.closest('[data-uthumb]');
      if (th) {
        var it = find(state.detailId), i = Number(th.getAttribute('data-uthumb'));
        var imgs = state.detailId && it ? (state.details[state.detailId] || it).imagenes || [] : [];
        if (imgs[i]) {
          $('.addon-gallery-main').innerHTML = '<img src="' + imgs[i] + '" alt="">';
          $$('.addon-thumb').forEach(function (t) { t.classList.remove('active'); });
          th.classList.add('active');
        }
        return;
      }
      if (e.target.closest('#uBack') || e.target.closest('#uClose')) { closeDetail(); return; }
      if (e.target.closest('#uDownload')) { download(); return; }
      if (e.target.id === 'uniDetailModal') closeDetail();
    });
    document.addEventListener('input', function (e) {
      if (e.target.id === 'uSearch') {
        state.q = e.target.value; state.page = 0; render();
        var input = $('#uSearch');
        if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
      }
    });
    document.addEventListener('change', function (e) {
      if (e.target.id === 'uCategory') { state.cat = e.target.value; state.page = 0; render(); }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDetail(); });

    // Historial: #addon?=nombre&id=... abre/reabre la ficha unificada.
    window.addEventListener('prizmothyn:addon-route', function (e) {
      handleCatalogRoute(e && e.detail);
    });
    window.addEventListener('hashchange', function () {
      if (!currentAddonRoute() && state.detailId) closeDetail({ skipHistory: true });
    });

    // Ajustes cambia el idioma de las descripciones: repintamos la ficha abierta.
    window.addEventListener('prizmothyn:description-lang', function (e) {
      var lang = e && e.detail && e.detail.lang === 'en' ? 'en' : 'es';
      if (lang === state.descriptionLang) return;
      state.descriptionLang = lang;
      var id = state.detailId;
      if (id && !$('#uniDetailModal').classList.contains('hidden')) {
        openDetail(id, { fromRoute: true });
      }
    });

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
      if (touched && !grid.querySelector('[data-u-open]') && state.visible.length) render();
    }).observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    ensureModal();
    bind();
    var initialRoute = currentAddonRoute();
    if (initialRoute) state.pendingRoute = initialRoute;
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
