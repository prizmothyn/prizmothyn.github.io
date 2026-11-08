
  (function () {
    'use strict';

    var state = {
      hasToken: false,
      optionsLoaded: false,
      domains: [],
      placements: [],
      data: null,
      history: null,
      historyStatus: null,
      activeTab: 'daily',
      loading: false,
      pollTimer: null,
      backfillPending: false,
      sort: {
        daily: { key: 'date', dir: 'asc' },
        domains: { key: 'revenue', dir: 'desc' },
        placements: { key: 'revenue', dir: 'desc' },
        formats: { key: 'revenue', dir: 'desc' },
        countries: { key: 'revenue', dir: 'desc' },
        history: { key: 'date', dir: 'asc' }
      }
    };

    var TABLES = {
      daily: {
        columns: [
          { key: 'date', label: 'Fecha', type: 'text' },
          { key: 'impressions', label: 'Impresiones', type: 'int' },
          { key: 'clicks', label: 'Clicks', type: 'int' },
          { key: 'ctr', label: 'CTR', type: 'percent' },
          { key: 'cpm', label: 'CPM', type: 'money4' },
          { key: 'revenue', label: 'Ganancias', type: 'money' }
        ],
        rows: function (data) { return data.daily; },
        total: true
      },
      domains: {
        columns: [
          { key: 'name', label: 'Sitio web', type: 'text' },
          { key: 'impressions', label: 'Impresiones', type: 'int' },
          { key: 'clicks', label: 'Clicks', type: 'int' },
          { key: 'ctr', label: 'CTR', type: 'percent' },
          { key: 'cpm', label: 'CPM', type: 'money4' },
          { key: 'revenue', label: 'Ganancias', type: 'money' }
        ],
        rows: function (data) { return data.domains; },
        total: true
      },
      placements: {
        columns: [
          { key: 'name', label: 'Placement', type: 'text' },
          { key: 'domainName', label: 'Sitio', type: 'text' },
          { key: 'format', label: 'Formato', type: 'badge' },
          { key: 'impressions', label: 'Impresiones', type: 'int' },
          { key: 'clicks', label: 'Clicks', type: 'int' },
          { key: 'ctr', label: 'CTR', type: 'percent' },
          { key: 'cpm', label: 'CPM', type: 'money4' },
          { key: 'revenue', label: 'Ganancias', type: 'money' }
        ],
        rows: function (data) { return data.placements; },
        total: true
      },
      formats: {
        columns: [
          { key: 'format', label: 'Formato', type: 'badge' },
          { key: 'placements', label: 'Placements', type: 'int' },
          { key: 'impressions', label: 'Impresiones', type: 'int' },
          { key: 'clicks', label: 'Clicks', type: 'int' },
          { key: 'ctr', label: 'CTR', type: 'percent' },
          { key: 'cpm', label: 'CPM', type: 'money4' },
          { key: 'revenue', label: 'Ganancias', type: 'money' }
        ],
        rows: function (data) { return data.formats; },
        total: true
      },
      countries: {
        columns: [
          { key: 'country', label: 'País', type: 'text' },
          { key: 'impressions', label: 'Impresiones', type: 'int' },
          { key: 'clicks', label: 'Clicks', type: 'int' },
          { key: 'ctr', label: 'CTR', type: 'percent' },
          { key: 'cpm', label: 'CPM', type: 'money4' },
          { key: 'revenue', label: 'Ganancias', type: 'money' }
        ],
        rows: function (data) { return data.countries; },
        total: true
      },
      history: {
        columns: [
          { key: 'date', label: 'Fecha', type: 'text' },
          { key: 'impressions', label: 'Impresiones', type: 'int' },
          { key: 'clicks', label: 'Clicks', type: 'int' },
          { key: 'ctr', label: 'CTR', type: 'percent' },
          { key: 'cpm', label: 'CPM', type: 'money4' },
          { key: 'revenue', label: 'Ganancias', type: 'money' }
        ],
        rows: function () { return (state.history && state.history.daily) || []; },
        total: true
      }
    };

    function $(id) { return document.getElementById(id); }

    var CONFIG = {
      WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbxPjQ06f6JkIggVWiA0f9Q7I2H_agdvAcPOm0HE3hQY77KIv06GZBugAmZO_YkjWEcA/exec',
      ACCESS_KEY: ''
    };
    var POLL_INTERVAL_MS = 3000;
    (function () {
      try {
        var params = new URLSearchParams(window.location.search);
        var key = params.get('key');
        if (key) { CONFIG.ACCESS_KEY = key; }
      } catch (error) {}
    })();

    function callServer(method) {
      var args = Array.prototype.slice.call(arguments, 1);
      return jsonpRequest(method, args);
    }

    function jsonpRequest(method, args) {
      return new Promise(function (resolve, reject) {
        var callbackName = '__adsterra_cb_' + Math.random().toString(36).slice(2) + '_' + Date.now();
        var script = document.createElement('script');
        var finished = false;
        var timeout = setTimeout(function () {
          finish();
          reject(new Error('Tiempo de espera agotado al contactar el Web App.'));
        }, 60000);
        function finish() {
          if (finished) { return; }
          finished = true;
          clearTimeout(timeout);
          try { delete window[callbackName]; } catch (error) { window[callbackName] = undefined; }
          if (script.parentNode) { script.parentNode.removeChild(script); }
        }
        window[callbackName] = function (data) {
          finish();
          resolve(data);
        };
        script.onerror = function () {
          finish();
          reject(new Error('No se pudo contactar el Web App. Revisa la URL y el acceso "Cualquiera".'));
        };
        var params = new URLSearchParams();
        params.set('action', method);
        params.set('callback', callbackName);
        params.set('args', JSON.stringify(args));
        if (CONFIG.ACCESS_KEY) { params.set('key', CONFIG.ACCESS_KEY); }
        params.set('_', String(Date.now()));
        script.src = CONFIG.WEB_APP_URL + '?' + params.toString();
        document.body.appendChild(script);
      });
    }

    function postToken(token) {
      return new Promise(function (resolve) {
        var iframeName = '__adsterra_post_' + Math.random().toString(36).slice(2) + '_' + Date.now();
        var iframe = document.createElement('iframe');
        iframe.name = iframeName;
        iframe.style.display = 'none';
        var form = document.createElement('form');
        form.method = 'POST';
        form.target = iframeName;
        form.style.display = 'none';
        var query = 'action=saveApiToken';
        if (CONFIG.ACCESS_KEY) { query += '&key=' + encodeURIComponent(CONFIG.ACCESS_KEY); }
        query += '&_=' + Date.now();
        form.action = CONFIG.WEB_APP_URL + '?' + query;
        var input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'token';
        input.value = token;
        form.appendChild(input);
        document.body.appendChild(iframe);
        document.body.appendChild(form);
        var done = false;
        function cleanup() {
          if (done) { return; }
          done = true;
          setTimeout(function () {
            if (form.parentNode) { form.parentNode.removeChild(form); }
            if (iframe.parentNode) { iframe.parentNode.removeChild(iframe); }
          }, 1000);
          resolve({ ok: true });
        }
        iframe.onload = cleanup;
        form.submit();
        setTimeout(cleanup, 15000);
      });
    }

    function pad(value) { return ('0' + value).slice(-2); }

    function toIso(date) {
      return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    }

    function parseIso(value) {
      var parts = String(value || '').split('-');
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }

    function addDays(date, days) {
      var copy = new Date(date.getTime());
      copy.setDate(copy.getDate() + days);
      return copy;
    }

    function formatInt(value) {
      return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(Number(value) || 0);
    }

    function formatDecimal(value, digits) {
      return new Intl.NumberFormat('es-ES', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
      }).format(Number(value) || 0);
    }

    function formatMoney(value) { return '$' + formatDecimal(value, 4); }

    function formatPercent(value) { return formatDecimal(value, 2) + '%'; }

    function formatValue(type, value) {
      if (type === 'int') { return formatInt(value); }
      if (type === 'percent') { return formatPercent(value); }
      if (type === 'money') { return formatMoney(value); }
      if (type === 'money4') { return '$' + formatDecimal(value, 4); }
      return String(value === null || value === undefined ? '' : value);
    }

    function rawValue(type, value) {
      if (type === 'int' || type === 'percent' || type === 'money' || type === 'money4') {
        return Number(value) || 0;
      }
      return value === null || value === undefined ? '' : value;
    }

    function slug(value) {
      return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'otros';
    }

    function presetRange(preset) {
      var today = new Date();
      var finish = toIso(today);
      if (preset === 'today') {
        return { startDate: finish, finishDate: finish };
      }
      if (preset === 'yesterday') {
        var yesterday = toIso(addDays(today, -1));
        return { startDate: yesterday, finishDate: yesterday };
      }
      if (preset === '7d') {
        return { startDate: toIso(addDays(today, -6)), finishDate: finish };
      }
      if (preset === '30d') {
        return { startDate: toIso(addDays(today, -29)), finishDate: finish };
      }
      if (preset === 'thisMonth') {
        var firstThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        return { startDate: toIso(firstThisMonth), finishDate: finish };
      }
      if (preset === 'thisYear') {
        var firstThisYear = new Date(today.getFullYear(), 0, 1);
        return { startDate: toIso(firstThisYear), finishDate: finish };
      }
      if (preset === 'lastMonth') {
        var firstLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        var lastLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
        return { startDate: toIso(firstLastMonth), finishDate: toIso(lastLastMonth) };
      }
      return null;
    }

    function applyPreset(preset, shouldRefresh) {
      var range = presetRange(preset);
      if (range) {
        $('startDate').value = range.startDate;
        $('finishDate').value = range.finishDate;
      }
      var isCustom = preset === 'custom';
      $('startDate').disabled = !isCustom;
      $('finishDate').disabled = !isCustom;
      if (shouldRefresh && state.hasToken && state.optionsLoaded) {
        refresh();
      }
    }

    function collectFilters() {
      return {
        startDate: $('startDate').value,
        finishDate: $('finishDate').value,
        domain: $('domainSelect').value || null,
        placement: $('placementSelect').value || null,
        includeCountries: $('includeCountries').checked
      };
    }

    function setStatus(message, type) {
      var bar = $('statusBar');
      if (!message) {
        bar.className = 'status hidden';
        bar.textContent = '';
        return;
      }
      bar.className = 'status ' + (type || 'info');
      bar.textContent = message;
    }

    var toastTimer = null;
    function showToast(message, type) {
      var toast = $('toast');
      toast.textContent = message;
      toast.className = 'toast ' + (type || 'info');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () {
        toast.className = 'toast hidden';
      }, 4500);
    }

    function setLoading(value, silent) {
      state.loading = value;
      if (silent) { return; }
      $('refreshBtn').disabled = value;
      $('applyBtn').disabled = value;
      $('saveYesterdayBtn').disabled = value;
      $('backfillBtn').disabled = value;
      $('installTriggerBtn').disabled = value;
      $('removeTriggerBtn').disabled = value;
      document.body.classList.toggle('is-loading', value);
    }

    function setTokenMessage(message, type) {
      var node = $('tokenMessage');
      if (!message) {
        node.className = 'message hidden';
        node.textContent = '';
        return;
      }
      node.className = 'message ' + (type || 'info');
      node.textContent = message;
    }

    function showTokenPanel(showCancel) {
      $('tokenPanel').classList.remove('hidden');
      $('cancelTokenBtn').classList.toggle('hidden', !showCancel);
      $('deleteTokenBtn').classList.toggle('hidden', !state.hasToken);
      $('tokenInput').value = '';
      $('tokenInput').focus();
    }

    function hideTokenPanel() {
      $('tokenPanel').classList.add('hidden');
      setTokenMessage('', '');
    }

    function populateDomains() {
      var select = $('domainSelect');
      select.innerHTML = '<option value="">Todos los sitios</option>';
      state.domains.forEach(function (domain) {
        var option = document.createElement('option');
        option.value = String(domain.id);
        option.textContent = domain.title || ('Dominio #' + domain.id);
        select.appendChild(option);
      });
    }

    function populatePlacements(domainId) {
      var select = $('placementSelect');
      select.innerHTML = '<option value="">Todos los placements</option>';
      state.placements
        .filter(function (placement) {
          return !domainId || String(placement.domainId) === String(domainId);
        })
        .forEach(function (placement) {
          var option = document.createElement('option');
          option.value = String(placement.id);
          option.textContent = placement.title || placement.alias || ('Placement #' + placement.id);
          select.appendChild(option);
        });
    }

    async function loadOptions() {
      var result = await callServer('getFilterOptions');
      if (!result || !result.ok) {
        if (result && (result.code === 'TOKEN_MISSING' || result.code === 'AUTH')) {
          state.hasToken = false;
          showTokenPanel(true);
        }
        throw new Error(result && result.message ? result.message : 'No se pudieron cargar los sitios.');
      }
      state.domains = result.domains || [];
      state.placements = result.placements || [];
      state.optionsLoaded = true;
      populateDomains();
      populatePlacements('');
    }

    function handleServerError(result, silent) {
      var code = result && result.code;
      var message = result && result.message ? result.message : 'Error desconocido.';
      if (code === 'TOKEN_MISSING' || code === 'AUTH') {
        state.hasToken = false;
        showTokenPanel(true);
        setTokenMessage(message, 'error');
      }
      setStatus(message, 'error');
      if (!silent) { showToast(message, 'error'); }
    }

    async function refresh(silent) {
      var isSilent = silent === true;
      if (state.loading) { return; }
      var filters = collectFilters();
      if (!filters.startDate || !filters.finishDate) {
        if (!isSilent) { showToast('Selecciona un rango de fechas.', 'error'); }
        return;
      }
      setLoading(true, isSilent);
      if (!isSilent) { setStatus('Consultando Adsterra...', 'info'); }
      try {
        var result = await callServer('getDashboard', filters);
        if (!result || !result.ok) {
          handleServerError(result, isSilent);
          return;
        }
        state.data = result;
        renderAll();
        setStatus('', '');
      } catch (error) {
        setStatus(error.message || 'Error al consultar la API.', 'error');
      } finally {
        setLoading(false, isSilent);
      }
    }

    function startAutoRefresh() {
      if (state.pollTimer !== null) { return; }
      state.pollTimer = window.setInterval(function () {
        if (state.hasToken && document.visibilityState !== 'hidden') {
          refresh(true);
        }
      }, POLL_INTERVAL_MS);
    }

    function stopAutoRefresh() {
      if (state.pollTimer !== null) {
        window.clearInterval(state.pollTimer);
        state.pollTimer = null;
      }
    }

    function renderAll() {
      var data = state.data;
      $('rangeLabel').textContent = data.range.startDate + ' a ' + data.range.finishDate + ' (' + data.range.days + ' días)';
      var yearToDate = data.yearToDate || {};
      $('annualRevenueYear').textContent = yearToDate.year || '—';
      $('annualRevenue').textContent = yearToDate.revenue === undefined ? '—' : formatMoney(yearToDate.revenue);
      if (data.meta && data.meta.dbLastUpdateTime) {
        $('lastUpdate').textContent = 'Datos: ' + data.meta.dbLastUpdateTime;
      } else {
        $('lastUpdate').textContent = 'Actualizado: ' + new Date(data.generatedAt).toLocaleString('es-ES');
      }
      renderKpis(data.totals);
      renderTable();
    }

    function renderKpis(totals) {
      $('kpiImpressions').textContent = formatInt(totals.impressions);
      $('kpiClicks').textContent = formatInt(totals.clicks);
      $('kpiCtr').textContent = formatPercent(totals.ctr);
      $('kpiCpm').textContent = '$' + formatDecimal(totals.cpm, 4);
      $('kpiRevenue').textContent = formatMoney(totals.revenue);
    }

    function currentRows() {
      if (state.activeTab === 'history') {
        return (state.history && state.history.daily) || [];
      }
      var config = TABLES[state.activeTab];
      return state.data && config ? config.rows(state.data) : [];
    }

    function renderHistoryTools() {
      $('historyTools').classList.remove('hidden');
      var status = state.historyStatus || {};
      var parts = [];
      if (status.hasSpreadsheet) {
        parts.push('Resumen: ' + formatInt(status.summaryRows || 0) + ' filas');
        parts.push('Placements: ' + formatInt(status.placementRows || 0) + ' filas');
        parts.push('Países: ' + formatInt(status.countryRows || 0) + ' filas');
        if (status.lastDate) {
          parts.push('Último día guardado: ' + status.lastDate);
        }
        parts.push(status.triggerInstalled ? 'Guardado automático activo' : 'Guardado automático inactivo');
      } else {
        parts.push('Aún no hay hoja de historial. Usa "Guardar ayer" para crearla.');
      }
      $('historyStatus').textContent = parts.join(' - ');
      var link = $('openSheetLink');
      if (status.spreadsheetUrl) {
        link.href = status.spreadsheetUrl;
        link.classList.remove('hidden');
      } else {
        link.classList.add('hidden');
        link.removeAttribute('href');
      }
    }

    function renderTable() {
      var config = TABLES[state.activeTab];
      if (!config) { return; }
      var wrap = $('tableWrap');
      var scrollTop = wrap.scrollTop;
      wrap.innerHTML = '';
      if (state.activeTab === 'history') {
        renderHistoryTools();
      } else {
        $('historyTools').classList.add('hidden');
      }

      var rows = currentRows();
      $('tableCount').textContent = rows.length + ' filas';

      if (!rows.length) {
        var empty = document.createElement('div');
        empty.className = 'empty';
        if (state.activeTab === 'history') {
          empty.textContent = 'Aún no hay historial guardado para este rango.';
        } else if (state.activeTab === 'countries' && state.data && !state.data.countries.length) {
          empty.textContent = 'Activa la casilla "Incluir países" y pulsa Aplicar.';
        } else {
          empty.textContent = 'No hay datos para los filtros seleccionados.';
        }
        wrap.appendChild(empty);
        wrap.scrollTop = scrollTop;
        return;
      }

      var sort = state.sort[state.activeTab] || { key: config.columns[0].key, dir: 'asc' };
      var sorted = rows.slice().sort(function (a, b) {
        var av = a[sort.key];
        var bv = b[sort.key];
        if (typeof av === 'number' && typeof bv === 'number') {
          return sort.dir === 'asc' ? av - bv : bv - av;
        }
        return sort.dir === 'asc'
          ? String(av || '').localeCompare(String(bv || ''), 'es')
          : String(bv || '').localeCompare(String(av || ''), 'es');
      });

      var table = document.createElement('table');
      var thead = document.createElement('thead');
      var headRow = document.createElement('tr');
      config.columns.forEach(function (column) {
        var th = document.createElement('th');
        th.textContent = column.label;
        if (column.type !== 'badge') {
          th.className = 'sortable' + (sort.key === column.key ? ' sorted-' + sort.dir : '');
          if (['int', 'percent', 'money', 'money4'].indexOf(column.type) >= 0) {
            th.classList.add('num');
          }
          th.addEventListener('click', function () {
            var isNumeric = ['int', 'percent', 'money', 'money4'].indexOf(column.type) >= 0;
            var nextDir = sort.key === column.key
              ? (sort.dir === 'desc' ? 'asc' : 'desc')
              : (isNumeric ? 'desc' : 'asc');
            state.sort[state.activeTab] = { key: column.key, dir: nextDir };
            renderTable();
          });
        }
        headRow.appendChild(th);
      });
      if (state.activeTab === 'daily') {
        var trendHeader = document.createElement('th');
        trendHeader.textContent = 'Tendencia';
        headRow.appendChild(trendHeader);
      }
      thead.appendChild(headRow);
      table.appendChild(thead);

      var tbody = document.createElement('tbody');
      var maxRevenue = state.activeTab === 'daily'
        ? Math.max.apply(null, sorted.map(function (row) { return Number(row.revenue) || 0; }).concat([0]))
        : 0;

      sorted.forEach(function (row) {
        var tr = document.createElement('tr');
        config.columns.forEach(function (column) {
          var td = document.createElement('td');
          var value = row[column.key];
          if (column.type === 'badge') {
            var badge = document.createElement('span');
            badge.className = 'badge badge-' + slug(String(value || 'otros'));
            badge.textContent = value || 'Otros';
            td.appendChild(badge);
          } else {
            td.textContent = formatValue(column.type, value);
            if (column.type !== 'text') {
              td.className = 'num';
            }
          }
          tr.appendChild(td);
        });
        if (state.activeTab === 'daily') {
          var barCell = document.createElement('td');
          barCell.className = 'bar-cell';
          var bar = document.createElement('div');
          bar.className = 'bar';
          var fill = document.createElement('span');
          fill.style.width = (maxRevenue > 0 ? (Number(row.revenue) / maxRevenue) * 100 : 0) + '%';
          bar.appendChild(fill);
          barCell.appendChild(bar);
          tr.appendChild(barCell);
        }
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);

      var totals = state.activeTab === 'history'
        ? (state.history && state.history.totals)
        : (state.data && state.data.totals);

      if (config.total && totals) {
        var tfoot = document.createElement('tfoot');
        var totalRow = document.createElement('tr');
        config.columns.forEach(function (column, index) {
          var td = document.createElement('td');
          if (index === 0) {
            td.textContent = 'Total';
            td.className = 'total-label';
          } else if (column.key === 'placements') {
            td.textContent = formatInt(rows.reduce(function (sum, row) {
              return sum + (Number(row.placements) || 0);
            }, 0));
            td.className = 'num';
          } else if (Object.prototype.hasOwnProperty.call(totals, column.key)) {
            td.textContent = formatValue(column.type, totals[column.key]);
            if (column.type !== 'badge') {
              td.className = 'num';
            }
          }
          totalRow.appendChild(td);
        });
        if (state.activeTab === 'daily') {
          totalRow.appendChild(document.createElement('td'));
        }
        tfoot.appendChild(totalRow);
        table.appendChild(tfoot);
      }

      wrap.appendChild(table);
      wrap.scrollTop = scrollTop;
    }

    function csvCell(value) {
      var text = String(value === null || value === undefined ? '' : value);
      return '"' + text.replace(/"/g, '""') + '"';
    }

    function exportCsv() {
      var config = TABLES[state.activeTab];
      var rows = currentRows();
      if (!config || !rows.length) {
        showToast('No hay datos para exportar.', 'error');
        return;
      }
      var lines = [config.columns.map(function (column) { return csvCell(column.label); }).join(',')];
      rows.forEach(function (row) {
        lines.push(config.columns.map(function (column) {
          return csvCell(rawValue(column.type, row[column.key]));
        }).join(','));
      });
      var totals = state.activeTab === 'history'
        ? (state.history && state.history.totals)
        : (state.data && state.data.totals);
      if (totals) {
        lines.push(config.columns.map(function (column, index) {
          if (index === 0) { return csvCell('Total'); }
          if (column.key === 'placements') {
            return csvCell(rows.reduce(function (sum, row) {
              return sum + (Number(row.placements) || 0);
            }, 0));
          }
          if (Object.prototype.hasOwnProperty.call(totals, column.key)) {
            return csvCell(rawValue(column.type, totals[column.key]));
          }
          return '';
        }).join(','));
      }
      var csv = '\uFEFF' + lines.join('\r\n');
      var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      var suffix = state.data
        ? state.data.range.startDate + '_' + state.data.range.finishDate
        : 'historial';
      link.href = url;
      link.download = 'adsterra-' + state.activeTab + '-' + suffix + '.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    async function loadHistory() {
      var filters = collectFilters();
      setStatus('Leyendo historial guardado...', 'info');
      try {
        var responses = await Promise.all([
          callServer('getHistoryStatus'),
          callServer('getStoredHistory', filters)
        ]);
        var status = responses[0];
        var history = responses[1];
        state.historyStatus = status && status.ok ? status : {};
        state.history = history && history.ok ? history : { daily: [], totals: null };
        renderHistoryTools();
        renderTable();
        if (!history || !history.ok) {
          setStatus(history && history.message ? history.message : 'No se pudo leer el historial.', 'error');
        } else if (history.coverage && (history.coverage.from || history.coverage.to)) {
          setStatus('Historial disponible: ' + (history.coverage.from || '?') + ' a ' + (history.coverage.to || '?') + '.', 'info');
        } else {
          setStatus('', '');
        }
      } catch (error) {
        setStatus(error.message || 'Error al leer el historial.', 'error');
      }
    }

    async function saveYesterday() {
      setLoading(true);
      setStatus('Guardando el día de ayer en Google Sheets...', 'info');
      try {
        var result = await callServer('guardarHistoricoAyer');
        if (!result || !result.ok) {
          setStatus(result && result.message ? result.message : 'No se pudo guardar.', 'error');
          return;
        }
        var saved = result.result;
        await loadHistory();
        setStatus('Guardado ' + saved.date + ': ' + saved.summary + ' sitios, ' + saved.placements + ' placements, ' + saved.countries + ' países.', 'success');
        showToast('Histórico guardado.', 'success');
      } catch (error) {
        setStatus(error.message || 'Error al guardar el histórico.', 'error');
      } finally {
        setLoading(false);
      }
    }

    async function backfill() {
      var filters = collectFilters();
      if (!state.backfillPending) {
        state.backfillPending = true;
        setStatus('Pulsa "Rellenar rango" otra vez para confirmar ' + filters.startDate + ' a ' + filters.finishDate + '. Máximo 90 días por ejecución.', 'warn');
        setTimeout(function () { state.backfillPending = false; }, 6000);
        return;
      }
      state.backfillPending = false;
      setLoading(true);
      setStatus('Rellenando historial... esto puede tardar.', 'info');
      try {
        var result = await callServer('rellenarHistoricoRango', filters.startDate, filters.finishDate);
        if (!result || !result.ok) {
          setStatus(result && result.message ? result.message : 'No se pudo rellenar.', 'error');
          return;
        }
        var errors = (result.results || []).filter(function (item) { return item.error; });
        await loadHistory();
        setStatus('Rango procesado: ' + result.days + ' días' + (errors.length ? ' (' + errors.length + ' con error)' : '') + '.', errors.length ? 'warn' : 'success');
        showToast('Relleno completado.', errors.length ? 'info' : 'success');
      } catch (error) {
        setStatus(error.message || 'Error al rellenar el histórico.', 'error');
      } finally {
        setLoading(false);
      }
    }

    async function installTrigger() {
      setLoading(true);
      try {
        var result = await callServer('instalarTriggerDiario');
        var message = result && result.message ? result.message : 'Trigger actualizado.';
        await loadHistory();
        setStatus(message, result && result.ok ? 'success' : 'error');
        showToast(message, result && result.ok ? 'success' : 'error');
      } catch (error) {
        setStatus(error.message || 'Error al activar el guardado automático.', 'error');
      } finally {
        setLoading(false);
      }
    }

    async function removeTrigger() {
      setLoading(true);
      try {
        var result = await callServer('eliminarTriggerDiario');
        var message = result && result.message ? result.message : 'Guardado automático desactivado.';
        await loadHistory();
        setStatus(message, result && result.ok ? 'success' : 'error');
        showToast(message, result && result.ok ? 'success' : 'error');
      } catch (error) {
        setStatus(error.message || 'Error al desactivar el guardado automático.', 'error');
      } finally {
        setLoading(false);
      }
    }

    async function saveToken() {
      var token = $('tokenInput').value.trim();
      if (!token) {
        setTokenMessage('Pega el token primero.', 'error');
        return;
      }
      $('saveTokenBtn').disabled = true;
      setTokenMessage('Enviando token al Web App...', 'info');
      try {
        await postToken(token);
        var status = await callServer('getConfigStatus');
        if (!status || !status.hasToken) {
          setTokenMessage('No se pudo guardar el token. Verifica que el Web App tenga acceso "Cualquiera" y que el token sea válido.', 'error');
          return;
        }
        $('tokenInput').value = '';
        state.hasToken = true;
        await loadOptions();
        hideTokenPanel();
        showToast('Token guardado correctamente.', 'success');
        await refresh();
        startAutoRefresh();
      } catch (error) {
        setTokenMessage(error.message || 'Error al guardar el token.', 'error');
      } finally {
        $('saveTokenBtn').disabled = false;
      }
    }

    async function deleteToken() {
      try {
        await callServer('deleteApiToken');
        stopAutoRefresh();
        state.hasToken = false;
        state.optionsLoaded = false;
        state.data = null;
        state.history = null;
        state.historyStatus = null;
        $('domainSelect').innerHTML = '<option value="">Todos los sitios</option>';
        $('placementSelect').innerHTML = '<option value="">Todos los placements</option>';
        $('tableWrap').innerHTML = '';
        $('tableCount').textContent = '';
        setStatus('Token eliminado. Configura uno nuevo para continuar.', 'warn');
        showTokenPanel(false);
      } catch (error) {
        setTokenMessage(error.message || 'No se pudo eliminar el token.', 'error');
      }
    }

    function bindEvents() {
      $('settingsBtn').addEventListener('click', function () { showTokenPanel(true); });
      $('saveTokenBtn').addEventListener('click', saveToken);
      $('deleteTokenBtn').addEventListener('click', deleteToken);
      $('cancelTokenBtn').addEventListener('click', hideTokenPanel);
      $('tokenInput').addEventListener('keydown', function (event) {
        if (event.key === 'Enter') { saveToken(); }
      });

      $('presetSelect').addEventListener('change', function () {
        applyPreset($('presetSelect').value, true);
      });
      $('domainSelect').addEventListener('change', function () {
        populatePlacements($('domainSelect').value);
      });
      $('applyBtn').addEventListener('click', refresh);
      $('refreshBtn').addEventListener('click', refresh);
      $('exportBtn').addEventListener('click', exportCsv);

      document.querySelectorAll('.tab').forEach(function (tab) {
        tab.addEventListener('click', function () {
          document.querySelectorAll('.tab').forEach(function (item) {
            item.classList.remove('active');
          });
          tab.classList.add('active');
          state.activeTab = tab.getAttribute('data-tab');
          if (state.activeTab === 'history') {
            loadHistory();
          } else {
            renderTable();
          }
        });
      });

      $('saveYesterdayBtn').addEventListener('click', saveYesterday);
      $('backfillBtn').addEventListener('click', backfill);
      $('installTriggerBtn').addEventListener('click', installTrigger);
      $('removeTriggerBtn').addEventListener('click', removeTrigger);
    }

    async function init() {
      bindEvents();
      applyPreset('7d', false);
      try {
        var status = await callServer('getConfigStatus');
        state.hasToken = Boolean(status && status.hasToken);
        if (!state.hasToken) {
          showTokenPanel(false);
          setTokenMessage('Configura tu API token de Adsterra para comenzar.', 'info');
          setStatus('Configura tu API token de Adsterra para comenzar.', 'warn');
          return;
        }
        hideTokenPanel();
        await loadOptions();
        await refresh();
        startAutoRefresh();
      } catch (error) {
        setStatus(error.message || 'Error al iniciar la aplicación.', 'error');
      }
    }

    init();
  })();
