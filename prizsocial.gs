/**
 * ============================================================================
 *  PRIZMOTHYN - Backend del catálogo y servicios para invitados
 * ============================================================================
 *  Las acciones personales (servidores, favoritos, colecciones, likes,
 *  reportes y semillas) se identifican con un ID anónimo por dispositivo
 *  (`guestId`). No hay cuentas, sesiones ni recuperación de contraseña.
 *
 *  La interfaz web usa únicamente las rutas de RS_ROUTES. Este archivo no
 *  contiene cuentas, sesiones, publicaciones ni recuperación de contraseña.
 * ============================================================================
 */

// ══════════════════════════════════════════════════════════════════════════════
//  CONFIGURACIÓN
// ══════════════════════════════════════════════════════════════════════════════

const RS = {
  ROOT_FOLDER_NAME: 'Prizmothyn',
  MAX_IMAGE_BYTES: 5 * 1024 * 1024,
  MAX_REQUEST_CHARS: 30 * 1024 * 1024,
  SERVER_STATUS_BATCH_SIZE: 20,
  SERVER_STATUS_TRIGGER_MINUTES: 5,
  SERVER_INACTIVE_DAYS: 15,
  SERVER_STATUS_URL: 'https://api.mcsrvstat.us/bedrock/3/',
  DATA_SPREADSHEET_ID: '1DvEh38vptPl_hx5gQiLJ_Req7idY1guLboNyi0lNF9A',
  ADDONS_SHEET_ID: '1ZYh5iOdPeViADhv42kbKAqf2EmkDB5B66ri5zRpzakw',
  ADDONS_SHEET_NAME: 'publicado',
  SEEDS_SHEET_NAME: 'semillas',
  SEEDS_PAGE_SIZE: 48,
  SEEDS_MAX_PAGE_SIZE: 60,
  ADDONS_ACTION_URL: 'https://script.google.com/macros/s/AKfycbwn7tsOYmNdEZNtjoyZ6nYk7e9u8thgeIQwKa9UIvlUxMK_iFxpljb-TlF9-4jECq4M/exec',
  ADDONS_PAGE_SIZE: 48,
  ADDONS_MAX_PAGE_SIZE: 60,
  ADDONS_CATEGORY_COUNTS_CACHE_SECONDS: 300,
  ADDONS_TRANSLATION_CACHE_SECONDS: 21600
};

const RS_HEADERS = {
  palabras_prohibidas: ['Word', 'CreatedAt', 'CreatedBy'],
  addon_likes: ['UserId', 'AddonId', 'Fecha'],
  addon_favorites: ['UserId', 'AddonId', 'Fecha'],
  addon_collections: ['CollectionId', 'UserId', 'Nombre', 'FechaCreacion', 'FechaActualizacion'],
  addon_collection_items: ['CollectionId', 'AddonId', 'Fecha'],
  reportes: ['ReportId', 'ReporterId', 'Tipo', 'Titulo', 'Detalle', 'Estado', 'Fecha', 'FechaActualizacion'],
  servidores: [
    'ServerId', 'UserId', 'Nombre', 'Host', 'Port', 'Imagen', 'FechaCreacion',
    'Online', 'PlayersOnline', 'PlayersMax', 'Version', 'Motd', 'LastChecked',
    'InactiveSince'
  ],
  auditoria: ['EventoId', 'Fecha', 'Tipo', 'ActorId', 'ObjetivoId', 'Detalle']
};

// Caché en memoria por ejecución (Apps Script la reinicia en cada request).
let RS_CACHE = {};
let RS_SS = null;

// ══════════════════════════════════════════════════════════════════════════════
//  PUNTOS DE ENTRADA
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Sirve la interfaz web (index.html). También expone ?action=health.
 */
function doGet(e) {
  const params = (e && e.parameter) || {};
  if (String(params.action || '') === 'health') {
    return jsonOut_({ ok: true, servicio: 'Prizmothyn', hora: nowIso_() });
  }
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('Prizmothyn · Catálogo y herramientas')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/**
 * API JSON para el frontend alojado fuera de Apps Script y para clientes externos.
 * El navegador debe enviar Content-Type: text/plain (evita preflight) y seguir el 302.
 * Cuando el frontend se sirve desde doGet, usa google.script.run.apiCall().
 */
function doPost(e) {
  let req = {};
  try {
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    if (raw.length > RS.MAX_REQUEST_CHARS) {
      return jsonOut_({ ok: false, error: 'BAD_REQUEST', message: 'La solicitud supera el tamaño permitido' });
    }
    req = JSON.parse(raw);
  } catch (err) {
    return jsonOut_({ ok: false, error: 'BAD_REQUEST', message: 'JSON inválido' });
  }
  return jsonOut_(api_(req));
}

/**
 * Función expuesta a google.script.run. Recibe y devuelve JSON en texto.
 */
function apiCall(payloadJson) {
  let req = {};
  try {
    if (typeof payloadJson === 'string') {
      if (payloadJson.length > RS.MAX_REQUEST_CHARS) {
        return JSON.stringify({ ok: false, error: 'BAD_REQUEST', message: 'La solicitud supera el tamaño permitido' });
      }
      req = JSON.parse(payloadJson);
    } else {
      req = payloadJson || {};
      if (JSON.stringify(req).length > RS.MAX_REQUEST_CHARS) {
        return JSON.stringify({ ok: false, error: 'BAD_REQUEST', message: 'La solicitud supera el tamaño permitido' });
      }
    }
  } catch (err) {
    return JSON.stringify({ ok: false, error: 'BAD_REQUEST', message: 'JSON inválido' });
  }
  return JSON.stringify(api_(req));
}

function api_(req) {
  RS_CACHE = {};
  try {
    if (!req || typeof req !== 'object' || Array.isArray(req)) {
      fail_('BAD_REQUEST', 'La solicitud no es válida');
    }
    const action = String((req && req.action) || '').trim();
    const handler = RS_ROUTES[action];
    if (!handler) fail_('UNKNOWN_ACTION', 'Acción no reconocida');
    const data = handler(req || {});
    return { ok: true, data: data === undefined ? null : data };
  } catch (err) {
    if (err && err.name === 'AppError') {
      return { ok: false, error: err.code, message: err.message };
    }
    console.error(err && err.stack ? err.stack : err);
    return { ok: false, error: 'SERVER', message: 'Error interno del servidor' };
  }
}

function normalizeModerationText_(value) {
  let text = String(value || '').toLowerCase();
  if (typeof text.normalize === 'function') {
    text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  return text;
}

function assertAllowedText_(value, label) {
  const text = normalizeModerationText_(value);
  if (!text) return;
  readRecords_('palabras_prohibidas').records.forEach(function (record) {
    const word = String(record.Word || '').trim();
    const normalizedWord = normalizeModerationText_(word);
    if (normalizedWord && text.indexOf(normalizedWord) !== -1) {
      fail_('PROHIBITED_WORD', 'La palabra prohibida «' + word + '» no está permitida' +
        (label ? ' en ' + label : '') + '.');
    }
  });
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ══════════════════════════════════════════════════════════════════════════════
//  UTILIDADES GENERALES
// ══════════════════════════════════════════════════════════════════════════════

function fail_(code, message) {
  const err = new Error(message || code);
  err.name = 'AppError';
  err.code = code;
  throw err;
}

function nowIso_() {
  return new Date().toISOString();
}

function toDateMs_(value) {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return isNaN(t) ? 0 : t;
}

function cleanText_(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/\u0000/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

function str_(value, field, min, max) {
  const s = cleanText_(value).trim();
  if (s.length < (min || 1)) fail_('VALIDATION', field + ' es obligatorio');
  if (max && s.length > max) fail_('VALIDATION', field + ' supera ' + max + ' caracteres');
  return s;
}

function safeCell_(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    const v = value.replace(/\u0000/g, '');
    if (/^[=+\-@\t\r]/.test(v)) return "'" + v;
    return v;
  }
  return value;
}

// Normaliza valores leídos de Sheets (fechas -> ISO, texto seguro).
function normalizeCell_(value) {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/^'[=+\-@\t\r]/.test(s)) s = s.slice(1);
  return s;
}

function ss_() {
  if (RS_SS) return RS_SS;
  const props = PropertiesService.getScriptProperties();
  const savedId = props.getProperty('RS_SPREADSHEET_ID');
  const configuredId = String(RS.DATA_SPREADSHEET_ID || '').trim();
  const spreadsheetId = configuredId || savedId;

  if (spreadsheetId) {
    try {
      RS_SS = SpreadsheetApp.openById(spreadsheetId);
      if (savedId !== spreadsheetId) props.setProperty('RS_SPREADSHEET_ID', spreadsheetId);
      return RS_SS;
    } catch (e) {
      if (configuredId) {
        console.error('No se pudo abrir la base de datos configurada de Prizmothyn: ' + e);
        fail_('CONFIG', 'No se pudo abrir la base de datos de Prizmothyn. Comprueba el acceso de la cuenta que ejecuta Apps Script.');
      }
      props.deleteProperty('RS_SPREADSHEET_ID');
    }
  }

  let active = null;
  try { active = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { active = null; }
  if (active) {
    RS_SS = active;
    props.setProperty('RS_SPREADSHEET_ID', active.getId());
    return RS_SS;
  }

  // Script independiente: crea la base de datos y la recuerda.
  RS_SS = SpreadsheetApp.create('Prizmothyn - Base de datos');
  props.setProperty('RS_SPREADSHEET_ID', RS_SS.getId());
  return RS_SS;
}

function getSheet_(name) {
  const headers = RS_HEADERS[name];
  if (!headers) fail_('CONFIG', 'Colección de datos desconocida: ' + name);
  const cacheKey = 'sheet:' + name;
  if (RS_CACHE[cacheKey]) return RS_CACHE[cacheKey];

  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) initSheet_(sh, headers);

  RS_CACHE[cacheKey] = sh;
  return sh;
}

function initSheet_(sh, headers) {
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  styleHeader_(sh, headers.length);
  // Formato texto en toda la colección: evita fórmulas y conserva ceros iniciales.
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setNumberFormat('@');
  sh.setFrozenRows(1);
}

function styleHeader_(sh, columns) {
  sh.getRange(1, 1, 1, columns)
    .setFontWeight('bold')
    .setBackground('#14532d')
    .setFontColor('#ffffff');
}

function readRecords_(name) {
  if (RS_CACHE[name]) return RS_CACHE[name];
  const sh = getSheet_(name);
  const values = sh.getDataRange().getValues();
  const headers = values.length
    ? values[0].map(function (h) { return String(h).trim(); })
    : RS_HEADERS[name].slice();
  const records = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    let empty = true;
    for (let j = 0; j < row.length; j++) {
      if (row[j] !== '' && row[j] !== null && row[j] !== undefined) { empty = false; break; }
    }
    if (empty) continue;
    const obj = { __row: i + 1 };
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = normalizeCell_(row[j]);
    }
    records.push(obj);
  }
  const result = { sh: sh, headers: headers, records: records };
  RS_CACHE[name] = result;
  return result;
}

function clearCache_(names) {
  if (!names) { RS_CACHE = {}; return; }
  (Array.isArray(names) ? names : [names]).forEach(function (n) { delete RS_CACHE[n]; });
}

function appendRecord_(name, obj) {
  const sh = getSheet_(name);
  const headers = RS_HEADERS[name];
  const row = headers.map(function (h) {
    const v = obj[h];
    return safeCell_(v === undefined || v === null ? '' : v);
  });
  sh.appendRow(row);
  clearCache_(name);
  return sh.getLastRow();
}

function updateRecord_(name, rowNumber, values) {
  const sh = getSheet_(name);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim(); });
  Object.keys(values).forEach(function (key) {
    const idx = headers.indexOf(key);
    if (idx >= 0) sh.getRange(rowNumber, idx + 1).setValue(safeCell_(values[key]));
  });
  clearCache_(name);
}

function deleteRows_(name, rows) {
  if (!rows || !rows.length) return;
  const sh = getSheet_(name);
  rows.slice().sort(function (a, b) { return b - a; }).forEach(function (r) {
    sh.deleteRow(r);
  });
  clearCache_(name);
}

function deleteWhere_(name, predicate) {
  const recs = readRecords_(name).records.filter(predicate);
  deleteRows_(name, recs.map(function (r) { return r.__row; }));
  return recs.length;
}

function ensureHeaders_(name) {
  const sh = getSheet_(name);
  const headers = RS_HEADERS[name];
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const current = sh.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(function (h) { return String(h).trim(); });
  let changed = false;
  headers.forEach(function (h) {
    if (current.indexOf(h) === -1) {
      const col = sh.getLastColumn() + 1;
      sh.getRange(1, col).setValue(h);
      current.push(h);
      changed = true;
    }
  });
  if (changed) {
    styleHeader_(sh, sh.getLastColumn());
    sh.setFrozenRows(1);
  }
  return sh;
}

/**
 * Ejecuta esta función UNA vez desde el editor de Apps Script para preparar
 * la base de datos, las cabeceras y la carpeta raíz de Drive.
 */
function configurarPrizmothyn() {
  Object.keys(RS_HEADERS).forEach(ensureHeaders_);
  const folder = getRootFolder_();
  const ss = ss_();
  let serverMaintenance = '';
  try {
    serverMaintenance = instalarActualizacionServidores();
  } catch (e) {
    console.error('No se pudo activar la actualización de servidores: ' + e);
    serverMaintenance = 'Actualización automática de servidores pendiente.';
  }
  return 'Prizmothyn listo.\nBase de datos: ' + ss.getName() + '\n' +
    'Carpeta raíz de Drive: ' + folder.getName() + ' (' + folder.getId() + ')\n' +
    serverMaintenance;
}

// ══════════════════════════════════════════════════════════════════════════════
//  IDENTIDAD Y LÍMITES
// ══════════════════════════════════════════════════════════════════════════════

function makeId_(prefix, length) {
  return prefix + Utilities.getUuid().replace(/-/g, '').slice(0, length || 12);
}

function logSecurityEvent_(tipo, actorId, objetivoId, detalle) {
  try {
    appendRecord_('auditoria', {
      EventoId: makeId_('e', 12),
      Fecha: nowIso_(),
      Tipo: String(tipo || 'evento').slice(0, 40),
      ActorId: String(actorId || '').slice(0, 40),
      ObjetivoId: String(objetivoId || '').slice(0, 40),
      Detalle: String(detalle || '').slice(0, 500)
    });
  } catch (e) {
    console.error('No se pudo registrar el evento de seguridad: ' + e);
  }
}

function enforceRateLimit_(bucket, max, windowSec, message) {
  const label = String(bucket || 'general').slice(0, 80);
  const limite = Math.max(1, parseInt(max, 10) || 60);
  const ventana = Math.max(1, parseInt(windowSec, 10) || 60);
  try {
    const cache = CacheService.getScriptCache();
    const key = ('wl_rl_' + label).slice(0, 240);
    const count = parseInt(cache.get(key), 10) || 0;
    if (count >= limite) {
      const logKey = ('wl_rl_log_' + label).slice(0, 240);
      if (!cache.get(logKey)) {
        cache.put(logKey, '1', ventana);
        logSecurityEvent_('rate_limit', '', '', 'Límite excedido: ' + label);
      }
      fail_('RATE_LIMIT', message || 'Demasiadas solicitudes. Espera un momento antes de intentarlo de nuevo.');
    }
    cache.put(key, String(count + 1), ventana);
  } catch (err) {
    if (err && err.name === 'AppError') throw err;
    console.error('No se pudo aplicar el límite de solicitudes: ' + err);
  }
}

/**
 * Identidad anónima por dispositivo. Sustituye a las cuentas en todas las
 * acciones que antes exigían sesión (servidores, biblioteca, reportes...).
 */
function guestActor_(req) {
  const id = String((req && req.guestId) || '').trim();
  if (!/^g_[A-Za-z0-9_-]{8,64}$/.test(id)) {
    fail_('AUTH', 'No se pudo identificar este dispositivo. Recarga la página.');
  }
  return {
    UserId: id,
    Nombre: 'invitado',
    NombreMostrado: 'Invitado',
    Rol: 'Usuario',
    Estado: 'activo',
    FotoPerfil: '',
    esInvitado: true
  };
}

function actorForRequest_(req) {
  return guestActor_(req);
}

// ══════════════════════════════════════════════════════════════════════════════
//  REPORTES Y SUGERENCIAS
// ══════════════════════════════════════════════════════════════════════════════

function rsCreateReport_(req) {
  const me = actorForRequest_(req);
  enforceRateLimit_('reportar:' + me.UserId, 10, 3600, 'Has enviado demasiados reportes. Inténtalo más tarde.');
  const type = String(req.tipo || '').trim().toLowerCase();
  if (type !== 'error' && type !== 'sugerencia') {
    fail_('VALIDATION', 'Tipo de reporte no válido');
  }
  const title = str_(req.titulo, 'Título', 3, 120);
  const detail = str_(req.detalle, 'Descripción', 10, 2500);
  assertAllowedText_(title, 'el título del reporte');
  assertAllowedText_(detail, 'la descripción del reporte');
  const now = nowIso_();
  const record = {
    ReportId: makeId_('r', 14),
    ReporterId: me.UserId,
    Tipo: type,
    Titulo: title,
    Detalle: detail,
    Estado: 'pendiente',
    Fecha: now,
    FechaActualizacion: now
  };
  appendRecord_('reportes', record);
  logSecurityEvent_('reporte_creado', me.UserId, '', type);
  return { reportId: record.ReportId, estado: record.Estado };
}

// ══════════════════════════════════════════════════════════════════════════════
//  DRIVE (imágenes)
// ══════════════════════════════════════════════════════════════════════════════

function getRootFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('RS_ROOT_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); }
    catch (e) { props.deleteProperty('RS_ROOT_FOLDER_ID'); }
  }
  const folder = DriveApp.createFolder(RS.ROOT_FOLDER_NAME);
  props.setProperty('RS_ROOT_FOLDER_ID', folder.getId());
  return folder;
}

function getChildFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function getGuestFolder_(guestId) {
  const root = getRootFolder_();
  const guests = getChildFolder_(root, 'invitados');
  return getChildFolder_(guests, String(guestId));
}

function validateImageData_(dataUrl) {
  const raw = String(dataUrl);
  const match = /^data:(image\/(?:png|jpe?g|webp|gif));base64,([\s\S]+)$/i.exec(raw);
  if (!match) fail_('BAD_IMAGE', 'Formato de imagen no soportado (usa JPG, PNG, WEBP o GIF)');

  const mime = match[1].toLowerCase().replace('image/jpg', 'image/jpeg');
  const base64 = match[2].replace(/\s/g, '');
  if (!base64 || !/^[a-zA-Z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 !== 0) {
    fail_('BAD_IMAGE', 'Los datos de una imagen no son válidos');
  }
  const padding = base64.slice(-2) === '==' ? 2 : (base64.slice(-1) === '=' ? 1 : 0);
  const bytes = Math.floor(base64.length * 3 / 4) - padding;
  if (bytes > RS.MAX_IMAGE_BYTES) {
    fail_('IMAGE_TOO_LARGE', 'La imagen supera el límite de 5 MB');
  }
  if (!hasImageSignature_(base64, mime)) {
    fail_('BAD_IMAGE', 'El contenido del archivo no coincide con su formato de imagen');
  }

  const ext = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1];
  return { mime: mime, base64: base64, ext: ext, bytes: bytes };
}

function hasImageSignature_(base64, mime) {
  if (base64.length < 16) return false;
  let header;
  try {
    header = Utilities.base64Decode(base64.slice(0, 16)).map(function (value) {
      return value & 255;
    });
  } catch (e) {
    return false;
  }
  if (mime === 'image/jpeg') return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  if (mime === 'image/png') {
    return header.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10';
  }
  if (mime === 'image/gif') {
    return header.slice(0, 6).map(function (value) { return String.fromCharCode(value); }).join('') === 'GIF87a' ||
      header.slice(0, 6).map(function (value) { return String.fromCharCode(value); }).join('') === 'GIF89a';
  }
  if (mime === 'image/webp') {
    return header.slice(0, 4).map(function (value) { return String.fromCharCode(value); }).join('') === 'RIFF' &&
      header.slice(8, 12).map(function (value) { return String.fromCharCode(value); }).join('') === 'WEBP';
  }
  return false;
}

function saveValidatedImage_(image, folder, baseName) {
  const name = String(baseName || 'imagen') + '_' + Date.now() + '.' + image.ext;
  const safeName = name.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
  const blob = Utilities.newBlob(Utilities.base64Decode(image.base64), image.mime, safeName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://lh3.googleusercontent.com/u/0/d/' + file.getId() + '=s1000';
}

function deleteImage_(url) {
  if (!url) return;
  try {
    const match = String(url).match(/\/d\/([^\/=]+)/);
    if (match) DriveApp.getFileById(match[1]).setTrashed(true);
  } catch (e) {
    console.error('No se pudo borrar la imagen: ' + e);
  }
}

function invalidateAddonCategoryCountsCache_() {
  CacheService.getScriptCache().remove('wl_addon_category_counts_v4');
}

function invalidateSeedCounts_() {
  invalidateAddonCategoryCountsCache_();
}

// ══════════════════════════════════════════════════════════════════════════════
//  ADDONS / COMPLEMENTOS
//  Catálogo externo leído desde la hoja por la cuenta propietaria del
//  despliegue. Las respuestas solo exponen las columnas necesarias.
// ══════════════════════════════════════════════════════════════════════════════

function addonsSheetRows_() {
  if (RS_CACHE.addonsRows) return RS_CACHE.addonsRows;

  let spreadsheet;
  try {
    spreadsheet = SpreadsheetApp.openById(RS.ADDONS_SHEET_ID);
  } catch (err) {
    console.error('No se pudo abrir la hoja del catálogo: ' +
      (err && err.stack ? err.stack : err));
    fail_(
      'ADDONS_UNAVAILABLE',
      'No se pudo acceder a la hoja del catálogo. Comprueba el ID y que la cuenta propietaria del despliegue tenga acceso.'
    );
  }

  const sheet = spreadsheet.getSheetByName(RS.ADDONS_SHEET_NAME);
  if (!sheet) {
    fail_(
      'ADDONS_UNAVAILABLE',
      'No existe la pestaña "' + RS.ADDONS_SHEET_NAME + '" en la hoja del catálogo.'
    );
  }

  try {
    const lastRow = sheet.getLastRow();
    RS_CACHE.addonsRows = lastRow > 1
      ? sheet.getRange(2, 1, lastRow - 1, 12).getDisplayValues()
      : [];
  } catch (err) {
    console.error('No se pudieron leer las filas del catálogo: ' +
      (err && err.stack ? err.stack : err));
    fail_(
      'ADDONS_UNAVAILABLE',
      'No se pudieron leer los datos del catálogo. Comprueba los permisos de lectura de la cuenta del despliegue.'
    );
  }
  return RS_CACHE.addonsRows;
}

function addonsSplitQuery_(text, operator) {
  const parts = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const character = text.charAt(i);
    if (character === "'") quoted = !quoted;
    if (quoted) continue;
    if (character === '(') depth++;
    else if (character === ')') depth--;

    if (depth !== 0 || text.substr(i, operator.length).toLowerCase() !== operator) continue;
    const before = i === 0 ? ' ' : text.charAt(i - 1);
    const after = text.charAt(i + operator.length) || ' ';
    if (!/\s/.test(before) || !/\s/.test(after)) continue;
    parts.push(text.slice(start, i).trim());
    start = i + operator.length;
    i += operator.length - 1;
  }
  if (!parts.length) return [text.trim()];
  parts.push(text.slice(start).trim());
  return parts;
}

function addonsColumnIndex_(column) {
  const value = String(column || '').trim().toUpperCase();
  if (!/^[A-Z]+$/.test(value)) {
    fail_('ADDONS_UNAVAILABLE', 'La consulta del catálogo contiene una columna no válida.');
  }
  let index = 0;
  for (let i = 0; i < value.length; i++) {
    index = index * 26 + value.charCodeAt(i) - 64;
  }
  return index - 1;
}

function addonsQueryMatches_(row, expression) {
  let clause = String(expression || '').trim();
  while (clause.charAt(0) === '(' && clause.charAt(clause.length - 1) === ')') {
    let depth = 0;
    let quoted = false;
    let wrapsWholeClause = true;
    for (let i = 0; i < clause.length; i++) {
      const character = clause.charAt(i);
      if (character === "'") quoted = !quoted;
      if (quoted) continue;
      if (character === '(') depth++;
      else if (character === ')') depth--;
      if (depth === 0 && i < clause.length - 1) {
        wrapsWholeClause = false;
        break;
      }
    }
    if (!wrapsWholeClause) break;
    clause = clause.slice(1, -1).trim();
  }

  const alternatives = addonsSplitQuery_(clause, 'or');
  if (alternatives.length > 1) {
    return alternatives.some(function (part) { return addonsQueryMatches_(row, part); });
  }
  const conjunctions = addonsSplitQuery_(clause, 'and');
  if (conjunctions.length > 1) {
    return conjunctions.every(function (part) { return addonsQueryMatches_(row, part); });
  }

  let match = clause.match(/^([A-Z]+)\s+is\s+not\s+null$/i);
  if (match) return String(row[addonsColumnIndex_(match[1])] || '').trim() !== '';

  match = clause.match(/^lower\(([A-Z]+)\)\s+(contains|starts with)\s+'([^']*)'$/i);
  if (match) {
    const value = String(row[addonsColumnIndex_(match[1])] || '').toLowerCase();
    const search = match[3].toLowerCase();
    return match[2].toLowerCase() === 'starts with'
      ? value.indexOf(search) === 0
      : value.indexOf(search) >= 0;
  }

  match = clause.match(/^([A-Z]+)\s+matches\s+'([^']*)'$/i);
  if (match) return new RegExp(match[2]).test(String(row[addonsColumnIndex_(match[1])] || ''));

  match = clause.match(/^([A-Z]+)\s*=\s*'([^']*)'$/i);
  if (match) return String(row[addonsColumnIndex_(match[1])] || '') === match[2];

  fail_('ADDONS_UNAVAILABLE', 'La consulta del catálogo contiene un filtro no compatible.');
}

function addonsCompareRows_(left, right, order) {
  for (const field of order) {
    const column = addonsColumnIndex_(field.column);
    const a = String(left.row[column] || '');
    const b = String(right.row[column] || '');
    let comparison = 0;
    if (column === 0) {
      const aDate = Date.parse(a);
      const bDate = Date.parse(b);
      if (Number.isFinite(aDate) && Number.isFinite(bDate)) comparison = aDate - bDate;
    }
    if (!comparison && (column === 5 || column === 6)) {
      comparison = (Number(a) || 0) - (Number(b) || 0);
    }
    if (!comparison) {
      comparison = a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true });
    }
    if (comparison) return field.descending ? -comparison : comparison;
  }
  return left.index - right.index;
}

function addonsFetchRows_(query) {
  const parsed = String(query || '').trim().match(
    /^select\s+([\s\S]+?)(?:\s+where\s+([\s\S]*?))?(?:\s+order\s+by\s+([\s\S]*?))?(?:\s+limit\s+(\d+))?(?:\s+offset\s+(\d+))?$/i
  );
  if (!parsed) fail_('ADDONS_UNAVAILABLE', 'La consulta del catálogo no tiene un formato válido.');

  const fields = parsed[1].trim();
  const where = String(parsed[2] || '').trim();
  const order = String(parsed[3] || '').split(',').map(function (field) {
    const parts = field.trim().split(/\s+/);
    return { column: parts[0], descending: String(parts[1] || '').toLowerCase() === 'desc' };
  }).filter(function (field) { return !!field.column; });
  let rows = addonsSheetRows_().map(function (row, index) {
    return { row: row, index: index };
  });

  if (where) {
    rows = rows.filter(function (record) {
      return addonsQueryMatches_(record.row, where);
    });
  }

  const count = fields.match(/^count\(([A-Z]+)\)$/i);
  if (count) {
    const column = addonsColumnIndex_(count[1]);
    return [[rows.filter(function (record) {
      return String(record.row[column] || '').trim() !== '';
    }).length]];
  }

  if (order.length) rows.sort(function (a, b) { return addonsCompareRows_(a, b, order); });
  const offset = Math.max(0, parseInt(parsed[5], 10) || 0);
  const limit = parsed[4] ? Math.max(0, parseInt(parsed[4], 10) || 0) : rows.length;
  const columns = fields.split(',').map(function (column) {
    return addonsColumnIndex_(column);
  });
  return rows.slice(offset, offset + limit).map(function (record) {
    return columns.map(function (column) { return record.row[column] || ''; });
  });
}

function probarConexionCatalogoAddons() {
  const rows = addonsFetchRows_('select B where B is not null limit 1');
  return 'Acceso a la hoja del catálogo verificado. Filas de prueba: ' + rows.length + '.';
}

function addonsCleanSearch_(value) {
  return cleanText_(value)
    .trim()
    .toLowerCase()
    .replace(/['"\\]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 60);
}

function addonsCleanId_(value) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) {
    fail_('VALIDATION', 'Identificador de complemento no válido');
  }
  return id;
}

function addonsOrderClause_(sort) {
  const key = String(sort || '').trim().toLowerCase();
  if (key === 'descargas') return 'G desc, F desc, B asc';
  if (key === 'valorados') return 'F desc, G desc, B asc';
  if (key === 'recientes') return 'A desc, B asc';
  if (key === 'nombre') return 'B asc';
  if (key === 'populares') return 'G desc, F desc, B asc';
  return 'F desc, G desc, B asc';
}

function addonsCategoryClause_(category) {
  const terms = {
    texturas: ['textur', 'texture'],
    addons: ['addon', 'complement'],
    mapas: ['map', 'world'],
    skins: ['skin'],
    scripts: ['script', 'behavior']
  };
  const selected = String(category || '').trim().toLowerCase();
  if (!selected) return '';
  if (selected === 'versiones') return "lower(E) contains 'version'";
  if (!Object.prototype.hasOwnProperty.call(terms, selected)) {
    fail_('VALIDATION', 'Categoría de complementos no válida');
  }
  return '(' + terms[selected].map(function (term) {
    return "lower(E) contains '" + term + "'";
  }).join(' or ') + ')';
}

function getAddonCategoryCounts_() {
  const cacheKey = 'wl_addon_category_counts_v4';
  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      const valid = ['todos', 'texturas', 'addons', 'mapas', 'skins', 'scripts', 'versiones', 'semillas']
        .every(function (category) {
          return Number.isSafeInteger(parsed[category]) && parsed[category] >= 0;
        });
      if (valid) return { counts: parsed };
      console.error('La caché de cantidades por categoría tiene un formato no válido.');
    } catch (err) {
      console.error('No se pudo interpretar la caché de cantidades por categoría: ' + err);
    }
  }

  const categories = ['texturas', 'addons', 'mapas', 'skins', 'scripts', 'versiones'];
  const counts = {};
  const allRows = addonsFetchRows_('select count(B) where B is not null');
  const total = allRows.length ? Number(allRows[0][0]) : 0;
  if (!Number.isSafeInteger(total) || total < 0) {
    fail_('ADDONS_UNAVAILABLE', 'No se pudo calcular la cantidad total de complementos');
  }
  counts.todos = total;
  categories.forEach(function (category) {
    const clause = addonsCategoryClause_(category);
    const where = ['B is not null', clause].filter(Boolean).join(' and ');
    const rows = addonsFetchRows_('select count(B) where ' + where);
    const count = rows.length ? Number(rows[0][0]) : 0;
    if (!Number.isSafeInteger(count) || count < 0) {
      fail_('ADDONS_UNAVAILABLE', 'No se pudo calcular la cantidad de complementos por categoría');
    }
    counts[category] = count;
  });
  counts.semillas = readSeedRows_().length;

  cache.put(cacheKey, JSON.stringify(counts), RS.ADDONS_CATEGORY_COUNTS_CACHE_SECONDS);
  return { counts: counts };
}

function getAddonCategoryLists_() {
  const categories = {
    texturas: ['textur', 'texture'],
    addons: ['addon', 'complement'],
    mapas: ['map', 'world'],
    skins: ['skin'],
    scripts: ['script', 'behavior'],
    versiones: ['version']
  };
  const addons = [];
  const lists = {
    todos: [],
    texturas: [],
    addons: [],
    mapas: [],
    skins: [],
    scripts: [],
    versiones: []
  };
  const seeds = readSeedRows_().sort(function (left, right) {
    return (toDateMs_(right.Fecha) || 0) - (toDateMs_(left.Fecha) || 0);
  }).map(seedPublicRecord_);
  const rows = addonsFetchRows_(
    'select A,B,C,D,E,F,G,I,J,K,L where B is not null order by A desc, B asc'
  );
  rows.forEach(function (row) {
    const addon = addonsMapListRow_(row);
    if (!addon.id || !addon.nombre) return;
    const addonIndex = addons.length;
    addons.push(addon);
    lists.todos.push(addonIndex);
    const category = String(row[4] || '').toLowerCase();
    Object.keys(categories).forEach(function (categoryId) {
      if (categories[categoryId].some(function (term) {
        return category.indexOf(term) !== -1;
      })) {
        lists[categoryId].push(addonIndex);
      }
    });
  });
  return {
    addons: addons,
    categories: lists,
    semillas: seeds
  };
}

const RS_SEED_HEADERS = [
  'SeedId', 'Fecha', 'Titulo', 'Semilla', 'Version', 'Descripcion',
  'Imagenes', 'Coordenadas', 'Actualizado'
];

function openSeedsSpreadsheet_() {
  try {
    return SpreadsheetApp.openById(RS.ADDONS_SHEET_ID);
  } catch (err) {
    console.error('No se pudo abrir la hoja del catálogo para leer semillas: ' + err);
    fail_('SEEDS_UNAVAILABLE', 'No se pudo acceder al catálogo de semillas.');
  }
}

function readSeedRows_() {
  const spreadsheet = openSeedsSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(RS.SEEDS_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function (value) { return normalizeCell_(value); });
  if (!RS_SEED_HEADERS.every(function (header) { return headers.indexOf(header) !== -1; })) {
    fail_('SEEDS_UNAVAILABLE', 'La pestaña de semillas tiene una estructura no válida.');
  }
  const indices = {};
  RS_SEED_HEADERS.forEach(function (header) { indices[header] = headers.indexOf(header); });
  return values.slice(1).map(function (row, index) {
    const record = {};
    RS_SEED_HEADERS.forEach(function (header) {
      record[header] = normalizeCell_(row[indices[header]]);
    });
    record.__row = index + 2;
    return record;
  }).filter(function (record) {
    return !!record.SeedId && !!record.Titulo && !!record.Semilla;
  });
}

function ensureSeedsSheet_() {
  const spreadsheet = openSeedsSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(RS.SEEDS_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(RS.SEEDS_SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, RS_SEED_HEADERS.length).setValues([RS_SEED_HEADERS]);
    sheet.setFrozenRows(1);
  } else {
    const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), RS_SEED_HEADERS.length))
      .getValues()[0].map(function (value) { return normalizeCell_(value); });
    if (!RS_SEED_HEADERS.every(function (header, index) { return headers[index] === header; })) {
      fail_('SEEDS_UNAVAILABLE', 'La pestaña de semillas tiene una estructura no válida.');
    }
  }
  return sheet;
}

function seedImages_(value) {
  let images;
  try {
    images = typeof value === 'string' ? JSON.parse(value || '[]') : value;
  } catch (err) {
    fail_('SEEDS_UNAVAILABLE', 'Una semilla contiene una lista de imágenes no válida.');
  }
  if (!Array.isArray(images)) {
    fail_('SEEDS_UNAVAILABLE', 'Una semilla contiene una lista de imágenes no válida.');
  }
  if (images.length > 5 || images.some(function (url) {
    return typeof url !== 'string' || !/^https:\/\//i.test(url);
  })) {
    fail_('SEEDS_UNAVAILABLE', 'Una semilla contiene una lista de imágenes no válida.');
  }
  return images;
}

function seedCoordinates_(value) {
  let locations;
  try {
    locations = typeof value === 'string' ? JSON.parse(value || '[]') : value;
  } catch (err) {
    fail_('SEEDS_UNAVAILABLE', 'Una semilla contiene coordenadas no válidas.');
  }
  if (!Array.isArray(locations)) {
    fail_('SEEDS_UNAVAILABLE', 'Una semilla contiene coordenadas no válidas.');
  }
  if (locations.length > 3) {
    fail_('SEEDS_UNAVAILABLE', 'Una semilla contiene coordenadas no válidas.');
  }
  return locations.slice(0, 3).map(function (location) {
    if (!location || typeof location !== 'object' || Array.isArray(location) ||
        typeof location.titulo !== 'string' || !location.titulo.trim() ||
        !['x', 'y', 'z'].every(function (axis) {
          const value = String(location[axis] === undefined || location[axis] === null
            ? '' : location[axis]).trim();
          return /^-?\d{1,8}$/.test(value) &&
            Number.isSafeInteger(Number(value)) && Math.abs(Number(value)) <= 30000000;
        })) {
      fail_('SEEDS_UNAVAILABLE', 'Una semilla contiene coordenadas no válidas.');
    }
    return {
      titulo: String(location.titulo).slice(0, 80),
      x: String(location.x).trim(),
      y: String(location.y).trim(),
      z: String(location.z).trim()
    };
  });
}

function seedPublicRecord_(record) {
  return {
    id: record.SeedId,
    fecha: record.Fecha,
    titulo: record.Titulo,
    semilla: record.Semilla,
    version: record.Version,
    descripcion: record.Descripcion,
    imagenes: seedImages_(record.Imagenes),
    coordenadas: seedCoordinates_(record.Coordenadas)
  };
}

function getSeeds_(req) {
  const q = addonsCleanSearch_(req.q);
  const limit = Math.min(RS.SEEDS_MAX_PAGE_SIZE,
    Math.max(1, parseInt(req.limit, 10) || RS.SEEDS_PAGE_SIZE));
  const offset = Math.min(500000, Math.max(0, parseInt(req.offset, 10) || 0));
  const rows = readSeedRows_().filter(function (record) {
    return !q || (record.Titulo + ' ' + record.Semilla + ' ' + record.Version + ' ' +
      record.Descripcion).toLowerCase().indexOf(q) !== -1;
  }).sort(function (left, right) {
    return (toDateMs_(right.Fecha) || 0) - (toDateMs_(left.Fecha) || 0);
  });
  const page = rows.slice(offset, offset + limit + 1);
  return {
    semillas: page.slice(0, limit).map(seedPublicRecord_),
    offset: offset,
    limit: limit,
    hasMore: page.length > limit,
    nextOffset: offset + Math.min(limit, page.length)
  };
}

function requireSeedManager_(req, action) {
  const me = actorForRequest_(req);
  const raw = String(PropertiesService.getScriptProperties()
    .getProperty('PRIZ_SEED_ADMIN_GUESTS') || '');
  const allowed = raw.split(',').map(function (id) { return id.trim(); }).filter(Boolean);
  if (!allowed.length || allowed.indexOf(me.UserId) === -1) {
    fail_('FORBIDDEN', 'Este dispositivo no tiene permiso para administrar semillas.');
  }
  enforceRateLimit_('semillas:' + action + ':' + me.UserId, 30, 60,
    'Has realizado demasiadas acciones con semillas. Espera un momento.');
  return me;
}

function validateSeedInput_(req) {
  const titulo = str_(req.titulo, 'El título de la semilla', 1, 120);
  if (typeof req.semilla !== 'string' || !req.semilla.trim()) {
    fail_('VALIDATION', 'La semilla es obligatoria.');
  }
  const semilla = req.semilla;
  if (semilla.length > 128) fail_('VALIDATION', 'La semilla supera 128 caracteres.');
  if (/[\u0000-\u001F\u007F]/.test(semilla)) {
    fail_('VALIDATION', 'La semilla no puede contener caracteres de control.');
  }
  const version = str_(req.version, 'La versión', 1, 40);
  if (typeof req.descripcion !== 'string') {
    fail_('VALIDATION', 'La descripción es obligatoria.');
  }
  const descripcion = cleanText_(req.descripcion).trim();
  if (!descripcion) fail_('VALIDATION', 'La descripción es obligatoria.');
  if (descripcion.length > 5000) {
    fail_('VALIDATION', 'La descripción supera 5000 caracteres.');
  }
  assertAllowedText_(titulo, 'el título de la semilla');
  assertAllowedText_(descripcion, 'la descripción de la semilla');
  const rawLocations = req.coordenadas;
  if (!Array.isArray(rawLocations) || rawLocations.length > 3) {
    fail_('VALIDATION', 'Agrega hasta 3 ubicaciones con coordenadas.');
  }
  const coordenadas = rawLocations.map(function (location, index) {
    if (!location || typeof location !== 'object' || Array.isArray(location)) {
      fail_('VALIDATION', 'La ubicación ' + (index + 1) + ' no es válida.');
    }
    const nombre = str_(location.titulo, 'El título de la ubicación', 1, 80);
    assertAllowedText_(nombre, 'el título de la ubicación');
    const result = { titulo: nombre };
    ['x', 'y', 'z'].forEach(function (axis) {
      const value = String(location[axis] === undefined ? '' : location[axis]).trim();
      if (!/^-?\d{1,8}$/.test(value) || !Number.isSafeInteger(Number(value)) ||
          Math.abs(Number(value)) > 30000000) {
        fail_('VALIDATION', 'La coordenada ' + axis.toUpperCase() +
          ' de la ubicación ' + (index + 1) + ' no es válida.');
      }
      result[axis] = value;
    });
    return result;
  });
  if (!Array.isArray(req.imagenes) || req.imagenes.length > 5) {
    fail_('VALIDATION', 'Agrega hasta 5 imágenes para la semilla.');
  }
  return {
    titulo: titulo,
    semilla: semilla,
    version: version,
    descripcion: descripcion,
    coordenadas: coordenadas,
    imagenes: req.imagenes
  };
}

function saveSeedImages_(images, previousUrls, seedId) {
  const retained = [];
  const created = [];
  const existing = Object.create(null);
  (previousUrls || []).forEach(function (url) { existing[url] = true; });
  try {
    images.forEach(function (item) {
      if (typeof item !== 'string') fail_('BAD_IMAGE', 'Una imagen de semilla no es válida.');
      if (/^https:\/\//i.test(item)) {
        if (!existing[item]) fail_('BAD_IMAGE', 'No se puede conservar una imagen ajena a esta semilla.');
        retained.push(item);
        return;
      }
      const validated = validateImageData_(item);
      const folder = getChildFolder_(getRootFolder_(), 'semillas');
      const url = saveValidatedImage_(validated, folder, seedId + '_imagen_' + (retained.length + 1));
      created.push(url);
      retained.push(url);
    });
    if (retained.length > 5) fail_('VALIDATION', 'Agrega hasta 5 imágenes para la semilla.');
    return { urls: retained, created: created };
  } catch (err) {
    created.forEach(deleteImage_);
    throw err;
  }
}

function getSeedById_(id) {
  const safeId = String(id || '').trim();
  if (!/^seed_[A-Za-z0-9_-]{8,50}$/.test(safeId)) {
    fail_('VALIDATION', 'Identificador de semilla no válido.');
  }
  const record = readSeedRows_().find(function (item) { return item.SeedId === safeId; });
  if (!record) fail_('NOT_FOUND', 'No se encontró esa semilla.');
  return record;
}

function upsertSeed_(req) {
  const me = requireSeedManager_(req, req.seedId ? 'editar' : 'crear');
  const input = validateSeedInput_(req);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) fail_('BUSY', 'El editor de semillas está ocupado. Inténtalo otra vez.');
  let savedImages = null;
  let committed = false;
  try {
    const sheet = ensureSeedsSheet_();
    const seedId = req.seedId
      ? String(req.seedId).trim()
      : 'seed_' + Utilities.getUuid().replace(/-/g, '');
    const allRecords = readSeedRows_();
    const current = req.seedId ? allRecords.find(function (item) {
      return item.SeedId === seedId;
    }) : null;
    if (req.seedId && !current) fail_('NOT_FOUND', 'No se encontró esa semilla.');
    if (req.seedId && !/^seed_[A-Za-z0-9_-]{8,50}$/.test(seedId)) {
      fail_('VALIDATION', 'Identificador de semilla no válido.');
    }
    const oldImages = current ? seedImages_(current.Imagenes) : [];
    savedImages = saveSeedImages_(input.imagenes, oldImages, seedId);
    const now = nowIso_();
    const row = [
      seedId, current ? current.Fecha : now, safeCell_(input.titulo),
      safeCell_(input.semilla), safeCell_(input.version), safeCell_(input.descripcion),
      JSON.stringify(savedImages.urls), JSON.stringify(input.coordenadas), now
    ];
    const rowNumber = current ? current.__row : sheet.getLastRow() + 1;
    sheet.getRange(rowNumber, 1, 1, row.length).setNumberFormat('@');
    sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
    committed = true;
    invalidateSeedCounts_();
    oldImages.filter(function (url) {
      return savedImages.urls.indexOf(url) === -1;
    }).forEach(deleteImage_);
    logSecurityEvent_(current ? 'semilla_actualizada' : 'semilla_publicada',
      me.UserId, seedId, input.titulo);
    return { semilla: seedPublicRecord_({
      SeedId: seedId, Fecha: current ? current.Fecha : now,
      Titulo: input.titulo, Semilla: input.semilla, Version: input.version,
      Descripcion: input.descripcion, Imagenes: JSON.stringify(savedImages.urls),
      Coordenadas: JSON.stringify(input.coordenadas)
    }) };
  } catch (err) {
    if (savedImages && !committed) savedImages.created.forEach(deleteImage_);
    throw err;
  } finally {
    lock.releaseLock();
  }
}

function deleteSeed_(req) {
  const me = requireSeedManager_(req, 'eliminar');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) fail_('BUSY', 'El editor de semillas está ocupado. Inténtalo otra vez.');
  try {
    const record = getSeedById_(req.seedId);
    const sheet = ensureSeedsSheet_();
    sheet.deleteRow(record.__row);
    invalidateSeedCounts_();
    seedImages_(record.Imagenes).forEach(deleteImage_);
    logSecurityEvent_('semilla_eliminada', me.UserId, record.SeedId, record.Titulo);
    return { eliminado: true, id: record.SeedId };
  } finally {
    lock.releaseLock();
  }
}

function addonsImages_(value) {
  return String(value || '')
    .split('|')
    .map(function (url) { return String(url || '').trim(); })
    .filter(function (url) { return /^https:\/\//i.test(url); })
    .slice(0, 30);
}

function addonsMapListRow_(row) {
  const downloadUrl = String(row[2] || '').trim();
  const images = addonsImages_(row[3]);
  return {
    id: String(row[10] || '').trim(),
    nombre: String(row[1] || '').trim(),
    imagen: images.length ? images[0] : '',
    imagenes: images,
    urlDescarga: /^https?:\/\//i.test(downloadUrl) ? downloadUrl : '',
    descripcion: String(row[9] || '').trim(),
    categoria: String(row[4] || '').trim(),
    likes: parseInt(row[5], 10) || 0,
    descargas: parseInt(row[6], 10) || 0,
    subidoPor: String(row[7] || '').trim(),
    version: String(row[8] || '').trim(),
    fecha: String(row[0] || '').trim()
  };
}

function addonsMapDetailRow_(row) {
  const images = addonsImages_(row[3]);
  const downloadUrl = String(row[2] || '').trim();
  return {
    id: String(row[10] || '').trim(),
    nombre: String(row[1] || '').trim(),
    urlDescarga: /^https?:\/\//i.test(downloadUrl) ? downloadUrl : '',
    imagenes: images,
    categoria: String(row[4] || '').trim(),
    likes: parseInt(row[5], 10) || 0,
    descargas: parseInt(row[6], 10) || 0,
    subidoPor: String(row[7] || '').trim(),
    version: String(row[8] || '').trim(),
    descripcion: String(row[9] || '').trim(),
    fecha: String(row[0] || '').trim()
  };
}

function addonsLikedSet_(userId, ids) {
  const wanted = {};
  ids.forEach(function (id) { wanted[String(id)] = true; });
  const liked = {};
  if (!userId || !ids.length) return liked;
  readRecords_('addon_likes').records.forEach(function (record) {
    if (String(record.UserId) === String(userId) && wanted[String(record.AddonId)]) {
      liked[String(record.AddonId)] = true;
    }
  });
  return liked;
}

function addonsFavoriteSet_(userId, ids) {
  const wanted = {};
  ids.forEach(function (id) { wanted[String(id)] = true; });
  const favorites = {};
  if (!userId || !ids.length) return favorites;
  readRecords_('addon_favorites').records.forEach(function (record) {
    if (String(record.UserId) === String(userId) && wanted[String(record.AddonId)]) {
      favorites[String(record.AddonId)] = true;
    }
  });
  return favorites;
}

function getAddonCollections_(req) {
  const me = actorForRequest_(req);
  if (!me) return { favoritos: [], colecciones: [] };
  const records = readRecords_('addon_collections').records.filter(function (item) {
    return String(item.UserId) === String(me.UserId);
  });
  const items = readRecords_('addon_collection_items').records;
  return {
    favoritos: readRecords_('addon_favorites').records
      .filter(function (item) { return String(item.UserId) === String(me.UserId); })
      .map(function (item) { return String(item.AddonId); }),
    colecciones: records.map(function (collection) {
      return {
        id: collection.CollectionId,
        nombre: collection.Nombre,
        addonIds: items.filter(function (item) {
          return String(item.CollectionId) === String(collection.CollectionId);
        }).map(function (item) { return String(item.AddonId); })
      };
    })
  };
}

function toggleAddonFavorite_(req) {
  const me = actorForRequest_(req);
  enforceRateLimit_('addon-favorito:' + me.UserId, 120, 3600, 'Has cambiado demasiadas veces tus favoritos.');
  const id = addonsCleanId_(req.id);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) fail_('RATE_LIMIT', 'Hay otra operación en curso. Inténtalo de nuevo.');
  try {
    const existing = readRecords_('addon_favorites').records.find(function (item) {
      return String(item.UserId) === String(me.UserId) && String(item.AddonId) === id;
    });
    if (existing) {
      deleteRows_('addon_favorites', [existing.__row]);
      return { favorito: false };
    }
    appendRecord_('addon_favorites', { UserId: me.UserId, AddonId: id, Fecha: nowIso_() });
    return { favorito: true };
  } finally {
    lock.releaseLock();
  }
}

function createAddonCollection_(req) {
  const me = actorForRequest_(req);
  enforceRateLimit_('addon-coleccion:' + me.UserId, 30, 3600, 'Has realizado demasiados cambios en tus colecciones.');
  const name = str_(req.nombre, 'Nombre de colección', 1, 40);
  assertAllowedText_(name, 'el nombre de la colección');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) fail_('RATE_LIMIT', 'Hay otra operación en curso. Inténtalo de nuevo.');
  try {
    const collections = readRecords_('addon_collections').records.filter(function (item) {
      return String(item.UserId) === String(me.UserId);
    });
    if (collections.length >= 20) fail_('VALIDATION', 'Cada dispositivo puede tener hasta 20 colecciones');
    if (collections.some(function (item) { return String(item.Nombre).toLowerCase() === name.toLowerCase(); })) {
      fail_('VALIDATION', 'Ya tienes una colección con ese nombre');
    }
    const record = {
      CollectionId: makeId_('ac', 14),
      UserId: me.UserId,
      Nombre: name,
      FechaCreacion: nowIso_(),
      FechaActualizacion: nowIso_()
    };
    appendRecord_('addon_collections', record);
    return { coleccion: { id: record.CollectionId, nombre: record.Nombre, addonIds: [] } };
  } finally {
    lock.releaseLock();
  }
}

function renameAddonCollection_(req) {
  const me = actorForRequest_(req);
  enforceRateLimit_('addon-coleccion-editar:' + me.UserId, 60, 3600, 'Has realizado demasiados cambios en tus colecciones.');
  const id = String(req.collectionId || '').trim();
  const name = str_(req.nombre, 'Nombre de colección', 1, 40);
  assertAllowedText_(name, 'el nombre de la colección');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) fail_('RATE_LIMIT', 'Hay otra operación en curso. Inténtalo de nuevo.');
  try {
    const collections = readRecords_('addon_collections').records;
    const record = collections.find(function (item) {
      return String(item.CollectionId) === id && String(item.UserId) === String(me.UserId);
    });
    if (!record) fail_('NOT_FOUND', 'Colección no encontrada');
    const duplicate = collections.some(function (item) {
      return String(item.UserId) === String(me.UserId) &&
        String(item.CollectionId) !== id &&
        String(item.Nombre).toLowerCase() === name.toLowerCase();
    });
    if (duplicate) fail_('VALIDATION', 'Ya tienes una colección con ese nombre');
    updateRecord_('addon_collections', record.__row, {
      Nombre: name,
      FechaActualizacion: nowIso_()
    });
    return { id: id, nombre: name };
  } finally {
    lock.releaseLock();
  }
}

function deleteAddonCollection_(req) {
  const me = actorForRequest_(req);
  enforceRateLimit_('addon-coleccion-eliminar:' + me.UserId, 20, 3600, 'Has eliminado demasiadas colecciones.');
  const id = String(req.collectionId || '').trim();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) fail_('RATE_LIMIT', 'Hay otra operación en curso. Inténtalo de nuevo.');
  try {
    const record = readRecords_('addon_collections').records.find(function (item) {
      return String(item.CollectionId) === id && String(item.UserId) === String(me.UserId);
    });
    if (!record) fail_('NOT_FOUND', 'Colección no encontrada');
    deleteWhere_('addon_collection_items', function (item) {
      return String(item.CollectionId) === id;
    });
    deleteRows_('addon_collections', [record.__row]);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function toggleAddonCollectionItem_(req) {
  const me = actorForRequest_(req);
  enforceRateLimit_('addon-coleccion-items:' + me.UserId, 120, 3600, 'Has realizado demasiados cambios en tus colecciones.');
  const collectionId = String(req.collectionId || '').trim();
  const addonId = addonsCleanId_(req.id);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) fail_('RATE_LIMIT', 'Hay otra operación en curso. Inténtalo de nuevo.');
  try {
    const collection = readRecords_('addon_collections').records.find(function (item) {
      return String(item.CollectionId) === collectionId &&
        String(item.UserId) === String(me.UserId);
    });
    if (!collection) fail_('NOT_FOUND', 'Colección no encontrada');
    const existing = readRecords_('addon_collection_items').records.find(function (item) {
      return String(item.CollectionId) === collectionId && String(item.AddonId) === addonId;
    });
    if (existing) {
      deleteRows_('addon_collection_items', [existing.__row]);
      return { agregado: false };
    }
    appendRecord_('addon_collection_items', {
      CollectionId: collectionId,
      AddonId: addonId,
      Fecha: nowIso_()
    });
    return { agregado: true };
  } finally {
    lock.releaseLock();
  }
}

function addonsDetailQuery_(id, fields) {
  return 'select ' + fields + " where L = '" + id + "' limit 1";
}

function getAddons_(req) {
  const me = actorForRequest_(req);
  const userId = me ? me.UserId : '';
  if (me) {
    enforceRateLimit_('addons-listar:' + userId, 90, 60, 'Estás buscando complementos demasiado rápido. Espera un momento.');
  }

  const q = addonsCleanSearch_(req.q);
  const sort = String(req.sort || 'populares').trim().toLowerCase();
  const categoryClause = addonsCategoryClause_(req.category);
  const limit = Math.min(
    RS.ADDONS_MAX_PAGE_SIZE,
    Math.max(1, parseInt(req.limit, 10) || RS.ADDONS_PAGE_SIZE)
  );
  const offset = Math.min(500000, Math.max(0, parseInt(req.offset, 10) || 0));
  const order = addonsOrderClause_(sort);
  const fields = 'A,B,D,E,F,G,I,J,L';
  let scope = String(req.scope || 'all').trim().toLowerCase();
  if (['all', 'favorites', 'collection'].indexOf(scope) < 0) {
    fail_('VALIDATION', 'Filtro de complementos no válido');
  }
  if (!me) scope = 'all';
  let scopeIds = null;
  if (scope === 'favorites') {
    scopeIds = readRecords_('addon_favorites').records
      .filter(function (item) { return String(item.UserId) === String(userId); })
      .map(function (item) { return String(item.AddonId); });
  } else if (scope === 'collection') {
    const collectionId = String(req.collectionId || '').trim();
    const collection = readRecords_('addon_collections').records.find(function (item) {
      return String(item.CollectionId) === collectionId &&
        String(item.UserId) === String(userId);
    });
    if (!collection) fail_('NOT_FOUND', 'Colección no encontrada');
    scopeIds = readRecords_('addon_collection_items').records
      .filter(function (item) { return String(item.CollectionId) === collectionId; })
      .map(function (item) { return String(item.AddonId); });
  }
  if (scopeIds) {
    const seenIds = Object.create(null);
    scopeIds = scopeIds.filter(function (id) {
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || seenIds[id]) return false;
      seenIds[id] = true;
      return true;
    });
  }
  const pageScopeIds = scopeIds ? scopeIds.slice(offset, offset + limit + 1) : null;
  let rows = [];
  let fallback = false;

  if (pageScopeIds && !pageScopeIds.length) {
    rows = [];
  } else {
    const scopeClause = pageScopeIds
      ? "L matches '^(" + pageScopeIds.join('|') + ")$'"
      : '';
    const browseClause = [scopeClause, categoryClause].filter(Boolean).join(' and ');
    if (q) {
      const prefix = [browseClause, "lower(B) starts with '" + q + "'"]
        .filter(Boolean).join(' and ');
      const searchClause = [browseClause,
        "(lower(B) contains '" + q + "' or lower(E) contains '" + q + "')"]
        .filter(Boolean).join(' and ');
      if (offset === 0) {
        rows = addonsFetchRows_(
          'select ' + fields + ' where ' + prefix + ' order by ' + order +
          ' limit ' + (limit + 1)
        );
        if (!rows.length) {
          fallback = true;
          rows = addonsFetchRows_(
            'select ' + fields + ' where ' + searchClause + ' order by ' + order +
            ' limit ' + (limit + 1)
          );
        }
      } else {
        if (pageScopeIds) {
          rows = addonsFetchRows_(
            'select ' + fields + ' where ' + prefix + ' order by ' + order +
            ' limit ' + (limit + 1)
          );
          if (!rows.length) {
            fallback = true;
            rows = addonsFetchRows_(
              'select ' + fields + ' where ' + searchClause + ' order by ' + order +
              ' limit ' + (limit + 1)
            );
          }
        } else {
          rows = addonsFetchRows_(
            'select ' + fields + ' where ' + prefix + ' order by ' + order +
            ' limit ' + (limit + 1) + ' offset ' + offset
          );
          if (!rows.length) {
            fallback = true;
            rows = addonsFetchRows_(
              'select ' + fields + ' where ' + searchClause + ' order by ' + order +
              ' limit ' + (limit + 1) + ' offset ' + offset
            );
          }
        }
      }
    } else {
      rows = addonsFetchRows_(
        'select ' + fields + ' where ' +
        [browseClause, 'B is not null'].filter(Boolean).join(' and ') +
        ' order by ' + order +
        ' limit ' + (limit + 1) + (pageScopeIds || !offset ? '' : ' offset ' + offset)
      );
    }
  }

  const hasMore = pageScopeIds
    ? offset + Math.min(limit, pageScopeIds.length) < scopeIds.length
    : rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const addons = pageRows.map(addonsMapListRow_).filter(function (addon) {
    return !!addon.id && !!addon.nombre;
  });
  const liked = addonsLikedSet_(userId, addons.map(function (addon) { return addon.id; }));
  const favorites = addonsFavoriteSet_(userId, addons.map(function (addon) { return addon.id; }));
  addons.forEach(function (addon) {
    addon.meGusta = !!liked[addon.id];
    addon.favorito = !!favorites[addon.id];
  });

  return {
    addons: addons,
    offset: offset,
    limit: limit,
    hasMore: hasMore,
    nextOffset: pageScopeIds
      ? offset + Math.min(limit, pageScopeIds.length)
      : offset + pageRows.length,
    q: q,
    sort: sort,
    fallback: fallback,
    scope: scope
  };
}

function addonTextHash_(text) {
  const raw = String(text || '');
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function addonNeedsTranslation_(text, target) {
  const raw = String(text || '').trim();
  if (!raw) return false;
  try {
    const detected = String(LanguageApp.detectLanguage(raw.slice(0, 500)) || '')
      .slice(0, 2).toLowerCase();
    if (!detected) return true;
    return detected !== target;
  } catch (e) {
    return true;
  }
}

function translateAddonText_(text, to) {
  const raw = String(text || '');
  if (!raw.trim()) return '';
  const target = to === 'en' ? 'en' : 'es';
  const fallbackSource = target === 'en' ? 'es' : 'en';
  let translated = '';
  for (let i = 0; i < raw.length; i += 4500) {
    const chunk = raw.slice(i, i + 4500);
    try {
      translated += LanguageApp.translate(chunk, '', target) || chunk;
    } catch (e) {
      try {
        translated += LanguageApp.translate(chunk, fallbackSource, target) || chunk;
      } catch (e2) {
        console.error('No se pudo traducir la descripción del addon: ' + e2);
        translated += chunk;
      }
    }
  }
  return translated;
}

function addonTranslatedDescription_(id, text, to) {
  const target = to === 'en' ? 'en' : 'es';
  const raw = String(text || '');
  if (!raw.trim()) return '';
  // El hash evita servir una traducción antigua si el addon cambió de descripción.
  const key = ('wl_addon_tr_v2_' + target + '_' + id + '_' + addonTextHash_(raw)).slice(0, 240);
  try {
    const cache = CacheService.getScriptCache();
    const cached = cache.get(key);
    if (cached) return cached;
    const translated = translateAddonText_(raw, target);
    cache.put(key, translated, RS.ADDONS_TRANSLATION_CACHE_SECONDS);
    return translated;
  } catch (e) {
    console.error('Caché de traducción de addon no disponible: ' + e);
    return translateAddonText_(raw, target);
  }
}

/**
 * Traduce una descripción arbitraria (la usan los addons del Marketplace,
 * cuyo texto original vive en PlayFab y no en la hoja de cálculo).
 */
function translateDescription_(req) {
  const text = String(req.text || '');
  if (!text.trim()) return { texto: '', traducido: false };
  if (text.length > 8000) fail_('VALIDATION', 'La descripción es demasiado larga');
  const target = req.to === 'en' ? 'en' : 'es';
  const translated = addonTranslatedDescription_('text-' + addonTextHash_(text), text, target);
  return {
    texto: translated,
    traducido: translated !== text,
    lang: target
  };
}

function getAddon_(req) {
  const me = actorForRequest_(req);
  const userId = me ? me.UserId : '';
  if (me) {
    enforceRateLimit_('addons-detalle:' + userId, 90, 60, 'Estás abriendo complementos demasiado rápido. Espera un momento.');
  }
  const id = addonsCleanId_(req.id);
  const rows = addonsFetchRows_(addonsDetailQuery_(id, 'A,B,C,D,E,F,G,I,J,K,L'));
  if (!rows.length) fail_('NOT_FOUND', 'Complemento no encontrado');

  const addon = addonsMapDetailRow_(rows[0]);
  if (!addon.id) fail_('NOT_FOUND', 'Complemento no encontrado');
  const original = addon.descripcion;
  const lang = req.lang === 'en' ? 'en' : 'es';
  addon.descripcionOriginal = original;
  addon.descripcionLang = lang;
  addon.descripcion = addonNeedsTranslation_(original, lang)
    ? addonTranslatedDescription_(addon.id, original, lang)
    : original;
  addon.descripcionTraducida = addon.descripcion !== original;
  addon.meGusta = !!addonsLikedSet_(userId, [addon.id])[addon.id];
  addon.favorito = !!addonsFavoriteSet_(userId, [addon.id])[addon.id];
  return { addon: addon };
}

function addonsCounts_(id) {
  const rows = addonsFetchRows_(addonsDetailQuery_(id, 'F,G'));
  if (!rows.length) fail_('NOT_FOUND', 'Complemento no encontrado');
  return {
    likes: parseInt(rows[0][0], 10) || 0,
    descargas: parseInt(rows[0][1], 10) || 0
  };
}

function addonsIncrementCounter_(id, action, field) {
  const separator = RS.ADDONS_ACTION_URL.indexOf('?') >= 0 ? '&' : '?';
  const url = RS.ADDONS_ACTION_URL + separator +
    'action=' + encodeURIComponent(action) +
    '&id=' + encodeURIComponent(id);
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const code = response.getResponseCode();
  const body = response.getContentText();
  if (code < 200 || code >= 300) {
    console.error('Addons action HTTP ' + code + ': ' + String(body).slice(0, 300));
    fail_('ADDON_ACTION_FAILED', 'No se pudo registrar la acción del complemento');
  }
  let data;
  try { data = JSON.parse(body); }
  catch (e) {
    console.error('Addons action respuesta inválida: ' + String(body).slice(0, 300));
    fail_('ADDON_ACTION_FAILED', 'La fuente del catálogo devolvió una respuesta inválida');
  }
  if (!data || !data.ok) {
    fail_('ADDON_ACTION_FAILED', 'No se pudo registrar la acción del complemento');
  }
  const value = parseInt(data[field], 10);
  return isNaN(value) ? null : value;
}

function darLikeAddon_(req) {
  const me = actorForRequest_(req);
  enforceRateLimit_('addon-like:' + me.UserId, 60, 3600, 'Has dado me gusta demasiadas veces. Espera un momento.');
  const id = addonsCleanId_(req.id);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    fail_('RATE_LIMIT', 'Hay otra acción en curso. Inténtalo de nuevo en unos segundos.');
  }

  try {
    const existing = readRecords_('addon_likes').records.find(function (record) {
      return String(record.UserId) === String(me.UserId) &&
        String(record.AddonId) === String(id);
    });
    if (existing) {
      let likes = null;
      try {
        likes = addonsCounts_(id).likes;
      } catch (e) {
        console.error('No se pudo leer el contador de likes del addon: ' + e);
      }
      return { meGusta: true, likes: likes, yaRegistrado: true };
    }

    const likes = addonsIncrementCounter_(id, 'incrementLikeById', 'likes');
    try {
      appendRecord_('addon_likes', {
        UserId: me.UserId,
        AddonId: id,
        Fecha: nowIso_()
      });
    } catch (e) {
      console.error('No se pudo guardar el me gusta del addon: ' + e);
    }
    return { meGusta: true, likes: likes === null ? null : likes, yaRegistrado: false };
  } finally {
    lock.releaseLock();
  }
}

function descargarAddon_(req) {
  const me = actorForRequest_(req);
  if (me) {
    enforceRateLimit_('addon-descargar:' + me.UserId, 120, 3600, 'Has descargado complementos demasiadas veces. Espera un momento.');
  }
  const id = addonsCleanId_(req.id);
  const descargas = addonsIncrementCounter_(id, 'incrementDownloadsById', 'downloads');
  return { descargas: descargas === null ? null : descargas };
}

/**
 * Devuelve el archivo de un addon en base64 para que el navegador pueda
 * mostrar progreso real y guardarlo como blob (evita el CORS de los CDNs).
 * Solo se permite descargar la URL que figura en la hoja para ese ID.
 */
function downloadFile_(req) {
  const id = addonsCleanId_(req.id);
  const url = String(req.url || '').trim();
  if (!/^https:\/\//i.test(url)) fail_('VALIDATION', 'Enlace de descarga no válido');

  const detail = getAddon_({ id: id, guestId: req.guestId });
  const addon = detail.addon || {};
  const allowed = String(addon.urlDescarga || '').trim();
  if (!allowed || allowed !== url) fail_('FORBIDDEN', 'Enlace de descarga no autorizado');

  const res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: false,
    followRedirects: true
  });
  const bytes = res.getContent();
  if (!bytes || !bytes.length) fail_('NOT_FOUND', 'El archivo está vacío');
  if (bytes.length > 8 * 1024 * 1024) {
    fail_('TOO_LARGE', 'El archivo es demasiado grande para el proxy; usa el enlace directo');
  }

  const cleanPath = url.split('?')[0].split('#')[0];
  let name = '';
  try {
    name = decodeURIComponent(cleanPath.split('/').pop() || '');
  } catch (err) {
    name = cleanPath.split('/').pop() || '';
  }
  name = name || String(addon.nombre || 'archivo').replace(/[^\w.\-() ]+/g, '_') + '.zip';

  return {
    filename: name,
    mime: res.getContentType() || 'application/octet-stream',
    base64: Utilities.base64Encode(bytes)
  };
}

// ══════════════════════════════════════════════════════════════════════════════
//  SERVIDORES BEDROCK
// ══════════════════════════════════════════════════════════════════════════════

function serverAddress_(hostValue, portValue) {
  const host = String(hostValue || '').trim().toLowerCase().replace(/\.$/, '');
  const rawPort = String(portValue === undefined || portValue === null ? '' : portValue).trim();
  const port = /^\d{1,5}$/.test(rawPort) ? Number(rawPort) : NaN;
  if (!host || host.length > 253 || !/^[a-z0-9.-]+$/.test(host) ||
      host.indexOf('..') >= 0 || host.indexOf('/') >= 0 ||
      host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    fail_('VALIDATION', 'Escribe una IP o dominio válido, sin protocolo ni puerto');
  }
  if (host.split('.').some(function (label) {
    return !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label);
  })) {
    fail_('VALIDATION', 'El dominio o la IP no tiene un formato válido');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail_('VALIDATION', 'El puerto debe estar entre 1 y 65535');
  }
  const ip = host.split('.');
  if (ip.length === 4 && ip.every(function (part) { return /^\d{1,3}$/.test(part) && Number(part) <= 255; })) {
    const first = Number(ip[0]);
    const second = Number(ip[1]);
    if (first === 0 || first === 10 || first === 127 || first >= 224 ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168)) {
      fail_('VALIDATION', 'No se permiten direcciones IP privadas o locales');
    }
  } else if (ip.every(function (part) { return /^\d+$/.test(part); })) {
    fail_('VALIDATION', 'La dirección IPv4 no es válida');
  }
  return { host: host, port: port, key: host + ':' + port };
}

function fetchBedrockStatus_(address, requirePlayers) {
  let response;
  try {
    response = UrlFetchApp.fetch(
      RS.SERVER_STATUS_URL + encodeURIComponent(address.host + ':' + address.port),
      { muteHttpExceptions: true, headers: { Accept: 'application/json' } }
    );
  } catch (err) {
    console.error('Error al consultar el estado Bedrock: ' + err);
    fail_('SERVER_STATUS_UNAVAILABLE', 'No se pudo consultar mcsrvstat.us. Inténtalo más tarde.');
  }
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    console.error('mcsrvstat.us respondió HTTP ' + status);
    fail_('SERVER_STATUS_UNAVAILABLE', 'El servicio de estado de servidores no está disponible.');
  }
  let data;
  try {
    data = JSON.parse(response.getContentText());
  } catch (err) {
    fail_('SERVER_STATUS_UNAVAILABLE', 'El servicio de estado devolvió una respuesta no válida.');
  }
  if (!data || data.online !== true) {
    if (requirePlayers) fail_('SERVER_OFFLINE', 'El servidor debe estar activo para poder agregarlo.');
    return { online: false, playersOnline: '', playersMax: '', version: '', motd: '' };
  }
  const players = data.players || {};
  const onlineValue = players.online;
  const maxValue = players.max;
  const hasNumericValue = function (value) {
    return typeof value === 'number'
      ? Number.isFinite(value) && Number.isInteger(value)
      : typeof value === 'string' && /^\d+$/.test(value);
  };
  const playersOnline = hasNumericValue(onlineValue) ? Number(onlineValue) : NaN;
  const playersMax = hasNumericValue(maxValue) ? Number(maxValue) : NaN;
  const hasPlayers = Number.isInteger(playersOnline) &&
    Number.isInteger(playersMax) && playersOnline >= 0 && playersMax >= playersOnline;
  if (requirePlayers && !hasPlayers) {
    fail_('SERVER_NO_PLAYER_DATA', 'mcsrvstat.us no devolvió los datos de jugadores necesarios para agregar este servidor.');
  }
  const motd = data.motd && Array.isArray(data.motd.clean)
    ? data.motd.clean.join('\n').slice(0, 500)
    : '';
  return {
    online: true,
    playersOnline: hasPlayers ? playersOnline : '',
    playersMax: hasPlayers ? playersMax : '',
    version: String(data.version || '').slice(0, 120),
    motd: motd
  };
}

function serverPublicRecord_(record, users, viewerId) {
  const owner = users[String(record.UserId)] || {};
  return {
    id: record.ServerId,
    userId: record.UserId,
    nombre: record.Nombre,
    host: record.Host,
    port: Number(record.Port),
    imagen: record.Imagen || '',
    fecha: record.FechaCreacion,
    online: String(record.Online).toLowerCase() === 'true',
    jugadores: record.PlayersOnline === '' ? null : Number(record.PlayersOnline),
    maxJugadores: record.PlayersMax === '' ? null : Number(record.PlayersMax),
    version: record.Version || '',
    motd: record.Motd || '',
    actualizado: record.LastChecked || '',
    autor: {
      userId: owner.UserId || record.UserId,
      nombre: owner.Nombre || 'invitado',
      nombreMostrado: owner.NombreMostrado || owner.Nombre || 'Invitado',
      fotoPerfil: owner.FotoPerfil || ''
    },
    esMio: String(record.UserId) === String(viewerId || '')
  };
}

function rsGetServers_(req) {
  const me = actorForRequest_(req);
  const users = {};
  users[String(me.UserId)] = me;
  const servers = readRecords_('servidores').records
    .sort(function (a, b) { return toDateMs_(b.FechaCreacion) - toDateMs_(a.FechaCreacion); })
    .map(function (server) { return serverPublicRecord_(server, users, me.UserId); });
  return {
    servidores: servers,
    puedeAgregar: !servers.some(function (server) { return server.esMio; })
  };
}

function rsCreateServer_(req) {
  const me = actorForRequest_(req);
  enforceRateLimit_('servidor-agregar:' + me.UserId, 3, 3600, 'Has intentado agregar servidores demasiadas veces.');
  const name = str_(req.nombre, 'Nombre del servidor', 2, 60);
  assertAllowedText_(name, 'el nombre del servidor');
  const address = serverAddress_(req.host, req.port);
  const imageInput = String(req.imagen || '');
  const validatedImage = imageInput ? validateImageData_(imageInput) : null;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) fail_('RATE_LIMIT', 'Hay otra operación en curso. Inténtalo de nuevo.');
  let imageUrl = '';
  try {
    if (readRecords_('servidores').records.some(function (server) {
      return String(server.UserId) === String(me.UserId);
    })) {
      fail_('SERVER_LIMIT', 'Cada dispositivo puede agregar un solo servidor.');
    }
    if (readRecords_('servidores').records.some(function (server) {
      return String(server.Host).toLowerCase() + ':' + String(server.Port) === address.key;
    })) {
      fail_('SERVER_DUPLICATE', 'Ese servidor ya fue agregado.');
    }
    const status = fetchBedrockStatus_(address, false);
    const serverFolder = getChildFolder_(getGuestFolder_(me.UserId), 'servidores');
    if (validatedImage) imageUrl = saveValidatedImage_(validatedImage, serverFolder, 'servidor');
    const record = {
      ServerId: makeId_('sv', 14),
      UserId: me.UserId,
      Nombre: name,
      Host: address.host,
      Port: address.port,
      Imagen: imageUrl,
      FechaCreacion: nowIso_(),
      Online: status.online,
      PlayersOnline: status.playersOnline,
      PlayersMax: status.playersMax,
      Version: status.version,
      Motd: status.motd,
      LastChecked: nowIso_(),
      InactiveSince: status.online ? '' : nowIso_()
    };
    try {
      appendRecord_('servidores', record);
    } catch (err) {
      if (imageUrl) deleteImage_(imageUrl);
      throw err;
    }
    const users = {};
    users[String(me.UserId)] = me;
    return { servidor: serverPublicRecord_(record, users, me.UserId) };
  } finally {
    lock.releaseLock();
  }
}

function rsUpdateServer_(req) {
  const me = actorForRequest_(req);
  enforceRateLimit_('servidor-editar:' + me.UserId, 20, 3600, 'Has editado servidores demasiadas veces.');
  const serverId = String(req.serverId || '').trim();
  const name = str_(req.nombre, 'Nombre del servidor', 2, 60);
  assertAllowedText_(name, 'el nombre del servidor');
  const imageInput = req.imagen === undefined ? null : String(req.imagen || '');
  const validatedImage = imageInput && imageInput.indexOf('data:image/') === 0
    ? validateImageData_(imageInput)
    : null;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) fail_('RATE_LIMIT', 'Hay otra operación en curso. Inténtalo de nuevo.');
  let newImageUrl = '';
  try {
    const server = readRecords_('servidores').records.find(function (item) {
      return String(item.ServerId) === serverId;
    });
    if (!server) fail_('NOT_FOUND', 'Servidor no encontrado');
    if (String(server.UserId) !== String(me.UserId)) {
      fail_('FORBIDDEN', 'Solo puedes editar tu servidor');
    }
    if (imageInput !== null && !validatedImage && imageInput !== '' &&
        imageInput !== String(server.Imagen || '')) {
      fail_('BAD_IMAGE', 'La imagen del servidor no es válida');
    }

    const address = serverAddress_(
      req.host === undefined ? server.Host : req.host,
      req.port === undefined ? server.Port : req.port
    );
    const previousAddress = serverAddress_(server.Host, server.Port);
    const changes = { Nombre: name };
    if (address.key !== previousAddress.key) {
      const duplicate = readRecords_('servidores').records.some(function (item) {
        return String(item.ServerId) !== serverId &&
          String(item.Host || '').toLowerCase().replace(/\.$/, '') + ':' + String(item.Port) === address.key;
      });
      if (duplicate) fail_('SERVER_DUPLICATE', 'Ese servidor ya fue agregado.');
      const status = fetchBedrockStatus_(address, false);
      changes.Host = address.host;
      changes.Port = address.port;
      changes.Online = status.online;
      changes.PlayersOnline = status.playersOnline;
      changes.PlayersMax = status.playersMax;
      changes.Version = status.version;
      changes.Motd = status.motd;
      changes.LastChecked = nowIso_();
      changes.InactiveSince = status.online ? '' : nowIso_();
    }
    if (validatedImage) {
      const folder = getChildFolder_(getGuestFolder_(me.UserId), 'servidores');
      newImageUrl = saveValidatedImage_(validatedImage, folder, 'servidor');
      changes.Imagen = newImageUrl;
    } else if (imageInput !== null) {
      if (imageInput === '') {
        changes.Imagen = '';
      } else if (imageInput === String(server.Imagen || '')) {
        changes.Imagen = server.Imagen;
      } else {
        fail_('BAD_IMAGE', 'La imagen del servidor no es válida');
      }
    }
    updateRecord_('servidores', server.__row, changes);
    if (changes.Imagen !== undefined && String(server.Imagen || '') &&
        String(server.Imagen || '') !== String(changes.Imagen || '')) {
      deleteImage_(server.Imagen);
    }
  } catch (err) {
    if (newImageUrl) deleteImage_(newImageUrl);
    throw err;
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

function rsDeleteServer_(req) {
  const me = actorForRequest_(req);
  enforceRateLimit_('servidor-eliminar:' + me.UserId, 10, 3600, 'Has eliminado servidores demasiadas veces.');
  const serverId = String(req.serverId || '').trim();
  const server = readRecords_('servidores').records.find(function (item) {
    return String(item.ServerId) === serverId;
  });
  if (!server) fail_('NOT_FOUND', 'Servidor no encontrado');
  if (String(server.UserId) !== String(me.UserId)) {
    fail_('FORBIDDEN', 'No puedes eliminar este servidor');
  }
  deleteRows_('servidores', [server.__row]);
  deleteImage_(server.Imagen);
  return { ok: true };
}

function deleteExpiredOfflineServers_() {
  const cutoff = Date.now() - RS.SERVER_INACTIVE_DAYS * 24 * 60 * 60 * 1000;
  const expired = readRecords_('servidores').records.filter(function (server) {
    if (String(server.Online).toLowerCase() === 'true') return false;
    const inactiveSince = toDateMs_(server.InactiveSince);
    return !!inactiveSince && inactiveSince <= cutoff;
  });
  expired.forEach(function (server) { deleteImage_(server.Imagen); });
  deleteRows_('servidores', expired.map(function (server) { return server.__row; }));
  return expired.length;
}

function actualizarEstadoServidores() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return 'Actualización omitida: ya hay una ejecución en curso.';
  try {
    const deleted = deleteExpiredOfflineServers_();
    const servers = readRecords_('servidores').records;
    if (!servers.length) return 'No hay servidores para actualizar; eliminados por inactividad: ' + deleted + '.';
    const props = PropertiesService.getScriptProperties();
    const start = parseInt(props.getProperty('RS_SERVER_STATUS_CURSOR') || '0', 10) % servers.length;
    const count = Math.min(RS.SERVER_STATUS_BATCH_SIZE, servers.length);
    let updated = 0;
    for (let i = 0; i < count; i++) {
      const server = servers[(start + i) % servers.length];
      try {
        const address = serverAddress_(server.Host, server.Port);
        const status = fetchBedrockStatus_(address, false);
        updateRecord_('servidores', server.__row, {
          Online: status.online,
          PlayersOnline: status.playersOnline,
          PlayersMax: status.playersMax,
          Version: status.version || server.Version || '',
          Motd: status.motd || server.Motd || '',
          LastChecked: nowIso_(),
          InactiveSince: status.online
            ? ''
            : (String(server.Online).toLowerCase() === 'true'
              ? nowIso_()
              : (server.InactiveSince || nowIso_()))
        });
        updated++;
      } catch (err) {
        console.error('No se pudo actualizar servidor ' + server.ServerId + ': ' + err);
      }
    }
    props.setProperty('RS_SERVER_STATUS_CURSOR', String((start + count) % servers.length));
    return 'Servidores consultados: ' + updated + ' de ' + count +
      '; eliminados por inactividad: ' + deleted + '.';
  } finally {
    lock.releaseLock();
  }
}

function instalarActualizacionServidores() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'actualizarEstadoServidores') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger('actualizarEstadoServidores')
    .timeBased()
    .everyMinutes(RS.SERVER_STATUS_TRIGGER_MINUTES)
    .create();
  return 'Actualización del estado de servidores cada ' +
    RS.SERVER_STATUS_TRIGGER_MINUTES + ' minutos.';
}

// ══════════════════════════════════════════════════════════════════════════════
//  MANTENIMIENTO
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Se conserva como punto de entrada por si existiera un activador instalado
 * en una versión anterior del proyecto. Ya no hay datos de cuentas que limpiar.
 */
function limpiarDatosBasura() {
  return 'No hay datos de cuentas que limpiar.';
}

function instalarLimpiezaAutomatica() {
  const obsoletos = [
    'limpiarDatosBasura',
    'limpiarSesionesExpiradas',
    'limpiarRecuperacionesViejas'
  ];
  let eliminados = 0;
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (obsoletos.indexOf(trigger.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(trigger);
      eliminados += 1;
    }
  });
  return 'Activadores obsoletos eliminados: ' + eliminados +
    '. No se instala uno nuevo porque ya no hay limpieza de cuentas.';
}

// ══════════════════════════════════════════════════════════════════════════════
//  RUTAS
// ══════════════════════════════════════════════════════════════════════════════

// Solo rutas del catálogo y acciones de invitados; no hay rutas de cuentas.
const RS_ROUTES = {
  getAddons: getAddons_,
  getAddonCategoryCounts: getAddonCategoryCounts_,
  getAddonCategoryLists: getAddonCategoryLists_,
  getSeeds: getSeeds_,
  getAddon: getAddon_,
  translateDescription: translateDescription_,
  descargarAddon: descargarAddon_,
  downloadFile: downloadFile_,
  guestGetServers: rsGetServers_,
  guestCrearServidor: rsCreateServer_,
  guestActualizarServidor: rsUpdateServer_,
  guestEliminarServidor: rsDeleteServer_,
  guestGetAddonCollections: getAddonCollections_,
  guestToggleAddonFavorite: toggleAddonFavorite_,
  guestCrearAddonCollection: createAddonCollection_,
  guestRenombrarAddonCollection: renameAddonCollection_,
  guestEliminarAddonCollection: deleteAddonCollection_,
  guestToggleAddonCollectionItem: toggleAddonCollectionItem_,
  guestLikeAddon: darLikeAddon_,
  guestCrearReporte: rsCreateReport_,
  guestPublicarSemilla: upsertSeed_,
  guestEliminarSemilla: deleteSeed_
};
