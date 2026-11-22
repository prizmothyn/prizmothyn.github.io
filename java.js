/*
 * Catálogo ordenado de Prizmothyn — sistema independiente.
 * Se carga solo desde catalogo.html mediante <script src="java.js"></script>.
 * No modifica ni Interfiere con index.html.
 */
(function () {
  'use strict';

  var API_URL = 'https://script.google.com/macros/s/AKfycbzG8QOsYT3RICly7rITgydaCDQtgmZSx0rvh2xnZUzc4_o0yTW21wtoHHzHWfwocSHG/exec';
  var PAGE_SIZE = 48;

  var SORT_OPTIONS = [
    { key: 'descargas', label: 'Descargas', type: 'num', dir: 'desc' },
    { key: 'nombre', label: 'Nombre', type: 'text', dir: 'asc' },
    { key: 'version', label: 'Versión', type: 'version', dir: 'desc' },
    { key: 'subidoPor', label: 'Creador', type: 'text', dir: 'asc' },
    { key: 'categoria', label: 'Categoría', type: 'text', dir: 'asc' },
    { key: 'likes', label: 'Me gusta', type: 'num', dir: 'desc' },
    { key: 'fecha', label: 'Fecha', type: 'date', dir: 'desc' }
  ];

  var state = {
    items: [],
    visible: [],
    categories: [],
    q: '',
    category: 'todos',
    sort: 'descargas',
    dir: 'desc',
    page: 0,
    details: {},
    loadError: ''
  };

  function $(sel, root) { return (root || document).querySelector(sel); }

  function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeUrl(value) {
    if (!value) return '';
    var url = String(value).trim();
    if (!/^https?:\/\//i.test(url)) return '';
    return esc(url);
  }

  function count(value) {
    var n = Number(value);
    if (!isFinite(n) || n < 0) return 0;
    return n.toLocaleString('es-ES');
  }

  function dateLabel(value) {
    if (!value) return '';
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function apiCall(action, extra) {
    var payload = { action: action, token: '' };
    if (extra) Object.keys(extra).forEach(function (k) { payload[k] = extra[k]; });
    return fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
      cache: 'no-store',
      credentials: 'omit'
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (json) {
      if (!json || json.ok !== true) throw new Error((json && json.message) || 'Respuesta inválida');
      return json.data;
    });
  }

  // ── Carga inicial: una sola petición trae los 11.199 items ─────────────
  function loadCatalog() {
    state.loadError = '';
    return apiCall('getAddonCategoryLists').then(function (data) {
      var items = (data && data.addons) || [];
      state.items = items.slice();
      var cats = (data && data.categories) || {};
      state.categories = Object.keys(cats).filter(function (key) {
        return Array.isArray(cats[key]) && cats[key].length;
      });
      if (state.categories.indexOf('todos') === -1) state.categories.unshift('todos');
      state.page = 0;
      render();
    }).catch(function (err) {
      state.loadError = (err && err.message) || 'No se pudo cargar el catálogo';
      renderError();
    });
  }

  // ── Orden y filtros ────────────────────────────────────────────────────
  function sortOption(key) {
    for (var i = 0; i < SORT_OPTIONS.length; i++) {
      if (SORT_OPTIONS[i].key === key) return SORT_OPTIONS[i];
    }
    return SORT_OPTIONS[0];
  }

  function valueOf(item, key) {
    var v = item[key];
    if (v === null || v === undefined || v === '') return null;
    return v;
  }

  function compareVersions(a, b) {
    var pa = String(a).split(/[.\-_]/);
    var pb = String(b).split(/[.\-_]/);
    var n = Math.max(pa.length, pb.length);
    for (var i = 0; i < n; i++) {
      var x = pa[i] === undefined ? '' : pa[i];
      var y = pb[i] === undefined ? '' : pb[i];
      var nx = parseInt(x, 10);
      var ny = parseInt(y, 10);
      if (!isNaN(nx) && !isNaN(ny)) {
        if (nx !== ny) return nx - ny;
      } else {
        var c = String(x).localeCompare(String(y), 'es', { numeric: true, sensitivity: 'base' });
        if (c !== 0) return c;
      }
    }
    return 0;
  }

  function compareItems(a, b) {
    var opt = sortOption(state.sort);
    var av = valueOf(a, state.sort);
    var bv = valueOf(b, state.sort);
    if (av === null && bv === null) {
      av = a.nombre; bv = b.nombre;
    } else if (av === null) return 1;
    else if (bv === null) return -1;

    var result = 0;
    if (opt.type === 'num') result = Number(av) - Number(bv);
    else if (opt.type === 'date') result = new Date(av).getTime() - new Date(bv).getTime();
    else if (opt.type === 'version') result = compareVersions(av, bv);
    else result = String(av).localeCompare(String(bv), 'es', { numeric: true, sensitivity: 'base' });

    if (!isFinite(result)) result = 0;
    if (result === 0) result = String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { numeric: true, sensitivity: 'base' });
    return state.dir === 'desc' ? -result : result;
  }

  function applyFilters() {
    var q = state.q.trim().toLocaleLowerCase('es');
    state.visible = state.items.filter(function (item) {
      if (state.category !== 'todos') {
        var cat = String(item.categoria || '').toLocaleLowerCase('es');
        if (cat !== state.category) return false;
      }
      if (!q) return true;
      return [item.nombre, item.subidoPor, item.categoria, item.version]
        .some(function (v) { return String(v || '').toLocaleLowerCase('es').indexOf(q) !== -1; });
    });
    state.visible.sort(compareItems);
    var maxPage = Math.max(0, Math.ceil(state.visible.length / PAGE_SIZE) - 1);
    if (state.page > maxPage) state.page = maxPage;
  }

  // ── Marcado (mismas clases que el catálogo original) ───────────────────
  function coverHTML(item) {
    var src = safeUrl(item.imagen);
    return '<div class="addon-cover">' +
      '<div class="addon-cover-fallback" aria-hidden="true">🧩</div>' +
      (src ? '<img src="' + src + '" alt="' + esc(item.nombre) + '" loading="lazy" ' +
        'onerror="this.onerror=null;this.style.display=\'none\'">' : '') +
      '</div>';
  }

  function cardHTML(item) {
    var version = item.version ? '<span class="addon-chip">v' + esc(item.version) + '</span>' : '';
    var author = item.subidoPor ? '<span>por ' + esc(item.subidoPor) + '</span>' : '';
    var date = dateLabel(item.fecha);
    return '<article class="addon-card">' +
      '<button class="addon-card-open" type="button" data-open="' + esc(item.id) + '">' +
        coverHTML(item) +
        '<span class="addon-body">' +
          '<span class="addon-title">' + esc(item.nombre) + '</span>' +
          '<span class="addon-meta"><span class="addon-chip">' + esc(item.categoria || 'Complemento') + '</span>' + version + '</span>' +
          '<span class="addon-stats">' +
            '<span>❤️ ' + count(item.likes) + '</span>' +
            '<span>⬇️ ' + count(item.descargas) + '</span>' +
          '</span>' +
          '<span class="addon-meta">' + author + (date ? '<span>' + esc(date) + '</span>' : '') + '</span>' +
        '</span>' +
      '</button>' +
    '</article>';
  }

  function toolbarHTML() {
    var sortOpts = SORT_OPTIONS.map(function (o) {
      return '<option value="' + o.key + '"' + (o.key === state.sort ? ' selected' : '') + '>' + o.label + '</option>';
    }).join('');
    var catOpts = state.categories.map(function (c) {
      var label = c === 'todos' ? 'Todas las categorías' : c.charAt(0).toUpperCase() + c.slice(1);
      return '<option value="' + esc(c) + '"' + (c === state.category ? ' selected' : '') + '>' + esc(label) + '</option>';
    }).join('');
    return '<section class="card addons-toolbar">' +
      '<div class="addons-search">' +
        '<input type="search" id="catalogSearch" maxlength="80" placeholder="Buscar por nombre, creador o versión..." ' +
          'value="' + esc(state.q) + '" aria-label="Buscar en el catálogo">' +
      '</div>' +
      '<select class="addons-sort" id="catalogCategory" aria-label="Filtrar por categoría">' + catOpts + '</select>' +
      '<select class="addons-sort" id="catalogSort" aria-label="Ordenar por">' + sortOpts + '</select>' +
      '<button class="btn ghost small" id="catalogDir" type="button" title="Cambiar sentido">' +
        (state.dir === 'asc' ? '↑ Ascendente' : '↓ Descendente') + '</button>' +
    '</section>' +
    '<div class="catalog-sort-wrap" style="padding:0 2px 12px">' +
      '<label id="catalogSummary"></label>' +
      '<div class="catalog-sort-control"><span class="muted" id="catalogPageInfo"></span></div>' +
    '</div>' +
    '<div class="addons-grid" id="catalogGrid"></div>' +
    '<div class="addon-footer" id="catalogFooter"></div>';
  }

  function paginationHTML() {
    var total = state.visible.length;
    var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (pages <= 1) return '';
    var p = state.page;
    function btn(target, label, disabled, active) {
      return '<button class="btn ' + (active ? 'primary' : 'ghost') + ' small" type="button" data-page="' + target + '"' +
        (disabled ? ' disabled' : '') + '>' + label + '</button>';
    }
    return '<div class="catalog-sort-control" style="flex-wrap:wrap;justify-content:center">' +
      btn(0, '«', p === 0, false) +
      btn(Math.max(0, p - 1), '‹', p === 0, false) +
      '<span class="muted">Página ' + (p + 1) + ' de ' + pages + '</span>' +
      btn(Math.min(pages - 1, p + 1), '›', p >= pages - 1, false) +
      btn(pages - 1, '»', p >= pages - 1, false) +
      '</div>';
  }

  function renderError() {
    var view = $('#view');
    if (!view) return;
    view.innerHTML = '<div class="card addons-hero"><div><h1>Catálogo ordenado</h1>' +
      '<p>No se pudo cargar el catálogo.</p></div></div>' +
      '<div class="addon-empty"><p>' + esc(state.loadError) + '</p>' +
      '<button class="btn primary" id="catalogRetry" type="button">Reintentar</button></div>';
    $('#catalogRetry').addEventListener('click', function () {
      view.innerHTML = '<div class="card addons-hero"><div><h1>Catálogo ordenado</h1>' +
        '<p>Cargando el catálogo completo…</p></div></div>' +
        '<div class="center-load"><div class="spinner"></div></div>';
      loadCatalog();
    });
  }

  function render() {
    var view = $('#view');
    if (!view) return;
    applyFilters();

    if (!$('#catalogGrid')) {
      view.innerHTML = '<div class="card addons-hero"><div><h1>Catálogo ordenado</h1>' +
        '<p>Todo el contenido de Prizmothyn, ordenado y con fichas completas.</p></div>' +
        '<span class="addons-count" id="catalogCount"></span></div>' + toolbarHTML();
    }

    var start = state.page * PAGE_SIZE;
    var slice = state.visible.slice(start, start + PAGE_SIZE);
    var grid = $('#catalogGrid');
    grid.innerHTML = slice.length
      ? slice.map(cardHTML).join('')
      : '<div class="addon-empty" style="grid-column:1/-1">No hay resultados para esta búsqueda.</div>';

    var countEl = $('#catalogCount');
    if (countEl) countEl.textContent = state.items.length.toLocaleString('es-ES') + ' publicaciones';

    var summary = $('#catalogSummary');
    if (summary) {
      summary.textContent = state.visible.length.toLocaleString('es-ES') + ' resultados' +
        (state.category !== 'todos' ? ' en ' + state.category : '');
    }
    var pageInfo = $('#catalogPageInfo');
    if (pageInfo) pageInfo.textContent = slice.length ? 'Mostrando ' + (start + 1) + '–' + (start + slice.length) : 'Sin resultados';
    var dirBtn = $('#catalogDir');
    if (dirBtn) dirBtn.textContent = state.dir === 'asc' ? '↑ Ascendente' : '↓ Descendente';
    $('#catalogFooter').innerHTML = paginationHTML();
  }

  // ── Ficha detallada (descripción + imágenes + enlace) ──────────────────
  function galleryHTML(urls, name) {
    if (!urls.length) {
      return '<div class="addon-gallery-empty">Sin imágenes disponibles</div>';
    }
    var thumbs = urls.map(function (url, i) {
      return '<button class="addon-thumb' + (i === 0 ? ' active' : '') + '" type="button" data-thumb="' + i + '" ' +
        'aria-label="Ver imagen ' + (i + 1) + '"><img src="' + url + '" alt="' + esc(name) + ' ' + (i + 1) + '"></button>';
    }).join('');
    return '<div class="addon-detail-gallery">' +
      '<div class="addon-gallery-main">' + coverHTML({ imagen: urls[0], nombre: name }) + '</div>' +
      (urls.length > 1 ? '<div class="addon-thumbs">' + thumbs + '</div>' : '') +
      '</div>';
  }

  function renderDetail(addon) {
    var urls = (addon.imagenes || []).map(safeUrl).filter(Boolean);
    if (!urls.length && addon.imagen) urls.push(safeUrl(addon.imagen));
    var desc = addon.descripcion
      ? '<div class="addon-description">' + esc(addon.descripcion) + '</div>'
      : '<p class="muted">Sin descripción disponible.</p>';
    var download = addon.urlDescarga
      ? '<div class="addon-actions"><a class="btn primary" href="' + safeUrl(addon.urlDescarga) +
        '" target="_blank" rel="noopener noreferrer">⬇️ Abrir descarga</a></div>'
      : '<p class="muted">Este elemento no tiene enlace de descarga.</p>';

    $('#detailTitle').textContent = addon.nombre || 'Detalle';
    $('#detailBody').innerHTML =
      '<div class="addon-detail-meta">' +
        '<span class="addon-chip">' + esc(addon.categoria || 'Complemento') + '</span>' +
        (addon.version ? '<span>Versión ' + esc(addon.version) + '</span>' : '') +
        (addon.subidoPor ? '<span>por ' + esc(addon.subidoPor) + '</span>' : '') +
        (addon.fecha ? '<span>' + esc(dateLabel(addon.fecha)) + '</span>' : '') +
        '<span>❤️ ' + count(addon.likes) + '</span>' +
        '<span>⬇️ ' + count(addon.descargas) + '</span>' +
      '</div>' +
      galleryHTML(urls, addon.nombre || '') +
      desc +
      download;
  }

  function openDetail(id) {
    var modal = $('#detailModal');
    var body = $('#detailBody');
    if (!modal || !body) return;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    $('#detailTitle').textContent = 'Cargando…';
    body.innerHTML = '<div class="addon-detail-loading"><div class="spinner"></div></div>';

    if (state.details[id]) {
      renderDetail(state.details[id]);
      return;
    }
    apiCall('getAddon', { id: id }).then(function (data) {
      var addon = (data && data.addon) || {};
      state.details[id] = addon;
      if (!modal.classList.contains('hidden')) renderDetail(addon);
    }).catch(function (err) {
      if (modal.classList.contains('hidden')) return;
      body.innerHTML = '<div class="addon-empty"><p>No se pudo cargar el detalle: ' +
        esc((err && err.message) || 'error desconocido') + '</p></div>';
    });
  }

  function closeDetail() {
    var modal = $('#detailModal');
    if (!modal) return;
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  // ── Eventos ────────────────────────────────────────────────────────────
  function bindEvents() {
    var view = $('#view');
    view.addEventListener('input', function (e) {
      if (e.target.id === 'catalogSearch') {
        state.q = e.target.value;
        state.page = 0;
        render();
        var input = $('#catalogSearch');
        if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
      }
    });
    view.addEventListener('change', function (e) {
      if (e.target.id === 'catalogCategory') {
        state.category = e.target.value;
        state.page = 0;
        render();
      } else if (e.target.id === 'catalogSort') {
        state.sort = e.target.value;
        state.dir = sortOption(state.sort).dir;
        state.page = 0;
        render();
      }
    });
    view.addEventListener('click', function (e) {
      var sortBtn = e.target.closest('#catalogDir');
      if (sortBtn) {
        state.dir = state.dir === 'asc' ? 'desc' : 'asc';
        sortBtn.textContent = state.dir === 'asc' ? '↑ Ascendente' : '↓ Descendente';
        render();
        return;
      }
      var pageBtn = e.target.closest('[data-page]');
      if (pageBtn) {
        state.page = Number(pageBtn.getAttribute('data-page')) || 0;
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      var openBtn = e.target.closest('[data-open]');
      if (openBtn) openDetail(openBtn.getAttribute('data-open'));
    });

    var body = $('#detailBody');
    body.addEventListener('click', function (e) {
      var thumb = e.target.closest('[data-thumb]');
      if (!thumb) return;
      var index = Number(thumb.getAttribute('data-thumb'));
      var main = $('.addon-gallery-main');
      if (!main) return;
      var url = safeUrl(thumb.querySelector('img').src);
      main.innerHTML = '<img src="' + url + '" alt="">';
      body.querySelectorAll('.addon-thumb').forEach(function (t) { t.classList.remove('active'); });
      thumb.classList.add('active');
    });

    var close = $('#detailClose');
    if (close) close.addEventListener('click', closeDetail);
    var closeX = $('#detailX');
    if (closeX) closeX.addEventListener('click', closeDetail);
    var modal = $('#detailModal');
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeDetail();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDetail();
    });
    var menu = $('#menuBtn');
    if (menu) menu.addEventListener('click', function () { window.location.href = 'index.html'; });
  }

  function init() {
    bindEvents();
    loadCatalog();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
