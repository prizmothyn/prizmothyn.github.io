  const NOMBRE_HOJA = "publicado"; 
  const HOJA_PENDIENTES = "publicado"; 
  const HOJA_SESION = "sesion"; 
  const ID_CARPETA_IMAGENES = "1lKP8PzdNXSSm4e2kHZj00AawhtYS9hWb"; 
  const ADMIN_USER = "worldleaf";
  const PERFIL_HTML = "perfil";
  // Las 6 categorias que admite el editor. Los 5 tipos del marketplace salen
  // de typeName() y el generico es el que escribe el extractor de "Marcketplace".
  const CATEGORIAS_EDITABLES = ["Addons", "Mapas", "Texturas", "Skins", "Scripts", "Marcketplace"];

  // Localiza un addon por numero de fila, verificando que la fila siga siendo
  // ese mismo addon. "publicado" se reordena en caliente: addUserAddon inserta
  // en la fila 2 y delete / deleteUserAccount / populateMcpeplVersiones borran
  // filas, asi que un numero guardado por el panel puede quedar obsoleto y
  // escribir ahi corromperia el addon equivocado. Si no coincide, se reintenta
  // por ID y luego por nombre. Devuelve el indice de dM, o -1.
  function localizarAddon(dM, res) {
    const id = String(res.id || "").trim().toLowerCase();
    const nombre = String(res.nombreOriginal || res.nombre || "").trim().toLowerCase();
    const filaPedida = parseInt(res.fila, 10);
    if (filaPedida >= 2 && filaPedida <= dM.length) {
      const r = dM[filaPedida - 1];
      const okNombre = nombre && String(r[1] || "").trim().toLowerCase() === nombre;
      const okId = id && String(r[11] || "").trim().toLowerCase() === id;
      if (okNombre && okId) return filaPedida - 1;
    }
    if (id) {
      for (let i = 1; i < dM.length; i++) {
        if (String(dM[i][11] || "").trim().toLowerCase() === id) return i;
      }
    }
    if (nombre) {
      for (let i = 1; i < dM.length; i++) {
        if (String(dM[i][1] || "").trim().toLowerCase() === nombre) return i;
      }
    }
    return -1;
  }

const SESION_HEADERS = [
  "Fecha",
  "Nombre",
  "Pass",
  "Estado",
  "Rol",
  "Verificacion",
  "Descripcion",
  "FotoPerfil",
  "FotoPortada",
  "UserId"
];

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  GENERADOR DE IDs CORTOS (columna L)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function generateAddonId() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  function seg(n) {
    let s = "";
    for (let i = 0; i < n; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
  }
  return seg(4) + "-" + seg(4) + "-" + seg(4);
}

function getExistingIds(sheet) {
  const ids = {};
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return ids;
  const colL = sheet.getRange(2, 12, lastRow - 1, 1).getValues();
  for (let i = 0; i < colL.length; i++) {
    const v = String(colL[i][0] || "").trim();
    if (v) ids[v] = true;
  }
  return ids;
}

function newAddonId(sheet) {
  const existing = getExistingIds(sheet);
  let id;
  do { id = generateAddonId(); } while (existing[id]);
  existing[id] = true;
  return id;
}

function setAddonTextCell_(sheet, row, column, value) {
  const cell = sheet.getRange(row, column);
  cell.setNumberFormat("@");
  cell.setValue(value == null ? "" : String(value));
}

function appendAddonRow_(sheet, values) {
  const row = sheet.getLastRow() + 1;
  const record = values.slice();
  if (record.length > 1) record[1] = record[1] == null ? "" : String(record[1]);
  if (record.length > 9) record[9] = record[9] == null ? "" : String(record[9]);
  if (record.length > 9 &&
      String(record[4] || "").trim().toLowerCase() === "versiones") {
    const titleVersion = versionDesdeTituloPublicado_(record[1]);
    if (titleVersion) record[9] = titleVersion;
  }
  sheet.getRange(row, 2).setNumberFormat("@");
  sheet.getRange(row, 10).setNumberFormat("@");
  sheet.getRange(row, 1, 1, record.length).setValues([record]);
  return row;
}

function ensureAddonIds() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(NOMBRE_HOJA);
  if (!sheet) return 0;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const existing = getExistingIds(sheet);
  const colL = sheet.getRange(2, 12, lastRow - 1, 1).getValues();
  let filled = 0;
  for (let i = 0; i < colL.length; i++) {
    if (!String(colL[i][0] || "").trim()) {
      let id;
      do { id = generateAddonId(); } while (existing[id]);
      existing[id] = true;
      sheet.getRange(i + 2, 12).setValue(id);
      filled++;
    }
  }
  Logger.log("ensureAddonIds: " + filled + " IDs generados");
  return filled;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  INICIALIZAR HOJAS NECESARIAS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function initSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Hoja sesion â€” aÃ±adir columnas "Estado" y "Rol" si no existen
  let sheetSesion = ss.getSheetByName(HOJA_SESION);
  if (sheetSesion) {
    const headers = sheetSesion.getRange(1, 1, 1, sheetSesion.getLastColumn()).getValues()[0];
    if (!headers.includes("Estado")) {
      const col = sheetSesion.getLastColumn() + 1;
      sheetSesion.getRange(1, col).setValue("Estado");
      const lastRow = sheetSesion.getLastRow();
      if (lastRow > 1) {
        for (let i = 2; i <= lastRow; i++) sheetSesion.getRange(i, col).setValue("Activo");
      }
    }
    const headers2 = sheetSesion.getRange(1, 1, 1, sheetSesion.getLastColumn()).getValues()[0];
    if (!headers2.includes("Rol")) {
      const col = sheetSesion.getLastColumn() + 1;
      sheetSesion.getRange(1, col).setValue("Rol");
      const lastRow = sheetSesion.getLastRow();
      if (lastRow > 1) {
        for (let i = 2; i <= lastRow; i++) sheetSesion.getRange(i, col).setValue("User");
      }
    }
    const headers3 = sheetSesion.getRange(1, 1, 1, sheetSesion.getLastColumn()).getValues()[0];
    if (!headers3.includes("Verificacion")) {
      const col = sheetSesion.getLastColumn() + 1;
      sheetSesion.getRange(1, col).setValue("Verificacion");
      const lastRow = sheetSesion.getLastRow();
      if (lastRow > 1) {
        for (let i = 2; i <= lastRow; i++) sheetSesion.getRange(i, col).setValue("No Verificado");
      }
    }
  }

  if (!sheetSesion) {
    sheetSesion = ss.insertSheet(HOJA_SESION);
    sheetSesion.appendRow(SESION_HEADERS);
    sheetSesion.getRange(1, 1, 1, SESION_HEADERS.length).setFontWeight("bold").setBackground("#efefef");
  }
  ensureSesionSchema(sheetSesion);

  let sheetProib = ss.getSheetByName("Proibido");
  if (!sheetProib) {
    sheetProib = ss.insertSheet("Proibido");
    sheetProib.appendRow(["Fecha", "Usuario", "Nombre", "Descripcion", "Link", "Palabra Detectada"]);
    sheetProib.getRange("A1:F1").setFontWeight("bold").setBackground("#efefef");
  }

  let sheetInfo = ss.getSheetByName("info");
  if (!sheetInfo) {
    sheetInfo = ss.insertSheet("info");
    sheetInfo.appendRow(["MÃ©trica", "Valor"]);
    sheetInfo.appendRow(["Addons", 0]);
    sheetInfo.appendRow(["Vistas", 0]);
    sheetInfo.appendRow(["Usuarios", 0]);
    sheetInfo.appendRow(["Mantenimiento", "Falso"]);
    sheetInfo.getRange("A1:B1").setFontWeight("bold").setBackground("#efefef");
  } else {
    const dataInfo = sheetInfo.getDataRange().getValues();
    let hasMaint = false;
    let hasDescargas = false;
    let usuariosRow = -1;
    let maintRow = -1;
    for (let i = 0; i < dataInfo.length; i++) {
      if (dataInfo[i][0] === "Mantenimiento") maintRow = i + 1;
      if (dataInfo[i][0] === "Descargas") hasDescargas = true;
      if (dataInfo[i][0] === "Usuarios") usuariosRow = i + 1;
      if (dataInfo[i][0] === "Mantenimiento") hasMaint = true;
    }
    if (!hasDescargas) {
      if (maintRow !== -1) {
        sheetInfo.insertRowBefore(maintRow);
        sheetInfo.getRange(maintRow, 1).setValue("Descargas");
        sheetInfo.getRange(maintRow, 2).setValue(0);
      } else if (usuariosRow !== -1) {
        sheetInfo.insertRowAfter(usuariosRow);
        sheetInfo.getRange(usuariosRow + 1, 1).setValue("Descargas");
        sheetInfo.getRange(usuariosRow + 1, 2).setValue(0);
      } else {
        sheetInfo.appendRow(["Descargas", 0]);
      }
    }
    if (!hasMaint) sheetInfo.appendRow(["Mantenimiento", "Falso"]);
  }

  ensureInfoMetric(sheetInfo, "Vistas App", 0);
  ensureInfoMetric(sheetInfo, "Vistas Pagina", 0);
  ensureInfoMetric(sheetInfo, "Vistas Totales", 0);
  ensureInfoMetric(sheetInfo, "Online App", 0);
  ensureInfoMetric(sheetInfo, "Online Pagina", 0);
  ensureInfoMetric(sheetInfo, "Online Total", 0);
}

function getInfoMetricRow(sheetInfo, metricName) {
  const dataInfo = sheetInfo.getDataRange().getValues();
  for (let i = 0; i < dataInfo.length; i++) {
    if (dataInfo[i][0] === metricName) return i + 1;
  }
  return -1;
}

function incrementInfoMetric(sheetInfo, metricName) {
  let row = getInfoMetricRow(sheetInfo, metricName);
  if (row === -1) {
    sheetInfo.appendRow([metricName, 1]);
    return 1;
  }
  const range = sheetInfo.getRange(row, 2);
  const currentValue = parseInt(range.getValue()) || 0;
  const nextValue = currentValue + 1;
  range.setValue(nextValue);
  return nextValue;
}

function ensureInfoMetric(sheetInfo, metricName, defaultValue) {
  let row = getInfoMetricRow(sheetInfo, metricName);
  if (row !== -1) return row;
  sheetInfo.appendRow([metricName, defaultValue]);
  return sheetInfo.getLastRow();
}

function normalizeSource(source) {
  if (!source) return 'pagina';
  source = String(source).trim().toLowerCase();
  if (['app', 'android', 'mobile', 'blockvault'].includes(source)) return 'app';
  if (['pagina', 'page', 'web', 'website', 'site'].includes(source)) return 'pagina';
  if (source === 'test') return 'test';
  return 'pagina';
}

function getHeaderMap(headers) {
  const map = {};
  headers.forEach((header, index) => {
    map[String(header || '').trim().toLowerCase()] = index;
  });
  return map;
}

function getHeaderIndex(headers, name, fallbackIndex) {
  const target = String(name).trim().toLowerCase();
  for (let i = 0; i < headers.length; i++) {
    if (String(headers[i] || '').trim().toLowerCase() === target) return i;
  }
  return fallbackIndex;
}

function normalizeUserId(user) {
  const clean = String(user || 'user').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  return (clean || 'user') + '_' + Utilities.getUuid().slice(0, 8);
}

function ensureSesionSchema(sheetSesion) {
  let lastColumn = sheetSesion.getLastColumn();
  if (lastColumn === 0) {
    sheetSesion.appendRow(SESION_HEADERS);
    lastColumn = SESION_HEADERS.length;
  }
  let headers = sheetSesion.getRange(1, 1, 1, Math.max(lastColumn, 1)).getValues()[0];
  if (!headers[0]) {
    sheetSesion.getRange(1, 1, 1, SESION_HEADERS.length).setValues([SESION_HEADERS]);
    headers = SESION_HEADERS.slice();
  }
  SESION_HEADERS.forEach(header => {
    const exists = headers.some(h => String(h || '').trim().toLowerCase() === header.toLowerCase());
    if (!exists) {
      const col = sheetSesion.getLastColumn() + 1;
      sheetSesion.getRange(1, col).setValue(header);
      headers.push(header);
    }
  });
  headers = sheetSesion.getRange(1, 1, 1, sheetSesion.getLastColumn()).getValues()[0];
  const idx = {};
  SESION_HEADERS.forEach(header => idx[header] = getHeaderIndex(headers, header, -1));
  const lastRow = sheetSesion.getLastRow();
  for (let row = 2; row <= lastRow; row++) {
    const values = sheetSesion.getRange(row, 1, 1, sheetSesion.getLastColumn()).getValues()[0];
    if (!values[idx["Estado"]]) sheetSesion.getRange(row, idx["Estado"] + 1).setValue("Activo");
    if (!values[idx["Rol"]]) sheetSesion.getRange(row, idx["Rol"] + 1).setValue("User");
    if (!values[idx["Verificacion"]]) sheetSesion.getRange(row, idx["Verificacion"] + 1).setValue("No Verificado");
    if (!values[idx["UserId"]]) {
      const userName = values[idx["Nombre"]] || values[1] || ("usuario_" + row);
      sheetSesion.getRange(row, idx["UserId"] + 1).setValue(normalizeUserId(userName));
    }
  }
}

function getSesionUser(sheetSesion, user, pass) {
  if (!sheetSesion) return null;
  ensureSesionSchema(sheetSesion);
  const dataUsers = sheetSesion.getDataRange().getValues();
  const headers = dataUsers[0] || [];
  const nombreCol = getHeaderIndex(headers, "Nombre", 1);
  const passCol = getHeaderIndex(headers, "Pass", 2);
  for (let i = 1; i < dataUsers.length; i++) {
    const sameUser = dataUsers[i][nombreCol] === user;
    const samePass = pass === undefined || dataUsers[i][passCol] === pass;
    if (sameUser && samePass) return { row: i + 1, values: dataUsers[i], headers };
  }
  return null;
}

function getOrCreateChildFolder(parent, name) {
  const folders = parent.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return parent.createFolder(name);
}

function getUserFolders(userId) {
  const root = DriveApp.getFolderById(ID_CARPETA_IMAGENES);
  const usuarios = getOrCreateChildFolder(root, "usuarios");
  const userFolder = getOrCreateChildFolder(usuarios, userId);
  return { userFolder, fotos: getOrCreateChildFolder(userFolder, "fotos"), ftaddon: getOrCreateChildFolder(userFolder, "ftaddon") };
}

function getPublicDriveUrl(file) {
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return "https://lh3.googleusercontent.com/u/0/d/" + file.getId() + "=s1000";
}

function guardarImagenEnCarpeta(base64Data, folder, nombreFinal) {
  const tipoMime = base64Data.split(";")[0].split(":")[1];
  const datosLimpio = base64Data.split(",")[1];
  const safeName = String(nombreFinal || ("imagen_" + Date.now() + ".png")).replace(/[^a-zA-Z0-9_\-\.]/g, "_");
  const blob = Utilities.newBlob(Utilities.base64Decode(datosLimpio), tipoMime, safeName);
  const archivo = folder.createFile(blob);
  return getPublicDriveUrl(archivo);
}

function guardarFotoUsuario(base64Data, userId, tipo) {
  if (!base64Data || !base64Data.includes("base64")) return "";
  const folders = getUserFolders(userId);
  const extension = (base64Data.split(";")[0].split("/")[1] || "png").replace(/[^a-zA-Z0-9]/g, "");
  return guardarImagenEnCarpeta(base64Data, folders.fotos, tipo + "_" + Date.now() + "." + extension);
}

function guardarMultiplesImagenesUsuarioAddon(imagenesStr, userId, nombreAddon) {
  if (!imagenesStr || imagenesStr.trim() === '') return '';
  const folders = getUserFolders(userId);
  const partes = imagenesStr.includes('|') ? imagenesStr.split('|').filter(p => p.trim() !== '') : [imagenesStr];
  const urls = [];
  for (let i = 0; i < partes.length && i < 10; i++) {
    const item = partes[i].trim();
    if (item.includes("base64")) {
      urls.push(guardarImagenEnCarpeta(item, folders.ftaddon, nombreAddon + "_" + (i + 1) + ".png"));
    } else if (item.startsWith("http")) {
      urls.push(item);
    }
  }
  return urls.join('|');
}

function buildUserProfile(userRecord, sheetMain) {
  const headers = userRecord.headers;
  const values = userRecord.values;
  const idx = {};
  SESION_HEADERS.forEach(header => idx[header] = getHeaderIndex(headers, header, -1));
  const userName = values[idx["Nombre"]] || values[1] || "";
  const addons = [];
  if (sheetMain) {
    const data = sheetMain.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][8] || "") === String(userName)) {
        addons.push({
          fecha: data[i][0] || "",
          nombre: data[i][1] || "",
          link: data[i][2] || "",
          imagen: data[i][3] || "",
          categoria: data[i][4] || "",
          likes: data[i][5] || 0,
          descargas: data[i][6] || 0,
          seed: data[i][7] || "",
          subidoPor: data[i][8] || "",
          version: data[i][9] || "",
          descripcion: data[i][10] || ""
        });
      }
    }
  }
  return {
    user: userName,
    estado: values[idx["Estado"]] || "Activo",
    rol: values[idx["Rol"]] || "User",
    verificacion: values[idx["Verificacion"]] || "No Verificado",
    descripcion: values[idx["Descripcion"]] || "",
    fotoPerfil: values[idx["FotoPerfil"]] || "",
    fotoPortada: values[idx["FotoPortada"]] || "",
    userId: values[idx["UserId"]] || "",
    addons
  };
}

function registerOnlineSession(source, sessionId) {
  if (!source || normalizeSource(source) === 'test') return null;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheetOnline = ss.getSheetByName('Online');
  if (!sheetOnline) {
    sheetOnline = ss.insertSheet('Online');
    sheetOnline.appendRow(['SessionId', 'Source', 'FirstSeen', 'LastSeen', 'Ignored']);
  }
  const normalizedSource = normalizeSource(source);
  const now = new Date();
  const clientId = sessionId ? String(sessionId).trim() : Utilities.getUuid();
  const data = sheetOnline.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === clientId && String(data[i][1]).toLowerCase() === normalizedSource) {
      sheetOnline.getRange(i + 1, 4).setValue(now);
      return clientId;
    }
  }
  sheetOnline.appendRow([clientId, normalizedSource, now, now, 'No']);
  return clientId;
}

function getLiveOnlineStats() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetOnline = ss.getSheetByName('Online');
  if (!sheetOnline) return { appOnline: 0, paginaOnline: 0, totalOnline: 0, activeSessions: [] };
  const data = sheetOnline.getDataRange().getValues();
  const now = new Date();
  const threshold = new Date(now.getTime() - 30000);
  let appOnline = 0, paginaOnline = 0;
  const activeSessions = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    let lastSeen = null;
    const lastSeenVal = row[3];
    if (lastSeenVal instanceof Date) lastSeen = lastSeenVal;
    else if (typeof lastSeenVal === 'string') lastSeen = new Date(lastSeenVal);
    else if (typeof lastSeenVal === 'number') lastSeen = new Date(lastSeenVal);
    if (!lastSeen || isNaN(lastSeen.getTime())) continue;
    if (String(row[4] || '').toLowerCase() === 'yes') continue;
    if (lastSeen >= threshold) {
      const source = normalizeSource(row[1]);
      if (source === 'app') appOnline++;
      if (source === 'pagina') paginaOnline++;
      activeSessions.push({ sessionId: row[0], source, lastSeen: lastSeen.toISOString() });
    }
  }
  return { appOnline, paginaOnline, totalOnline: appOnline + paginaOnline, activeSessions };
}

function strSimilarity(a, b) {
  a = (a || '').toLowerCase().trim();
  b = (b || '').toLowerCase().trim();
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const m = a.length, n = b.length;
  const dp = Array.from({length: m+1}, (_, i) => Array.from({length: n+1}, (_, j) => j === 0 ? i : i === 0 ? j : 0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return 1 - dp[m][n] / Math.max(m, n);
}

function autoCleanSugerencias(addedName, tipo) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Sugerencias');
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    const toDelete = [];
    for (let i = data.length - 1; i >= 1; i--) {
      const rowTipo = data[i][1];
      const rowName = tipo === 'addon' ? data[i][2] : data[i][6];
      if (rowTipo === tipo && strSimilarity(String(addedName), String(rowName)) >= 0.70) toDelete.push(i + 1);
    }
    toDelete.forEach(row => sheet.deleteRow(row));
  } catch(e) { console.log('autoClean error: ' + e); }
}

function getLiveStats() {
  try {
    initSheets();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheetInfo = ss.getSheetByName("info");
    if (!sheetInfo) {
      sheetInfo = ss.insertSheet("info");
      sheetInfo.appendRow(["MÃ©trica", "Valor"]);
    }
    const counts = getLiveOnlineStats();
    const getMetricValue = (metricName) => {
      try {
        const row = getInfoMetricRow(sheetInfo, metricName);
        if (row === -1) return 0;
        return parseInt(sheetInfo.getRange(row, 2).getValue()) || 0;
      } catch(e) { return 0; }
    };
    return {
      ok: true,
      appOnline: counts.appOnline || 0,
      paginaOnline: counts.paginaOnline || 0,
      totalOnline: counts.totalOnline || 0,
      appViews: getMetricValue("Vistas App") || 0,
      paginaViews: getMetricValue("Vistas Pagina") || 0,
      totalViews: getMetricValue("Vistas Totales") || 0,
      activeSessions: counts.activeSessions || [],
      timestamp: new Date().toISOString()
    };
  } catch(err) {
    return { ok: true, appOnline: 0, paginaOnline: 0, totalOnline: 0, appViews: 0, paginaViews: 0, totalViews: 0, activeSessions: [], timestamp: new Date().toISOString(), error: err.toString() };
  }
}

function registerTestPageview(source, sessionId) {
  try {
    initSheets();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheetInfo = ss.getSheetByName("info");
    if (!sheetInfo) {
      sheetInfo = ss.insertSheet("info");
      sheetInfo.appendRow(["MÃ©trica", "Valor"]);
    }
    const normalizedSource = normalizeSource(source);
    if (normalizedSource === 'app') incrementInfoMetric(sheetInfo, "Vistas App");
    else if (normalizedSource === 'pagina') incrementInfoMetric(sheetInfo, "Vistas Pagina");
    incrementInfoMetric(sheetInfo, "Vistas Totales");
    registerOnlineSession(normalizedSource, sessionId);
    return "OK";
  } catch(err) { return "ERROR: " + err.toString(); }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  doPost
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function doPost(e) {
  initSheets();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetMain = ss.getSheetByName(NOMBRE_HOJA);
  const sheetRev = ss.getSheetByName(HOJA_PENDIENTES);
  const sheetSesion = ss.getSheetByName(HOJA_SESION);

  try {
    const res = JSON.parse(e.postData.contents);
    const action = res.action;

    if (action === "register") {
      ensureSesionSchema(sheetSesion);
      const dataUsers = sheetSesion.getDataRange().getValues();
      const headers = dataUsers[0] || [];
      const nombreCol = getHeaderIndex(headers, "Nombre", 1);
      for (let i = 1; i < dataUsers.length; i++) {
        if (dataUsers[i][nombreCol] === res.user) return ContentService.createTextOutput("USER_EXISTS");
      }
      const userId = normalizeUserId(res.user);
      getUserFolders(userId);
      const row = SESION_HEADERS.map(header => {
        if (header === "Fecha") return new Date().toLocaleString();
        if (header === "Nombre") return res.user;
        if (header === "Pass") return res.pass;
        if (header === "Estado") return "Activo";
        if (header === "Rol") return "User";
        if (header === "Verificacion") return "No Verificado";
        if (header === "Descripcion") return "";
        if (header === "FotoPerfil") return "";
        if (header === "FotoPortada") return "";
        if (header === "UserId") return userId;
        return "";
      });
      sheetSesion.appendRow(row);
      return ContentService.createTextOutput("REGISTER_OK");
    }

    if (action === "login") {
      ensureSesionSchema(sheetSesion);
      const dataUsers = sheetSesion.getDataRange().getValues();
      const headers = dataUsers[0] || [];
      const rolCol = headers.findIndex(h => String(h).toLowerCase() === 'rol');
      const estadoCol = getHeaderIndex(headers, "Estado", 3);
      for (let i = 1; i < dataUsers.length; i++) {
        if (String(dataUsers[i][1]).trim() === String(res.user).trim() && String(dataUsers[i][2]).trim() === String(res.pass).trim()) {
          const userRole = (rolCol !== -1 && dataUsers[i][rolCol]) ? dataUsers[i][rolCol] : "User";
          const estado = dataUsers[i][estadoCol] || "Activo";
          if (String(estado).toLowerCase() !== "activo") {
            return ContentService.createTextOutput(JSON.stringify({ status: "LOGIN_BLOCKED", estado }));
          }
          const profile = buildUserProfile({ row: i + 1, values: dataUsers[i], headers }, sheetMain);
          return ContentService.createTextOutput(JSON.stringify({ status: "LOGIN_OK", rol: userRole, profile }));
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "LOGIN_ERROR" }));
    }

    if (action === "getProfile") {
      const userRecord = getSesionUser(sheetSesion, res.user, res.pass);
      if (!userRecord) return ContentService.createTextOutput(JSON.stringify({ status: "AUTH_ERROR" }));
      return ContentService.createTextOutput(JSON.stringify({ status: "PROFILE_OK", profile: buildUserProfile(userRecord, sheetMain) })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "updateProfile") {
      const userRecord = getSesionUser(sheetSesion, res.user, res.pass);
      if (!userRecord) return ContentService.createTextOutput(JSON.stringify({ status: "AUTH_ERROR" }));
      const headers = userRecord.headers;
      const idxDescripcion = getHeaderIndex(headers, "Descripcion", 6);
      const idxPerfil = getHeaderIndex(headers, "FotoPerfil", 7);
      const idxPortada = getHeaderIndex(headers, "FotoPortada", 8);
      const idxUserId = getHeaderIndex(headers, "UserId", 9);
      const userId = userRecord.values[idxUserId] || normalizeUserId(res.user);
      if (!userRecord.values[idxUserId]) sheetSesion.getRange(userRecord.row, idxUserId + 1).setValue(userId);
      if (res.descripcion !== undefined) sheetSesion.getRange(userRecord.row, idxDescripcion + 1).setValue(String(res.descripcion || "").slice(0, 500));
      if (res.fotoPerfil && res.fotoPerfil.includes("base64")) {
        enviarAPapelera(userRecord.values[idxPerfil]);
        sheetSesion.getRange(userRecord.row, idxPerfil + 1).setValue(guardarFotoUsuario(res.fotoPerfil, userId, "perfil"));
      }
      if (res.fotoPortada && res.fotoPortada.includes("base64")) {
        enviarAPapelera(userRecord.values[idxPortada]);
        sheetSesion.getRange(userRecord.row, idxPortada + 1).setValue(guardarFotoUsuario(res.fotoPortada, userId, "portada"));
      }
      const updatedRecord = getSesionUser(sheetSesion, res.user, res.pass);
      return ContentService.createTextOutput(JSON.stringify({ status: "PROFILE_UPDATED", profile: buildUserProfile(updatedRecord, sheetMain) })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "setUserStatus") {
      const dataUsers = sheetSesion.getDataRange().getValues();
      for (let i = 0; i < dataUsers.length; i++) {
        if (dataUsers[i][1] === res.nombre) {
          let estadoCol = 4;
          const headers = dataUsers[0];
          for (let j = 0; j < headers.length; j++) {
            if (String(headers[j]).toLowerCase() === 'estado') { estadoCol = j + 1; break; }
          }
          sheetSesion.getRange(i + 1, estadoCol).setValue(res.estado);
          return ContentService.createTextOutput("STATUS_OK");
        }
      }
      return ContentService.createTextOutput("USER_NOT_FOUND");
    }

    if (action === "setUserVerification") {
      const dataUsers = sheetSesion.getDataRange().getValues();
      for (let i = 1; i < dataUsers.length; i++) {
        if (dataUsers[i][1] === res.nombre) {
          let veriCol = 6;
          const headers = dataUsers[0];
          for (let j = 0; j < headers.length; j++) {
            if (String(headers[j]).toLowerCase() === 'verificacion') { veriCol = j + 1; break; }
          }
          sheetSesion.getRange(i + 1, veriCol).setValue(res.verificacion);
          return ContentService.createTextOutput("VERIFICATION_OK");
        }
      }
      return ContentService.createTextOutput("USER_NOT_FOUND");
    }

    if (action === "deleteUserAccount") {
      if (res.rol !== "Admin") return ContentService.createTextOutput("UNAUTHORIZED");
      const dataUsers = sheetSesion.getDataRange().getValues();
      const userName = res.nombre;
      for (let i = 1; i < dataUsers.length; i++) {
        if (dataUsers[i][1] === userName) { sheetSesion.deleteRow(i + 1); break; }
      }
      const dataAddons = sheetMain.getDataRange().getValues();
      for (let i = dataAddons.length - 1; i >= 1; i--) {
        if (dataAddons[i][8] === userName) {
          if (dataAddons[i][3]) enviarAPapelera(dataAddons[i][3]);
          eliminarImagenesAddon(dataAddons[i][1]);
          sheetMain.deleteRow(i + 1);
        }
      }
      return ContentService.createTextOutput("USER_DELETED_FULL");
    }

    if (action === "renameUser") {
      const user = res.user, newName = res.newName, pass = res.pass;
      if (!user || !newName || !pass) return ContentService.createTextOutput("MISSING_FIELDS");
      if (user === ADMIN_USER || newName === ADMIN_USER) return ContentService.createTextOutput("FORBIDDEN");
      const dataUsers = sheetSesion.getDataRange().getValues();
      for (let i = 1; i < dataUsers.length; i++) {
        if (dataUsers[i][1] === newName) return ContentService.createTextOutput("NAME_TAKEN");
      }
      let estadoCol = 4;
      const headers = dataUsers[0];
      for (let j = 0; j < headers.length; j++) {
        if (String(headers[j]).toLowerCase() === 'estado') { estadoCol = j + 1; break; }
      }
      let userRow = -1;
      for (let i = 1; i < dataUsers.length; i++) {
        if (dataUsers[i][1] === user && dataUsers[i][2] === pass) { userRow = i + 1; break; }
      }
      if (userRow === -1) return ContentService.createTextOutput("AUTH_ERROR");
      sheetSesion.getRange(userRow, 2).setValue(newName);
      const dataAddons = sheetMain.getDataRange().getValues();
      for (let i = 1; i < dataAddons.length; i++) {
        if (dataAddons[i][8] === user) sheetMain.getRange(i + 1, 9).setValue(newName);
      }
      return ContentService.createTextOutput("RENAME_OK");
    }

    if (action === "logBanned") {
      const sheetProib = ss.getSheetByName("Proibido");
      if (sheetProib) {
        sheetProib.appendRow([res.fecha || new Date().toLocaleString(), res.usuario || "", res.nombre || "", res.descripcion || "", res.link || "", res.palabra || ""]);
      }
      return ContentService.createTextOutput("LOGGED");
    }

    if (action === "delete") {
      const data = sheetMain.getDataRange().getValues();
      const isAdmin = res.rol === "Admin";
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][1]).trim() === String(res.nombre).trim() && (isAdmin || String(data[i][8]).trim() === String(res.usuario).trim())) {
          enviarAPapelera(data[i][3]);
          eliminarImagenesAddon(res.nombre);
          sheetMain.deleteRow(i + 1);
          return ContentService.createTextOutput("DELETE_OK");
        }
      }
      return ContentService.createTextOutput("DELETE_ERROR");
    }

    // Edita los 6 campos del addon. Va en doPost porque escribe: el panel
    // lo invoca con un POST y si estuviera en doGet jamas se alcanzaria.
    //   Nombre(2) urldescargas(3) urlimg(4) categorias(5) Version(10) Descripcion(11)
    if (action === "editAddon") {
      const shM = ss.getSheetByName(NOMBRE_HOJA);
      if (!shM) return ContentService.createTextOutput("SHEET_NOT_FOUND");
      const dM = shM.getDataRange().getValues();
      const target = localizarAddon(dM, res);
      if (target === -1) return ContentService.createTextOutput("NOT_FOUND");

      const nombre = String(res.nombre == null ? "" : res.nombre).trim();
      if (!nombre) return ContentService.createTextOutput("BAD_NAME");
      if (nombre.length > 200) return ContentService.createTextOutput("BAD_NAME");

      const url = String(res.url == null ? "" : res.url).trim();
      if (url && !/^https?:\/\//i.test(url)) return ContentService.createTextOutput("BAD_URL");

      // urlimg admite varias imagenes separadas por "|"
      const imgs = String(res.urlimg == null ? "" : res.urlimg).trim();
      const partes = imgs ? imgs.split("|").map(function (s) { return s.trim(); }).filter(function (s) { return s; }) : [];
      if (partes.length > 30) return ContentService.createTextOutput("BAD_IMG");
      for (let k = 0; k < partes.length; k++) {
        if (!/^https?:\/\//i.test(partes[k])) return ContentService.createTextOutput("BAD_IMG");
      }

      const cat = String(res.categorias == null ? "" : res.categorias).trim();
      const catActual = String(dM[target][4] || "").trim();
      if (!cat) return ContentService.createTextOutput("BAD_CATEGORY");
      // Se admiten las 6 oficiales; un valor heredado solo se conserva si no cambia.
      if (CATEGORIAS_EDITABLES.indexOf(cat) === -1 && cat !== catActual) {
        return ContentService.createTextOutput("BAD_CATEGORY");
      }

      const version = String(res.version == null ? "" : res.version).trim();
      if (version.length > 300 || /[\r\n]/.test(version)) return ContentService.createTextOutput("BAD_VERSION");

      const desc = String(res.descripcion == null ? "" : res.descripcion).trim();
      if (desc.length > 8000) return ContentService.createTextOutput("BAD_DESC");

      setAddonTextCell_(shM, target + 1, 2, nombre);
      shM.getRange(target + 1, 3, 1, 3).setValues([[url, partes.join("|"), cat]]);
      setAddonTextCell_(shM, target + 1, 10, version);
      shM.getRange(target + 1, 11).setValue(desc);
      return ContentService.createTextOutput("EDIT_OK");
    }

    if (action === "edit") {
      const data = sheetMain.getDataRange().getValues();
      const isAdmin = res.rol === "Admin";
      const nuevoNombre = (res.nuevoNombre || "").trim().toLowerCase();
      const nombreOriginal = (res.nombreOriginal || "").trim().toLowerCase();
      if (nuevoNombre !== nombreOriginal) {
        for (let i = 1; i < data.length; i++) {
          if ((data[i][1] || "").trim().toLowerCase() === nuevoNombre) return ContentService.createTextOutput("NAME_EXISTS");
        }
      }
      for (let i = 1; i < data.length; i++) {
        if (data[i][1] === res.nombreOriginal && (isAdmin || data[i][8] === res.usuario)) {
          if (res.nuevaImg && res.nuevaImg.includes("base64")) {
            enviarAPapelera(data[i][3]);
            eliminarImagenesAddon(res.nuevoNombre);
            sheetMain.getRange(i + 1, 4).setValue(guardarMultiplesImagenes(res.nuevaImg, res.nuevoNombre));
          } else if (res.nuevaImgUrl !== undefined) {
            if (res.nuevaImgUrl === '') { enviarAPapelera(data[i][3]); eliminarImagenesAddon(res.nuevoNombre); }
            sheetMain.getRange(i + 1, 4).setValue(res.nuevaImgUrl);
          }
          setAddonTextCell_(sheetMain, i + 1, 2, res.nuevoNombre);
          sheetMain.getRange(i + 1, 3).setValue(res.nuevaUrl);
          if (res.nuevaCategoria) sheetMain.getRange(i + 1, 5).setValue(res.nuevaCategoria);
          if (res.nuevaSeed) sheetMain.getRange(i + 1, 8).setValue(res.nuevaSeed);
          if (res.nuevaVersion !== undefined && res.nuevaVersion !== "") {
            setAddonTextCell_(sheetMain, i + 1, 10, res.nuevaVersion);
          }
          if (res.nuevaDescripcion) sheetMain.getRange(i + 1, 11).setValue(res.nuevaDescripcion);
          autoCleanSugerencias(res.nombreOriginal || res.nuevoNombre, 'actualizacion');
          return ContentService.createTextOutput("EDIT_OK");
        }
      }
    }

    if (action === "setMaintenance") {
      if (res.rol !== "Admin") return ContentService.createTextOutput("UNAUTHORIZED");
      const sheetInfo = ss.getSheetByName("info");
      const dataInfo = sheetInfo.getDataRange().getValues();
      for (let i = 0; i < dataInfo.length; i++) {
        if (dataInfo[i][0] === "Mantenimiento") {
          sheetInfo.getRange(i + 1, 2).setValue(res.estado ? "Verdadero" : "Falso");
          return ContentService.createTextOutput("MAINTENANCE_UPDATED");
        }
      }
    }

    if (action === "addUserAddon") {
      const userRecord = getSesionUser(sheetSesion, res.user, res.pass);
      if (!userRecord) return ContentService.createTextOutput("AUTH_ERROR");
      const profile = buildUserProfile(userRecord, sheetMain);
      if (String(profile.verificacion).toLowerCase() !== "verificado") return ContentService.createTextOutput("NEEDS_VERIFICATION");
      const dataMain = sheetMain.getDataRange().getValues();
      const nuevoNombre = (res.nombre || "").trim().toLowerCase();
      for (let i = 1; i < dataMain.length; i++) {
        if ((dataMain[i][1] || "").trim().toLowerCase() === nuevoNombre) return ContentService.createTextOutput("NAME_EXISTS");
      }
      let addonImages = res.imgUrl || "";
      if (res.img && res.img.includes("base64")) addonImages = guardarMultiplesImagenesUsuarioAddon(res.img, profile.userId, res.nombre);
      appendAddonRow_(sheetMain, [new Date().toLocaleString(), String(res.nombre || ""), res.link || "", addonImages, res.category || "", 0, 0, res.seed || "", profile.user, String(res.version || ""), res.descripcion || "", newAddonId(sheetMain)]);
      autoCleanSugerencias(res.nombre, 'addon');
      return ContentService.createTextOutput("ADDON_USER_OK");
    }

    let urlImagenFinal = res.imgUrl || "";
    if (res.img && res.img.includes("base64")) {
      try { urlImagenFinal = guardarMultiplesImagenes(res.img, res.nombre); } catch(imgErr) { urlImagenFinal = res.imgUrl || ""; console.log("Error guardando imÃ¡genes: " + imgErr.toString()); }
    }
    let urlDescargaFinal = res.link;

    if (action === "add") {
      const dataMain = sheetMain.getDataRange().getValues();
      const nuevoNombre = (res.nombre || "").trim().toLowerCase();
      for (let i = 1; i < dataMain.length; i++) {
        if ((dataMain[i][1] || "").trim().toLowerCase() === nuevoNombre) return ContentService.createTextOutput("NAME_EXISTS");
      }
      appendAddonRow_(sheetRev, [new Date().toLocaleString(), String(res.nombre || ""), urlDescargaFinal, urlImagenFinal, res.category, 0, 0, res.seed, res.subidoPor, String(res.version || ""), res.descripcion || ""]);
      autoCleanSugerencias(res.nombre, 'addon');
      return ContentService.createTextOutput("OK_EN_REVISION");
    }

    if (action === "approve") {
      const dataRev = sheetRev.getDataRange().getValues();
      for (let i = 1; i < dataRev.length; i++) {
        if (dataRev[i][1] === res.nombre) {
          if ((dataRev[i][8] || "").toString().trim().toLowerCase() !== "worldleaf") {
            sheetRev.deleteRow(i + 1);
            return ContentService.createTextOutput("UNAUTHORIZED");
          }
          appendAddonRow_(sheetMain, dataRev[i].concat(newAddonId(sheetMain)));
          sheetRev.deleteRow(i + 1);
          return ContentService.createTextOutput("APROBADO");
        }
      }
    }

    if (action === "addSugerencia") {
      const ss2 = SpreadsheetApp.getActiveSpreadsheet();
      let sheetSug = ss2.getSheetByName('Sugerencias');
      if (!sheetSug) {
        sheetSug = ss2.insertSheet('Sugerencias');
        sheetSug.appendRow(['ID','Tipo','Nombre','URL','Imagen','Descripcion','AddonRef','FechaHora','Autor']);
        sheetSug.setFrozenRows(1);
        sheetSug.getRange('A1:I1').setFontWeight('bold').setBackground('#efefef');
      }
      const id = new Date().getTime().toString(36) + Math.random().toString(36).substr(2, 4);
      sheetSug.appendRow([id, res.tipo || '', res.nombre || '', res.url || '', res.imagen || '', res.descripcion || '', res.addonRef || '', new Date().toLocaleString('es-ES'), res.autor || 'AnÃ³nimo']);
      return ContentService.createTextOutput('SUGE_OK');
    }

    if (action === "deleteSugerencia") {
      const ss2 = SpreadsheetApp.getActiveSpreadsheet();
      const sheetSug = ss2.getSheetByName('Sugerencias');
      if (!sheetSug) return ContentService.createTextOutput('NOT_FOUND');
      const dataSug = sheetSug.getDataRange().getValues();
      for (let i = dataSug.length - 1; i >= 1; i--) {
        if (String(dataSug[i][0]) === String(res.id)) { sheetSug.deleteRow(i + 1); return ContentService.createTextOutput('SUGE_DEL_OK'); }
      }
      return ContentService.createTextOutput('NOT_FOUND');
    }

  } catch (err) {
    return ContentService.createTextOutput("ERROR: " + err.toString());
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  GUARDAR IMAGEN EN DRIVE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function guardarImagenEnDrive(base64Data, nombreAddon, indice) {
  const folder = DriveApp.getFolderById(ID_CARPETA_IMAGENES);
  const tipoMime = base64Data.split(";")[0].split(":")[1];
  const datosLimpio = base64Data.split(",")[1];
  const sufijo = indice !== undefined ? '_' + indice : '_' + new Date().getTime();
  const nombreFinal = (nombreAddon + sufijo + ".png").replace(/[^a-zA-Z0-9_\-\u00C0-\u024F\.]/g, '_');
  const blob = Utilities.newBlob(Utilities.base64Decode(datosLimpio), tipoMime, nombreFinal);
  const archivo = folder.createFile(blob);
  archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return "https://lh3.googleusercontent.com/u/0/d/" + archivo.getId() + "=s1000";
}

function guardarMultiplesImagenes(imagenesStr, nombreAddon) {
  if (!imagenesStr || imagenesStr.trim() === '') return '';
  if (!imagenesStr.includes('|')) return guardarImagenEnDrive(imagenesStr, nombreAddon, 1);
  const partes = imagenesStr.split('|').filter(p => p.trim() !== '');
  const urls = [];
  for (let i = 0; i < partes.length && i < 10; i++) {
    const b64 = partes[i].trim();
    if (b64.includes('base64')) urls.push(guardarImagenEnDrive(b64, nombreAddon, i + 1));
    else if (b64.startsWith('http')) urls.push(b64);
  }
  return urls.join('|');
}

function enviarAPapelera(url) {
  if (!url || url === "") return;
  const urls = url.split('|');
  urls.forEach(function(u) {
    u = u.trim();
    if (!u) return;
    try {
      let id = "";
      if (u.includes("id=")) id = u.split("id=")[1].split("&")[0];
      else if (u.includes("picture/0")) id = u.split("picture/0")[1].split("=")[0];
      else if (u.match(/\/d\/([^\/=]+)/)) id = u.match(/\/d\/([^\/=]+)/)[1];
      if (id !== "") DriveApp.getFileById(id).setTrashed(true);
    } catch (e) { console.log("No se pudo eliminar el archivo: " + e.toString()); }
  });
}

function eliminarImagenesAddon(nombreAddon) {
  const folder = DriveApp.getFolderById(ID_CARPETA_IMAGENES);
  const subfolders = folder.getFolders();
  const folderList = [folder];
  while (subfolders.hasNext()) folderList.push(subfolders.next());

  folderList.forEach(function(f) {
    const archivos = f.getFiles();
    while (archivos.hasNext()) {
      const archivo = archivos.next();
      const nombreArchivo = archivo.getName();
      for (let i = 1; i <= 10; i++) {
        if (nombreArchivo === nombreAddon + '_' + i + '.png') {
          try { archivo.setTrashed(true); } catch(e) { console.log("No se pudo eliminar: " + nombreArchivo + " - " + e.toString()); }
          break;
        }
      }
    }
  });
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  doGet
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function doGet(e) {
  initSheets();
  const action = e.parameter.action;
  const cb = e.parameter.callback;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const gasUrl = ScriptApp.getService().getUrl();

  if (cb && action === "getMcpedlAddons") {
    try {
      const sheet = ss.getSheetByName(NOMBRE_HOJA);
      const data = sheet.getDataRange().getValues();
      const addons = [];
      for (let i = 1; i < data.length; i++) {
        if (!data[i][1]) continue;
        addons.push({
          fecha: String(data[i][0] || ""),
          nombre: String(data[i][1] || ""),
          link: String(data[i][2] || ""),
          imagenes: String(data[i][3] || ""),
          categoria: String(data[i][4] || ""),
          likes: parseInt(data[i][5]) || 0,
          downloads: parseInt(data[i][6]) || 0,
          espacio: String(data[i][8] || ""),
          version: String(data[i][9] || ""),
          descripcion: String(data[i][10] || ""),
          id: String(data[i][11] || ""),
          dislikes: 0
        });
      }
      const res = JSON.stringify({ status: "OK", addons, total: addons.length });
      return ContentService.createTextOutput(cb + "(" + res + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
    } catch (e) {
      const err = JSON.stringify({ status: "ERROR", mensaje: e.toString(), addons: [] });
      return ContentService.createTextOutput(cb + "(" + err + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
  }

  if (cb && action === "getMcpeplVersiones") {
    try {
      const sheet = ss.getSheetByName(NOMBRE_HOJA);
      const data = sheet.getDataRange().getValues();
      const versiones = [];
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][4] || "").trim().toLowerCase() !== "versiones") continue;
        versiones.push({
          fecha: String(data[i][0] || ""),
          nombre: String(data[i][1] || ""),
          link: String(data[i][2] || ""),
          imagenes: String(data[i][3] || ""),
          categoria: String(data[i][4] || ""),
          likes: parseInt(data[i][5]) || 0,
          downloads: parseInt(data[i][6]) || 0,
          espacio: String(data[i][8] || ""),
          version: String(data[i][9] || ""),
          descripcion: String(data[i][10] || ""),
          id: String(data[i][11] || "")
        });
      }
      const res = JSON.stringify({ status: "OK", versiones, total: versiones.length });
      return ContentService.createTextOutput(cb + "(" + res + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
    } catch (e) {
      const err = JSON.stringify({ status: "ERROR", mensaje: e.toString(), versiones: [] });
      return ContentService.createTextOutput(cb + "(" + err + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
  }

  if (!action) {
    const template = HtmlService.createTemplateFromFile('index');
    template.gasUrl = gasUrl;
    return template.evaluate().setTitle('Prizmothyn').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if (action === 'addon') {
    const addonId = e.parameter.id || '';
    const template = HtmlService.createTemplateFromFile('addon');
    template.addonId = addonId;
    template.gasUrl = gasUrl;
    return template.evaluate().setTitle('Prizmothyn').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if (action === 'dashboard') {
    return HtmlService.createHtmlOutputFromFile('test').setTitle('BlockVault - Monitor en Tiempo Real').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if (action === "perfil") {
    return HtmlService.createHtmlOutputFromFile(PERFIL_HTML).setTitle("Perfil - BlockVault").setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if (action === "pageview") {
    const source = normalizeSource(e.parameter.source);
    if (source === 'test') return ContentService.createTextOutput("OK");
    const sheetInfo = ss.getSheetByName("info");
    const vistasRow = getInfoMetricRow(sheetInfo, "Vistas");
    if (vistasRow !== -1) {
      const vistasRange = sheetInfo.getRange(vistasRow, 2);
      vistasRange.setValue((parseInt(vistasRange.getValue()) || 0) + 1);
    }
    if (source === 'app') incrementInfoMetric(sheetInfo, "Vistas App");
    else incrementInfoMetric(sheetInfo, "Vistas Pagina");
    incrementInfoMetric(sheetInfo, "Vistas Totales");
    registerOnlineSession(source, e.parameter.sessionId);
    return ContentService.createTextOutput("OK");
  }

  if (action === "liveStats") {
    const sheetInfo = ss.getSheetByName("info");
    const counts = getLiveOnlineStats();
    return ContentService.createTextOutput(JSON.stringify({
      ok: true,
      appOnline: counts.appOnline,
      paginaOnline: counts.paginaOnline,
      totalOnline: counts.totalOnline,
      appViews: parseInt(sheetInfo.getRange(getInfoMetricRow(sheetInfo, "Vistas App"), 2).getValue()) || 0,
      paginaViews: parseInt(sheetInfo.getRange(getInfoMetricRow(sheetInfo, "Vistas Pagina"), 2).getValue()) || 0,
      totalViews: parseInt(sheetInfo.getRange(getInfoMetricRow(sheetInfo, "Vistas Totales"), 2).getValue()) || 0,
      activeSessions: counts.activeSessions,
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === "getStats") {
    const sheetInfo = ss.getSheetByName("info");
    const sheetMain = ss.getSheetByName(NOMBRE_HOJA);
    const sheetSesion = ss.getSheetByName(HOJA_SESION);
    let totalAddons = 0;
    if (sheetMain) totalAddons = Math.max(0, sheetMain.getDataRange().getValues().length - 1);
    let totalUsuarios = 0;
    if (sheetSesion) {
      const dataSesion = sheetSesion.getDataRange().getValues();
      totalUsuarios = dataSesion.filter(row => row[1] && row[1].toString().trim() !== "" && row[1].toString().toLowerCase() !== "nombre").length;
    }
    let totalVistas = parseInt(sheetInfo.getRange("B3").getValue()) || 0;
    sheetInfo.getRange("B2").setValue(totalAddons);
    sheetInfo.getRange("B4").setValue(totalUsuarios);
    let enMantenimiento = false;
    const dataInfo = sheetInfo.getDataRange().getValues();
    for (let i = 0; i < dataInfo.length; i++) {
      if (dataInfo[i][0] === "Mantenimiento" && dataInfo[i][1] === "Verdadero") enMantenimiento = true;
    }
    const appViews = parseInt(sheetInfo.getRange(getInfoMetricRow(sheetInfo, "Vistas App"), 2).getValue()) || 0;
    const paginaViews = parseInt(sheetInfo.getRange(getInfoMetricRow(sheetInfo, "Vistas Pagina"), 2).getValue()) || 0;
    const totalViewsMetric = parseInt(sheetInfo.getRange(getInfoMetricRow(sheetInfo, "Vistas Totales"), 2).getValue()) || totalVistas;
    const onlineCounts = getLiveOnlineStats();
    return ContentService.createTextOutput(JSON.stringify({
      ok: true, total_addons: totalAddons, total_vistas: totalVistas, total_usuarios: totalUsuarios,
      total_descargas: parseInt(sheetInfo.getRange(getInfoMetricRow(sheetInfo, "Descargas"), 2).getValue()) || 0,
      app_vistas: appViews, pagina_vistas: paginaViews, total_vistas_metric: totalViewsMetric,
      app_online: onlineCounts.appOnline, pagina_online: onlineCounts.paginaOnline, total_online: onlineCounts.totalOnline,
      mantenimiento: enMantenimiento
    })).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === "incrementDescargas") {
    const sheetInfo = ss.getSheetByName("info");
    return ContentService.createTextOutput(JSON.stringify({ ok: true, total: incrementInfoMetric(sheetInfo, "Descargas") })).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === "checkStatus") {
    const user = e.parameter.user;
    const sheetSesion = ss.getSheetByName(HOJA_SESION);
    if (!sheetSesion || !user) return ContentService.createTextOutput(JSON.stringify({ estado: "Activo" })).setMimeType(ContentService.MimeType.JSON);
    const data = sheetSesion.getDataRange().getValues();
    let estadoColIdx = 3;
    if (data.length > 0) {
      for (let j = 0; j < data[0].length; j++) {
        if (String(data[0][j]).toLowerCase() === 'estado') { estadoColIdx = j; break; }
      }
    }
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] === user) return ContentService.createTextOutput(JSON.stringify({ estado: data[i][estadoColIdx] || "Activo" })).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({ estado: "Activo" })).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === "getUsers") {
    const sheetSesion = ss.getSheetByName(HOJA_SESION);
    if (!sheetSesion) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    const data = sheetSesion.getDataRange().getValues();
    const headers = data[0] || [];
    let estadoColIdx = headers.findIndex(h => String(h).toLowerCase() === 'estado');
    if (estadoColIdx === -1) estadoColIdx = 3;
    let rolColIdx = headers.findIndex(h => String(h).toLowerCase() === 'rol');
    if (rolColIdx === -1) rolColIdx = 4;
    let veriColIdx = headers.findIndex(h => String(h).toLowerCase() === 'verificacion');
    if (veriColIdx === -1) veriColIdx = 5;
    const result = data.map((row, i) => [row[0] || '', row[1] || '', row[2] || '', row[estadoColIdx] || (i === 0 ? 'Estado' : 'Activo'), row[rolColIdx] || (i === 0 ? 'Rol' : 'User'), row[veriColIdx] || (i === 0 ? 'Verificacion' : 'No Verificado')]);
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === "getSugerencias") {
    const sheetSug = ss.getSheetByName('Sugerencias');
    if (!sheetSug) return ContentService.createTextOutput('[]').setMimeType(ContentService.MimeType.JSON);
    const dataSug = sheetSug.getDataRange().getValues();
    if (dataSug.length <= 1) return ContentService.createTextOutput('[]').setMimeType(ContentService.MimeType.JSON);
    const headers = dataSug[0];
    return ContentService.createTextOutput(JSON.stringify(dataSug.slice(1).map(row => { const obj = {}; headers.forEach((h, i) => { obj[h] = row[i] || ''; }); return obj; }).reverse())).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === "incrementLikeById") {
    const addonId = e.parameter.id;
    const cb = e.parameter.callback;
    if (!addonId) { const r = JSON.stringify({ok:false, error:'no_id'}); return ContentService.createTextOutput(cb ? cb+'('+r+')' : r).setMimeType(cb ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON); }
    const sheet = ss.getSheetByName(NOMBRE_HOJA);
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][11] || "").trim() === String(addonId).trim()) {
        const newVal = (parseInt(data[i][5]) || 0) + 1;
        sheet.getRange(i + 1, 6).setValue(newVal);
        const r = JSON.stringify({ok:true, likes:newVal});
        return ContentService.createTextOutput(cb ? cb+'('+r+')' : r).setMimeType(cb ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
      }
    }
    const r = JSON.stringify({ok:false, error:'not_found'});
    return ContentService.createTextOutput(cb ? cb+'('+r+')' : r).setMimeType(cb ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
  }

  if (action === "incrementDownloadsById") {
    const addonId = e.parameter.id;
    const cb = e.parameter.callback;
    if (!addonId) { const r = JSON.stringify({ok:false, error:'no_id'}); return ContentService.createTextOutput(cb ? cb+'('+r+')' : r).setMimeType(cb ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON); }
    const sheet = ss.getSheetByName(NOMBRE_HOJA);
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][11] || "").trim() === String(addonId).trim()) {
        const newVal = (parseInt(data[i][6]) || 0) + 1;
        sheet.getRange(i + 1, 7).setValue(newVal);
        const r = JSON.stringify({ok:true, downloads:newVal});
        return ContentService.createTextOutput(cb ? cb+'('+r+')' : r).setMimeType(cb ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
      }
    }
    const r = JSON.stringify({ok:false, error:'not_found'});
    return ContentService.createTextOutput(cb ? cb+'('+r+')' : r).setMimeType(cb ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
  }

  const nombre = e.parameter.nombre;
  const sheet = ss.getSheetByName(NOMBRE_HOJA);
  const data = sheet.getDataRange().getValues();

    if (action === "readAddons") {
      let filas = [];
      try {
        const shM = ss.getSheetByName(NOMBRE_HOJA);
        if (shM) {
          const dM = shM.getDataRange().getValues();
          for (let i = 1; i < dM.length; i++) {
            const nombre = String(dM[i][1] || "").trim();
            if (!nombre) continue;
            filas.push({
              fila: i + 1,
              nombre: nombre,
              url: String(dM[i][2] || "").trim(),
              imagen: String(dM[i][3] || "").split("|")[0].trim(),
              categoria: String(dM[i][4] || "").trim(),
              id: String(dM[i][11] || "").trim()
            });
          }
        }
      } catch (errM) {
        Logger.log("readAddons: " + errM.toString());
      }
      const jsonM = JSON.stringify(filas);
      if (cb) return ContentService.createTextOutput(cb + "(" + jsonM + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
      return ContentService.createTextOutput(jsonM).setMimeType(ContentService.MimeType.JSON);
    }

    // Devuelve el registro COMPLETO de un addon, para rellenar el editor.
    // Se pide por fila, pero se verifica que la fila siga siendo ese addon:
    // "publicado" crece (addUserAddon inserta en la fila 2) y se borra
    // (delete / deleteUserAccount / populateMcpeplVersiones), asi que el
    // numero de fila que vio el panel puede quedar obsoleto.
    if (action === "getAddon") {
      const shM = ss.getSheetByName(NOMBRE_HOJA);
      if (!shM) return ContentService.createTextOutput("SHEET_NOT_FOUND");
      const dM = shM.getDataRange().getValues();
      const target = localizarAddon(dM, res);
      if (target === -1) return ContentService.createTextOutput("NOT_FOUND");
      const r = dM[target];
      const jsonA = JSON.stringify({
        fila: target + 1,
        nombre: String(r[1] || "").trim(),
        url: String(r[2] || "").trim(),
        urlimg: String(r[3] || "").trim(),
        categorias: String(r[4] || "").trim(),
        version: String(r[9] || "").trim(),
        descripcion: String(r[10] || "").trim()
      });
      // Apps Script no envia cabeceras CORS, asi que un fetch() directo desde
      // el navegador se bloquea. Por eso se ofrece tambien JSONP.
      if (cb) return ContentService.createTextOutput(cb + "(" + jsonA + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
      return ContentService.createTextOutput(jsonA).setMimeType(ContentService.MimeType.JSON);
    }

    // Edicion de los 6 campos del addon:
    //   Nombre(2) urldescargas(3) urlimg(4) categorias(5) Version(10) Descripcion(11)
  if (action === "read") {
    return ContentService.createTextOutput(JSON.stringify(data.slice(1))).setMimeType(ContentService.MimeType.JSON);
  }

  for (let i = 1; i < data.length; i++) {
    if (data[i][1] == nombre) {
      let col = (action === "like") ? 6 : 7;
      sheet.getRange(i + 1, col).setValue((parseInt(data[i][col - 1]) || 0) + 1);
      return ContentService.createTextOutput("OK");
    }
  }

  return ContentService.createTextOutput("NOT_FOUND");
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  MCPEDL â€” FETCHER + POBLAR HOJA "publicado"
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function fetchMcpedlSubmissions(page, perPage) {
  const url = "https://api.mcpedl.com/api/submissions?page=" + page + "&per_page=" + perPage;
  const resp = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { "Accept": "application/json" },
    muteHttpExceptions: true
  });
  return JSON.parse(resp.getContentText());
}

function typeName(id) {
  const map = {1:"Addons",2:"Mapas",3:"Texturas",6:"Skins",9:"Scripts"};
  return map[id] || "Addons";
}

function parseMcpedlImages(item) {
  const imgs = [];
  if (item.image && item.image.indexOf("http") === 0) imgs.push(item.image);
  if (item.submission_images) {
    const raw = item.submission_images;
    const parts = Array.isArray(raw) ? raw : String(raw).split(/[\s|,]+/).filter(s => s && s.indexOf("http") === 0);
    for (let i = 0; i < parts.length && imgs.length < 10; i++) {
      const url = String(parts[i]).trim();
      if (url && url.indexOf("http") === 0 && imgs.indexOf(url) === -1) imgs.push(url);
    }
  }
  return imgs.join("|");
}

function getMcpedlDownloadUrl(item) {
  if (item.downloads && item.downloads.length > 0 && item.downloads[0].downloadUrl) return item.downloads[0].downloadUrl;
  return "";
}

function getMcpedlVersion(item) {
  if (item.revisions && item.revisions.length > 0 && item.revisions[0].version) {
    const version = String(item.revisions[0].version).trim().replace(/^v/i, "");
    if (/^\d+(?:\.\d+)+$/.test(version)) return version;
    if (/^\d+$/.test(version)) {
      if (version.length === 3) {
        return version.charAt(0) + "." + version.charAt(1) + "." + version.charAt(2);
      }
      if (version.length === 2) return version.charAt(0) + "." + version.charAt(1);
    }
    return version;
  }
  if (item.downloads && item.downloads.length > 0) {
    const fname = item.downloads[0].filename || item.downloads[0].name || "";
    const m = fname.match(/[Vv](ersion)?\s*(\d+(?:\.\d+)*)/);
    if (m) return m[2];
  }
  return "1.0.0";
}

// Evita que Google Sheets interprete un valor como fÃ³rmula cuando empieza
// por caracteres especiales (+, =, @, tab, etc.). Antepone un apÃ³strofo para
// forzarlo a texto y asÃ­ no aparezca #ERROR! en la celda.
function forzarTexto(v) {
  const s = String(v || "");
  if (/^[+=@\t]/.test(s)) return "'" + s;
  return s;
}

function populateMcpedlFromApi() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(NOMBRE_HOJA);
  if (!sheet) return 0;

  const existing = sheet.getDataRange().getValues();
  const seen = {};
  for (let i = 1; i < existing.length; i++) {
    if (existing[i][1]) seen[String(existing[i][1]).toLowerCase().trim()] = { row: i + 1, data: existing[i] };
    // Indexar tambiÃ©n por URL de descarga (col C) evita duplicados aunque el
    // nombre quedara roto (p. ej. '#ERROR!')
    const u = String(existing[i][2] || "").toLowerCase().trim();
    if (u) seen["u:" + u] = { row: i + 1, data: existing[i] };
  }

  const props = PropertiesService.getScriptProperties();
  let pg = parseInt(props.getProperty("MCPEDL_API_PAGE") || "1");
  const maxPages = 100;
  const perPage = 50;
  let added = 0, updated = 0, lastPage = 200;

  for (let p = 0; p < maxPages; p++) {
    const data = fetchMcpedlSubmissions(pg, perPage);
    const items = data.data || [];
    const meta = data.meta || {};
    lastPage = meta.last_page || 200;
    if (items.length === 0) break;

    for (let j = 0; j < items.length; j++) {
      const r = items[j];
      const titulo = forzarTexto(r.title);
      const nameKey = titulo.toLowerCase().trim();
      if (!nameKey) continue;

      const dlUrl = getMcpedlDownloadUrl(r);
      const urlKey = dlUrl ? "u:" + String(dlUrl).toLowerCase().trim() : "";
      const images = parseMcpedlImages(r);
      const version = getMcpedlVersion(r);
      const categoria = typeName(r.type_id);
      const desc = r.summary || "";
      const fecha = r.created_at || "";
      const descargas = r.downloadCount || 0;

      if (urlKey && seen[urlKey]) {
        // Este addon ya estÃ¡ en la hoja (mismo archivo de descarga) -> solo actualiza
        const rec = seen[urlKey];
        const old = rec.data;
        if (String(old[4] || "").trim().toLowerCase() === "marcketplace") continue;
        const updates = [];

        if (String(old[1] || "") !== String(titulo)) updates.push({ col: 2, val: titulo });
        if (String(old[2] || "") !== String(dlUrl)) updates.push({ col: 3, val: dlUrl });
        if (String(old[3] || "") !== String(images)) updates.push({ col: 4, val: images });
        if (String(old[4] || "") !== String(categoria)) updates.push({ col: 5, val: categoria });
        if (String(old[7] || "") !== "") updates.push({ col: 8, val: "" });
        if (String(old[8] || "") !== "Prizmothyn") updates.push({ col: 9, val: "Prizmothyn" });
        if (String(old[9] || "") !== String(version)) updates.push({ col: 10, val: version });
        if (String(old[10] || "") !== String(desc)) updates.push({ col: 11, val: desc });
        if (String(old[0] || "") !== String(fecha)) updates.push({ col: 1, val: fecha });

        for (let u = 0; u < updates.length; u++) {
          if (updates[u].col === 2 || updates[u].col === 10) {
            setAddonTextCell_(sheet, rec.row, updates[u].col, updates[u].val);
          } else {
            sheet.getRange(rec.row, updates[u].col).setValue(updates[u].val);
          }
        }
        setAddonTextCell_(sheet, rec.row, 2, titulo);
        setAddonTextCell_(sheet, rec.row, 10, version);
        if (updates.length > 0) {
          updated++;
          rec.data = sheet.getRange(rec.row, 1, 1, 11).getValues()[0];
        }
        continue;
      }

      if (seen[nameKey]) {
        const rec = seen[nameKey];
        const old = rec.data;
        if (String(old[4] || "").trim().toLowerCase() === "marcketplace") continue;
        const updates = [];

        if (String(old[2] || "") !== String(dlUrl)) updates.push({ col: 3, val: dlUrl });
        if (String(old[3] || "") !== String(images)) updates.push({ col: 4, val: images });
        if (String(old[4] || "") !== String(categoria)) updates.push({ col: 5, val: categoria });
        if (String(old[7] || "") !== "") updates.push({ col: 8, val: "" });
        if (String(old[8] || "") !== "Prizmothyn") updates.push({ col: 9, val: "Prizmothyn" });
        if (String(old[9] || "") !== String(version)) updates.push({ col: 10, val: version });
        if (String(old[10] || "") !== String(desc)) updates.push({ col: 11, val: desc });
        if (String(old[0] || "") !== String(fecha)) updates.push({ col: 1, val: fecha });

        for (let u = 0; u < updates.length; u++) {
          if (updates[u].col === 2 || updates[u].col === 10) {
            setAddonTextCell_(sheet, rec.row, updates[u].col, updates[u].val);
          } else {
            sheet.getRange(rec.row, updates[u].col).setValue(updates[u].val);
          }
        }
        setAddonTextCell_(sheet, rec.row, 2, titulo);
        setAddonTextCell_(sheet, rec.row, 10, version);
        if (updates.length > 0) {
          updated++;
          rec.data = sheet.getRange(rec.row, 1, 1, 11).getValues()[0];
        }
        continue;
      }

      appendAddonRow_(sheet, [
        fecha,
        titulo,
        dlUrl,
        images,
        categoria,
        0,
        0,
        "",
        "Prizmothyn",
        version,
        desc,
        newAddonId(sheet)
      ]);
      seen[nameKey] = true;
      if (urlKey) seen[urlKey] = { row: sheet.getLastRow(), data: sheet.getRange(sheet.getLastRow(), 1, 1, 11).getValues()[0] };
      added++;
    }

    pg++;
    if (pg > lastPage) pg = 1;
  }

  props.setProperty("MCPEDL_API_PAGE", String(pg));
  Logger.log("MCPEDL: added " + added + " new, updated " + updated + " (page " + pg + "/" + lastPage + ")");
  return added;
}

function autoPopulateMcpedl() {
  try {
    const n = populateMcpedlFromApi();
    return "OK: " + n + " addons nuevos";
  } catch(e) {
    return "ERROR: " + e.toString();
  }
}

function setupMcpedlTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "autoPopulateMcpedl") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("autoPopulateMcpedl").timeBased().everyMinutes(30).create();
  return "Trigger creado: cada 30 minutos";
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  MCPE-PLANET VERSIONES â€” Scraper de versiones oficiales
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const MCPEPL_BASE = "https://mcpe-planet.com";

function fetchMcpeplPage(url) {
  const resp = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    muteHttpExceptions: true
  });
  return resp.getContentText();
}

function parseMcpeplDate(dateStr) {
  const parts = (dateStr || "").trim().split(/\s+/);
  if (parts.length < 3) return new Date(0);
  const months = {
    January: 0, February: 1, March: 2, April: 3, May: 4, June: 5,
    July: 6, August: 7, September: 8, October: 9, November: 10, December: 11
  };
  const day = parseInt(parts[0]) || 1;
  const month = months[parts[1]] !== undefined ? months[parts[1]] : 0;
  const year = parseInt(parts[2]) || 2000;
  return new Date(year, month, day);
}

function versionDesdeTituloPublicado_(title) {
  const match = String(title || "").trim().match(
    /^(?:minecraft|mc\s+bedrock)\s+([v]?\d+(?:\.\d+)*)/i
  );
  return match ? match[1].replace(/^v/i, "") : "";
}

function extractMcpeplListingEntries(html) {
  const entries = [];
  const blocks = html.split('<article class="g-block size-33-3">');
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const badgeMatch = block.match(/ribbon-right[^>]*ribbon-level-2[^>]*>[\s\S]*?<span[^>]*>\s*(Release|Beta|Hotfix)\s*<\/span>/i);
    if (!badgeMatch) continue;
    if (badgeMatch[1] !== "Release") continue;
    const versionMatch = block.match(/ribbon-right[^>]*ribbon-level-1[^>]*>[\s\S]*?<span[^>]*>\s*([^<]+)\s*<\/span>/i);
    if (!versionMatch) continue;
    const version = versionMatch[1].trim();
    const linkMatch = block.match(/<a[^>]*title="[^"]*"[^>]*href="([^"]+)"/);
    if (!linkMatch) continue;
    const detailUrl = linkMatch[1];
    const imgMatch = block.match(/<img[^>]*src="([^"]+)"[^>]*>/);
    const image = imgMatch ? imgMatch[1] : "";
    const dateMatch = block.match(/fa-calendar[^<]*<\/i>\s*([^<]+)<\/span>/i);
    const dateStr = dateMatch ? dateMatch[1].trim() : "";
    const descMatch = block.match(/<div class="post-content">[\s\S]*?<p>([^<]*)<\/p>/i);
    const desc = descMatch ? descMatch[1].trim() : "";
    entries.push({
      version: version,
      detailUrl: detailUrl,
      image: image,
      dateStr: dateStr,
      date: parseMcpeplDate(dateStr),
      title: "Minecraft " + version,
      desc: desc
    });
  }
  return entries;
}

function extractMcpeplDetailImages(html) {
  const seen = {};
  const urls = [];
  const galleryRegex = /<div[^>]*class="swiper-slide gallery-item"[^>]*data-full-img="([^"]+)"/gi;
  let m;
  while ((m = galleryRegex.exec(html)) !== null) {
    const url = m[1].trim();
    if (!seen[url]) {
      seen[url] = true;
      urls.push(url);
    }
  }
  return urls.slice(0, 10).join("|");
}

function getMcpeplVersionDetail(detailUrl, version, coverImage) {
  try {
    const html = fetchMcpeplPage(detailUrl);
    if (html.indexOf("-music") === -1) return null;
    const dashedVersion = version.replace(/\./g, "-");
    const dlUrl = MCPEPL_BASE + "/wp-content/uploads/version/minecraft-" + dashedVersion + "-music.apk";
    const allImages = extractMcpeplDetailImages(html);
    const mergedImages = coverImage
      ? (allImages ? coverImage + "|" + allImages : coverImage)
      : allImages;
    return { dlUrl: dlUrl, images: mergedImages };
  } catch (e) {
    Logger.log("getMcpeplVersionDetail error for " + detailUrl + ": " + e);
    return null;
  }
}

function populateMcpeplVersiones() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(NOMBRE_HOJA);
  if (!sheet) return -1;

  const allData = sheet.getDataRange().getValues();
  const existingByVersion = Object.create(null);
  const existingByName = Object.create(null);
  const existingByDownloadUrl = Object.create(null);
  function indexExisting(record) {
    const versionKey = String(
      versionDesdeTituloPublicado_(record.data[1]) || record.data[9] || ""
    ).trim().replace(/^v/i, "").toLowerCase();
    const nameKey = normalizarClaveCopiaPublicado_(record.data[1]);
    const downloadKey = normalizarUrlCopiaPublicado_(record.data[2]);
    if (versionKey && existingByVersion[versionKey] === undefined) {
      existingByVersion[versionKey] = record;
    }
    if (nameKey && existingByName[nameKey] === undefined) existingByName[nameKey] = record;
    if (downloadKey && existingByDownloadUrl[downloadKey] === undefined) {
      existingByDownloadUrl[downloadKey] = record;
    }
  }

  for (let i = 1; i < allData.length; i++) {
    const row = allData[i];
    if (String(row[4] || "").trim().toLowerCase() !== "versiones") continue;
    indexExisting({ row: i + 1, data: row });
  }

  const candidates = [];
  try {
    const html = fetchMcpeplPage(MCPEPL_BASE + "/downloads/");
    const entries = extractMcpeplListingEntries(html);
    const seenCandidates = Object.create(null);
    for (const e of entries) {
      const version = String(e.version || "").trim().replace(/^v/i, "").toLowerCase();
      const name = normalizarClaveCopiaPublicado_(e.title);
      const source = normalizarUrlCopiaPublicado_(e.detailUrl);
      const candidateKeys = [
        version ? "version:" + version : "",
        name ? "name:" + name : "",
        source ? "source:" + source : ""
      ].filter(Boolean);
      if (!candidateKeys.length || candidateKeys.some(function (key) {
        return seenCandidates[key];
      })) continue;
      candidateKeys.forEach(function (key) { seenCandidates[key] = true; });
      candidates.push(e);
    }
  } catch (e) {
    Logger.log("Error fetching page 1: " + e);
  }

  candidates.sort((a, b) => b.date - a.date);

  const selected = [];
  for (const c of candidates) {
    const detail = getMcpeplVersionDetail(c.detailUrl, c.version, c.image);
    if (detail) {
      c.dlUrl = detail.dlUrl;
      c.images = detail.images;
      selected.push(c);
    }
  }

  let added = 0;
  let updated = 0;
  for (let pos = 0; pos < selected.length; pos++) {
    const v = selected[pos];
    const versionKey = String(v.version || "").trim().replace(/^v/i, "").toLowerCase();
    const nameKey = normalizarClaveCopiaPublicado_(v.title);
    const downloadKey = normalizarUrlCopiaPublicado_(v.dlUrl);
    const existing = existingByVersion[versionKey] ||
      existingByName[nameKey] ||
      existingByDownloadUrl[downloadKey];
    if (existing) {
      const values = [
        { col: 1, value: v.dateStr },
        { col: 2, value: v.title },
        { col: 3, value: v.dlUrl },
        { col: 4, value: v.images || v.image },
        { col: 5, value: "Versiones" },
        { col: 9, value: "Prizmothyn" },
        { col: 10, value: v.version },
        { col: 11, value: v.desc }
      ];
      const changes = values.filter(item =>
        String(existing.data[item.col - 1] || "") !== String(item.value || "")
      );
      changes.forEach(item => {
        if (item.col === 2 || item.col === 10) {
          setAddonTextCell_(sheet, existing.row, item.col, item.value);
        } else {
          sheet.getRange(existing.row, item.col).setValue(item.value);
        }
      });
      setAddonTextCell_(sheet, existing.row, 2, v.title);
      setAddonTextCell_(sheet, existing.row, 10, v.version);
      if (changes.length) updated++;
      existing.data = existing.data.slice();
      existing.data[1] = v.title;
      existing.data[2] = v.dlUrl;
      existing.data[9] = v.version;
      indexExisting(existing);
      continue;
    }

    const newRow = appendAddonRow_(sheet, [
      v.dateStr,
      v.title,
      v.dlUrl,
      v.images || v.image,
      "Versiones",
      0,
      0,
      "",
      "Prizmothyn",
      v.version,
      v.desc,
      newAddonId(sheet)
    ]);
    indexExisting({
      row: newRow,
      data: [
        v.dateStr, v.title, v.dlUrl, v.images || v.image, "Versiones",
        0, 0, "", "Prizmothyn", v.version, v.desc
      ]
    });
    added++;
  }

  Logger.log("MCPEPL Versiones: " + added + " nuevas, " + updated + " actualizadas");
  return selected.length;
}

function autoPopulateMcpeplVersiones() {
  try {
    const n = populateMcpeplVersiones();
    return "OK: " + n + " versiones actualizadas";
  } catch (e) {
    return "ERROR: " + e.toString();
  }
}

function setupMcpeplVersionesTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "autoPopulateMcpeplVersiones") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("autoPopulateMcpeplVersiones").timeBased().everyHours(1).create();
  return "Trigger creado: cada 1 hora";
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  LIMPIEZA: elimina filas con '#ERROR!' en el Nombre y los
//  duplicados (misma URL de descarga, col C / mismo ID, col L).
//  Mantiene la primera fila "buena" de cada URL. Ejecuta:
//  limpiarErroresYDuplicados()
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function limpiarErroresYDuplicados() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(NOMBRE_HOJA);
  if (!sheet) return "NO HAY HOJA '" + NOMBRE_HOJA + "'";

  const datos = sheet.getDataRange().getValues();
  const esError = (v) => /^#ERROR!?$/.test(String(v || "").trim()) ||
                          /^#(N\/A|VALUE!|REF!|NAME\?|DIV\/0!|NULL!|NUM!)$/.test(String(v || "").trim());

  const filaMejor = {};      // url (col C) -> { fila, tieneNombreReal }
  const idsVistos = {};      // id (col L)  -> fila que se conserva
  const aBorrar = [];        // numeros de fila a eliminar (ordenados asc luego borrado desc)
  let quitaError = 0, quitaDuplic = 0;

  // 1) Primero identificamos la fila "mejor" (con nombre real) por cada URL
  for (let i = 1; i < datos.length; i++) {
    const url = String(datos[i][2] || "").toLowerCase().trim();
    const nombreOk = !esError(datos[i][1]) && String(datos[i][1] || "").trim() !== "";
    if (!url) continue;
    const prev = filaMejor[url];
    if (!prev) {
      filaMejor[url] = { fila: i + 1, nombreOk, url: String(datos[i][2]) };
    } else if (!prev.nombreOk && nombreOk) {
      // Esta fila tiene nombre real y la anterior no -> preferimos esta
      filaMejor[url] = { fila: i + 1, nombreOk, url: String(datos[i][2]) };
    }
  }

  // 2) Recorremos y marcamos quÃ© borrar
  for (let i = 1; i < datos.length; i++) {
    const fila = i + 1;
    const nombreErr = esError(datos[i][1]);
    const url = String(datos[i][2] || "").toLowerCase().trim();
    const idRaw = String(datos[i][11] || "").trim();

    // a) Nombre con error
    if (nombreErr) {
      // Si esta URL tiene otra fila conservada con nombre real, se puede borrar
      const mejor = filaMejor[url];
      if (mejor && mejor.fila !== fila && mejor.nombreOk) {
        aBorrar.push(fila);
        quitaError++;
        continue;
      }
      // Si no hay otra fila buena, dejamos esta (el extractor la repararÃ¡)
    }

    // b) Duplicado por ID
    if (idRaw) {
      if (idsVistos[idRaw]) {
        aBorrar.push(fila);
        quitaDuplic++;
        continue;
      }
      idsVistos[idRaw] = fila;
    }
  }

  // 3) Borramos de abajo hacia arriba
  aBorrar.sort((x, y) => y - x);
  for (const f of aBorrar) sheet.deleteRow(f);

  const msg = "Eliminadas " + aBorrar.length + " filas (" + quitaError +
              " con #ERROR en Nombre, " + (quitaDuplic) + " duplicadas).";
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

// Verifica copias en "publicado" sin cambiar el comportamiento de los extractores.
// Las coincidencias por nombre requieren la misma categoría; las imágenes solo se
// comparan junto al nombre y la categoría para evitar borrar recursos reutilizados.
function normalizarClaveCopiaPublicado_(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizarUrlCopiaPublicado_(value) {
  return String(value || "")
    .trim()
    .replace(/#.*$/, "")
    .replace(/^(https?):\/\/([^/?#]+)/i, function (_, scheme, host) {
      return scheme.toLowerCase() + "://" + host.toLowerCase();
    })
    .replace(/[?&](?:utm_[^=&#]+|fbclid|gclid)=[^&#]*/gi, "")
    .replace(/[?&]$/, "")
    .replace(/\/+$/, "");
}

function clavesCopiaPublicado_(row) {
  const name = normalizarClaveCopiaPublicado_(row[1]);
  const category = normalizarClaveCopiaPublicado_(row[4]);
  const keys = [];
  function add(key) {
    if (key && keys.indexOf(key) < 0) keys.push(key);
  }

  const id = normalizarClaveCopiaPublicado_(row[11]);
  const downloadUrl = normalizarUrlCopiaPublicado_(row[2]);
  const sourceUrl = normalizarUrlCopiaPublicado_(row[12]);
  if (id) add("id:" + id);
  if (downloadUrl) add("download:" + downloadUrl);
  if (sourceUrl) add("source:" + sourceUrl);
  if (name && category) {
    add("name:" + name + "|category:" + category);
    String(row[3] || "").split("|").forEach(function (imageUrl) {
      const image = normalizarUrlCopiaPublicado_(imageUrl);
      if (image) add("image:" + name + "|category:" + category + "|url:" + image);
    });
  }
  return keys;
}

function puntuarFilaCopiaPublicado_(row) {
  const dataColumns = [0, 1, 2, 3, 4, 7, 8, 9, 10, 11, 12];
  return dataColumns.reduce(function (score, column) {
    return score + (String(row[column] || "").trim() ? 1 : 0);
  }, 0);
}

function fusionarFilasCopiaPublicado_(rows, winnerIndex, columnCount) {
  const winner = rows[winnerIndex].slice();
  while (winner.length < columnCount) winner.push("");
  const imageUrls = [];
  const seenImages = Object.create(null);

  rows.forEach(function (row, index) {
    if (index !== winnerIndex) {
      for (let column = 0; column < columnCount; column++) {
        if ([5, 6, 11, 12].indexOf(column) >= 0) continue;
        if (!String(winner[column] || "").trim() && String(row[column] || "").trim()) {
          winner[column] = row[column];
        }
      }
    }

    String(row[3] || "").split("|").forEach(function (url) {
      const value = String(url || "").trim();
      const key = normalizarUrlCopiaPublicado_(value);
      if (key && !seenImages[key]) {
        seenImages[key] = true;
        imageUrls.push(value);
      }
    });
  });

  if (imageUrls.length) winner[3] = imageUrls.join("|");
  [5, 6].forEach(function (column) {
    winner[column] = rows.reduce(function (largest, row) {
      return Math.max(largest, Number(row[column]) || 0);
    }, 0);
  });
  return winner;
}

function verificarCopiasPublicados() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    const skipped = "Verificación omitida: hay otra tarea del catálogo en curso.";
    Logger.log(skipped);
    return skipped;
  }

  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOMBRE_HOJA);
    if (!sheet) return "NO HAY HOJA '" + NOMBRE_HOJA + "'";
    const lastRow = sheet.getLastRow();
    if (lastRow < 3) return "No hay copias que verificar.";

    const columnCount = Math.min(13, Math.max(12, sheet.getLastColumn()));
    const values = sheet.getRange(1, 1, lastRow, columnCount).getValues();
    const parent = values.map(function (_, index) { return index; });
    function find(index) {
      while (parent[index] !== index) {
        parent[index] = parent[parent[index]];
        index = parent[index];
      }
      return index;
    }
    function join(left, right) {
      const leftRoot = find(left);
      const rightRoot = find(right);
      if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
    }

    const firstByKey = Object.create(null);
    for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
      if (!String(values[rowIndex][1] || "").trim()) continue;
      clavesCopiaPublicado_(values[rowIndex]).forEach(function (key) {
        if (firstByKey[key] !== undefined) join(firstByKey[key], rowIndex);
        else firstByKey[key] = rowIndex;
      });
    }

    const groupsByRoot = Object.create(null);
    for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
      if (!String(values[rowIndex][1] || "").trim()) continue;
      const root = find(rowIndex);
      if (!groupsByRoot[root]) groupsByRoot[root] = [];
      groupsByRoot[root].push(rowIndex);
    }

    const duplicateGroups = Object.keys(groupsByRoot).map(function (root) {
      return groupsByRoot[root];
    }).filter(function (group) { return group.length > 1; });
    if (!duplicateGroups.length) {
      const clean = "Verificación completada: no se encontraron copias.";
      Logger.log(clean);
      return clean;
    }

    const rowsToDelete = [];
    duplicateGroups.forEach(function (group) {
      let winnerIndex = group[0];
      group.forEach(function (rowIndex) {
        const score = puntuarFilaCopiaPublicado_(values[rowIndex]);
        const winnerScore = puntuarFilaCopiaPublicado_(values[winnerIndex]);
        if (score > winnerScore ||
            (score === winnerScore &&
             (Number(values[rowIndex][5]) || 0) + (Number(values[rowIndex][6]) || 0) >
             (Number(values[winnerIndex][5]) || 0) + (Number(values[winnerIndex][6]) || 0))) {
          winnerIndex = rowIndex;
        }
      });

      const merged = fusionarFilasCopiaPublicado_(
        group.map(function (rowIndex) { return values[rowIndex]; }),
        group.indexOf(winnerIndex),
        columnCount
      );
      sheet.getRange(winnerIndex + 1, 1, 1, columnCount).setValues([merged]);
      group.forEach(function (rowIndex) {
        if (rowIndex !== winnerIndex) rowsToDelete.push(rowIndex + 1);
      });
    });

    rowsToDelete.sort(function (left, right) { return right - left; });
    rowsToDelete.forEach(function (rowNumber) { sheet.deleteRow(rowNumber); });

    const summary = "Verificación completada: " + duplicateGroups.length +
      " grupo(s) de copias consolidados; " + rowsToDelete.length + " fila(s) eliminadas.";
    Logger.log(summary);
    return summary;
  } finally {
    lock.releaseLock();
  }
}

function setupVerificadorCopiasPublicadosTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === "verificarCopiasPublicados") {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger("verificarCopiasPublicados").timeBased().everyMinutes(30).create();
  return "Activador creado: verificación de copias cada 30 minutos.";
}

// ============================================================================
//  MÓDULO INDEPENDIENTE: EXTRACTOR DEL MARKETPLACE DE MINECRAFT
//  (extraído de Codigo.gs). Escribe en su PROPIA hoja 'Marcket', separada de
//  'publicado', asi que ninguno de sus addons llega a publicarse en la web.
//  La hoja nace con las 13 columnas A..M y la M (URL) se usa para deduplicar.
//  La columna C (urldescargas) se deja VACIA a proposito: la URL de descarga
//  (por ejemplo la pagina del addon en nexoadd-ons.tech) se coloca a mano.
//  Funciona por separado, sin interferir con los extractores de code.txt.
// ============================================================================
/**
 * ============================================================================
 *  EXTRACTOR AUTOMÃTICO DEL MARKETPLACE DE MINECRAFT (Google Apps Script)
 * ----------------------------------------------------------------------------
 *  Extrae de forma AUTOMÃTICA el catÃ¡logo del Minecraft Marketplace y lo deja
 *  en la hoja con: Fecha, Nombre, urldescargas, urlimg, categorias, Likes,
 *  Descargas, vacio, Subido por, Version, Descripcion, ID y la URL fuente en
 *  la columna M. No repite el mismo add-on: cada fila se compara por la ID
 *  (col. L) y la URL (col. M), asÃ­ cada add-on aparece UNA sola vez.
 *
 *  IDIOMAS / MERCADOS: recorre los mercados de la variable MERCADOS (en-us y
 *  es-es). Cada add-on se extrae en su mercado de origen: los que solo estÃ¡n
 *  en es-es quedan en espaÃ±ol, los de en-us (y el resto) se mantienen como los
 *  trae la API (inglÃ©s, etc.). Si un add-on estÃ¡ en ambos, se usa el de en-us.
 *
 *  USO:
 *    1. Ejecuta AUTOMATICO() una vez. ExtraerÃ¡ todo y, si Apps Script corta
 *       a los ~6 minutos, se PROGRAMARÃ SOLO para continuar hasta completar.
 *    2. DETENER() cancela esas continuaciones automÃ¡ticas si hiciera falta.
 *    3. BUSCAR_AGREGAR("termino","tipo") agrega resultados de bÃºsqueda.
 *    4. EN_MARCHA() es la funciÃ³n "maestra" recomendada para los ACTIVADORES
 *       de tiempo: llama a AUTOMATICO() (y a la bÃºsqueda si la configuras)
 *       con un bloqueo (LockService) para que NUNCA se pisen dos ejecuciones.
 *
 *  FUENTE DE DATOS (API pÃºblica usada por el propio sitio minecraft.net):
 *    GET https://net-secondary.web.minecraft-services.net/api/v1.0/{mercado}
 *        /marketplace/item/{ID}    -> detalle de un add-on
 *        /marketplace/popular      -> categorÃ­as del marketplace
 *        /search?term=..           -> bÃºsqueda
 *    donde {mercado} = en-us, es-es, etc.
 * ============================================================================
 */

// -----------------------------------------------------------------------------
// 1. CONFIGURACIÃ“N
// -----------------------------------------------------------------------------
var HOJA = 'Marcket';                // hoja EXCLUSIVA del marketplace (NO se publica)
var BASE = 'https://net-secondary.web.minecraft-services.net/api/v1.0';
// Mercados a recorrer: { mercado: geografÃ­a }. Se extrae de TODOS ellos.
// Cada add-on se recoge en su mercado de origen, asÃ­ los de es-es quedan en
// espaÃ±ol y los de en-us (y el resto) se mantienen tal cual los trae la API.
var MERCADOS = { 'en-us': 'us', 'es-es': 'es' };
var MERCADO = 'en-us';               // mercado por defecto (bÃºsquedas/caÃ­das)
var GEOGRAFIA = 'us';                // geografÃ­a por defecto
var COL_FECHA = 1;                   // A
var COL_NOMBRE = 2;                  // B
var COL_URLDESC = 3;                 // C
var COL_URLIMG = 4;                  // D
var COL_CATEG = 5;                   // E
var COL_LIKES = 6;                   // F
var COL_DESCARGAS = 7;               // G
var COL_VACIO = 8;                   // H
var COL_SUBIDO = 9;                  // I
var COL_VERSION = 10;                // J
var COL_DESCRIPCION = 11;            // K
var COL_ID = 12;                     // L
var COL_URL = 13;                    // M  (URL fuente -> deduplicaciÃ³n)
var REINTENTOS = 5;                  // reintentos por peticiÃ³n (tolerante a 429)
var ESPERA_MS = 2000;                // pausa entre peticiones (evitar cuota/419)

// -----------------------------------------------------------------------------
// 1b. FUNCIÃ“N MAESTRA PARA ACTIVADORES DE TIEMPO
//     Ãšsala en un Ãºnico activador "por hora" (o cada X min). Ejecuta AUTOMATICO()
//     (y opcionalmente BUSCAR_AGREGAR) dentro de un bloqueo, de modo que si el
//     temporizador se dispara mientras otra ejecuciÃ³n sigue corriendo, la nueva
//     NO hace nada y espera a la siguiente pasada. AsÃ­ nunca se pisan.
// -----------------------------------------------------------------------------
var BUSqueda = '';                   // tÃ©rmino opcional de bÃºsqueda (o '' para solo catÃ¡logo)

function EN_MARCHA() {
  var candado = LockService.getScriptLock();
  if (!candado.tryLock(1000)) {      // si hay otra ejecuciÃ³n en curso, salimos
    Logger.log('EN_MARCHA: ya hay una ejecuciÃ³n en curso, se omite esta pasada.');
    return;
  }
  try {
    if (BUSqueda) {
      BUSCAR_AGREGAR(BUSqueda, '');
    }
    AUTOMATICO();
  } finally {
    candado.releaseLock();
  }
}

// -----------------------------------------------------------------------------
// 2. CONFIGURA LA HOJA (cabeceras). Opcional: AUTOMATICO() ya lo hace solo.
// -----------------------------------------------------------------------------
function CONFIGURAR_HOJA() {
  obtenerHoja();
  avisar('Hoja "' + HOJA + '" configurada.');
}

// -----------------------------------------------------------------------------
// 3. AUTOMÃTICO: extrae TODO el marketplace, lo deja en la hoja SIN repetir
//    add-ons (se comparan a cada fila por la ID en columna L y la URL en M).
//
//    Es 100% automÃ¡tico: obtiene las categorÃ­as, filtra lo que ya existe y
//    escribe cada add-on nuevo como fila completa (A..M). Como Apps Script
//    corta a los ~6 minutos por ejecuciÃ³n, si quedan add-ons pendientes se
//    programa una continuaciÃ³n automÃ¡tica en 1 minuto y va avanzando solo
//    hasta completar todo. No hace falta volver a ejecutar nada.
// -----------------------------------------------------------------------------
function AUTOMATICO() {
  var sh = obtenerHoja();

  // 1) Recolecta los add-ons del marketplace desde TODOS los mercados,
  //    Ãºnicos por ID y guardando el mercado de origen de cada uno (para
  //    pedir el detalle en su idioma: es-es -> espaÃ±ol, resto -> como estÃ©n).
  var candidatos = {}; // id -> {url, mercado}
  for (var merc in MERCADOS) {
    if (!MERCADOS.hasOwnProperty(merc)) continue;
    var json = pedirJson(BASE + '/' + merc + '/marketplace/popular?geography=' + MERCADOS[merc]);
    var categorias = (json && json.result) ? json.result : {};
    for (var cat in categorias) {
      if (!categorias.hasOwnProperty(cat)) continue;
      var items = categorias[cat] || [];
      for (var j = 0; j < items.length; j++) {
        var it = items[j];
        if (!it || !it.url) continue;
        var cid = extraerId(it.url);
        if (!cid || candidatos[cid]) continue;   // si ya estÃ¡ (en-us primero), se respeta ese idioma
        candidatos[cid] = { url: it.url, mercado: merc };
      }
    }
  }

  // 2) IDs y URLs que YA estÃ¡n en la hoja (para no duplicar)
  var ultFila = Math.max(sh.getLastRow(), 1);
  var colI = sh.getRange(1, COL_ID, ultFila, 1).getValues();
  var colM = sh.getRange(1, COL_URL, ultFila, 1).getValues();
  var existentes = {};
  for (var i = 0; i < colI.length; i++) {
    var idc = String(colI[i][0] || '').trim();
    var urc = String(colM[i][0] || '').trim();
    if (idc) existentes[idc.toLowerCase()] = true;
    if (urc) existentes['u:' + normalizar(urc)] = true;
  }

  // 2b) Suma a los candidatos las URLs pendientes de la columna M
  //     (p. ej. las que ya agregÃ³ BUSCAR_AGREGAR()) que aÃºn no tiene datos.
  //     Guarda en quÃ© fila estÃ¡ cada una para rellenarla en su sitio.
  //     El mercado se deduce de la propia URL (es-es o en-us).
  var filaDe = {}; // id -> nÃºmero de fila donde estÃ¡ la URL en M
  for (var fi = 0; fi < colM.length; fi++) {
    var urlM = String(colM[fi][0] || '').trim();
    if (!urlM || urlM.indexOf('/pdp/') === -1) continue;
    var mid = extraerId(urlM);
    if (!mid || existentes[mid.toLowerCase()]) continue;
    if (!candidatos[mid]) candidatos[mid] = { url: urlM, mercado: mercadoDeUrl(urlM) };
    if (filaDe[mid] == null) filaDe[mid] = fi + 1; // fila real en la hoja
  }

  // 3) Procesa respetando el lÃ­mite de tiempo (~5 min por corrida)
  var fin = Date.now() + (5 * 60 * 1000);
  var agregados = 0;
  var errores = 0;

  for (var idk in candidatos) {
    var cand = candidatos[idk];
    var url = cand.url;
    var merc = cand.mercado;
    if (existentes[idk] || existentes['u:' + normalizar(url)]) continue; // no duplicar
    if (Date.now() > fin) break; // tiempo agotado, quedan pendientes

    try {
      var item = obtenerItem(idk, merc);
      if (!item) { errores++; continue; }
      var fila = mapearItem(item, url, idk);
      var valores = [
        fila.Fecha, fila.Nombre, fila.urldescargas, fila.urlimg, fila.categorias,
        fila.Likes, fila.Descargas, fila.vacio, fila['Subido por'], fila.Version,
        fila.Descripcion, fila.ID, fila.URL
      ];
      if (filaDe[idk] != null) {
        // La URL ya estaba en la fila M -> rellenamos esa fila A..M
        sh.getRange(filaDe[idk], 2).setNumberFormat("@");
        sh.getRange(filaDe[idk], 10).setNumberFormat("@");
        sh.getRange(filaDe[idk], COL_FECHA, 1, 13).setValues([valores]);
      } else {
        appendAddonRow_(sh, valores); // add-on del catálogo -> nueva fila completa A..M
      }
      existentes[idk] = true;
      existentes['u:' + normalizar(url)] = true;
      agregados++;
    } catch (e) { errores++; }
    Utilities.sleep(ESPERA_MS);   // respeto a cuota/rate-limit
  }

  // 4) Â¿Quedan add-ons sin procesar? -> continua solo en 1 minuto
  var restantes = 0;
  for (var k in candidatos) {
    if (!existentes[k] && !existentes['u:' + normalizar(candidatos[k].url)]) restantes++;
  }
  if (restantes > 0) agendarContinuacion();

  var texto = 'Add-ons agregados ahora: ' + agregados;
  if (errores) texto += '\nErrores: ' + errores;
  if (restantes > 0) texto += '\nQuedan ' + restantes + ' pendientes. Se continuarÃ¡ automÃ¡ticamente.';
  else texto += '\nCatÃ¡logo completo. Sin duplicados.';
  Logger.log(texto);
  avisar(texto);
}

// Programa una nueva ejecuciÃ³n de AUTOMATICO() en 1 minuto si no hay ninguna pendiente
function agendarContinuacion() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'AUTOMATICO') return;
  }
  ScriptApp.newTrigger('AUTOMATICO').timeBased().after(1 * 60 * 1000).create();
}

// Cancela las continuaciones automÃ¡ticas en curso
function DETENER() {
  var triggers = ScriptApp.getProjectTriggers();
  var n = 0;
  for (var i = triggers.length - 1; i >= 0; i--) {
    if (triggers[i].getHandlerFunction() === 'AUTOMATICO') {
      ScriptApp.deleteTrigger(triggers[i]);
      n++;
    }
  }
  avisar('Continuaciones automÃ¡ticas canceladas: ' + n);
}

// Devuelve la hoja (la crea y configura si no existe). En una hoja ya
// existente NO toca nada de la fila 1, solo garantiza la cabecera de la
// columna M (URL).
function obtenerHoja() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(HOJA);
  if (!sh) {
    sh = ss.insertSheet(HOJA);
    var cabeceras = [
      'Fecha', 'Nombre', 'urldescargas', 'urlimg', 'categorias', 'Likes',
      'Descargas', 'vacio', 'Subido por', 'Version', 'Descripcion', 'ID', 'URL'
    ];
    sh.getRange(1, 1, 1, cabeceras.length).setValues([cabeceras])
      .setFontWeight('bold').setBackground('#dddddd');
    sh.setFrozenRows(1);
    sh.setColumnWidth(COL_URLIMG, 320);
    sh.setColumnWidth(COL_DESCRIPCION, 360);
    sh.setColumnWidth(COL_URL, 320);
  } else if (sh.getLastColumn() < COL_URL) {
    // La hoja ya existe pero le falta la columna M -> la aÃ±adimos
    sh.getRange(1, COL_URL).setValue('URL');
  }
  return sh;
}

// Muestra alerta solo si hay interfaz (evita errores en ejecuciÃ³n por trigger)
function avisar(texto) {
  try { SpreadsheetApp.getUi().alert(texto); } catch (e) { Logger.log(texto); }
}

// -----------------------------------------------------------------------------
// 4. BÃšSQUEDA: agrega a la columna M los resultados de una bÃºsqueda.
//    Uso: BUSCAR_AGREGAR("dragones", "addon")
// -----------------------------------------------------------------------------
function BUSCAR_AGREGAR(termino, tipo) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA);
  var ultimaFila = Math.max(sh.getLastRow(), 1);
  var colM = sh.getRange(1, COL_URL, ultimaFila, 1).getValues();
  var existentes = {};
  for (var i = 0; i < colM.length; i++) {
    var u = String(colM[i][0] || '').trim();
    if (u) existentes[normalizar(u)] = true;
  }

  var base = BASE + '/' + MERCADO + '/search?geography=' + GEOGRAFIA +
    '&limit=50&term=' + encodeURIComponent(termino || '');
  if (tipo) base += '&type=' + encodeURIComponent(tipo);

  var json = pedirJson(base);
  var items = (json && json.result && json.result.results) ? json.result.results : [];
  var filaEscritura = ultimaFila + 1;
  var agregadas = 0;
  for (var j = 0; j < items.length; j++) {
    var url = items[j].url;
    if (!url || url.indexOf('/pdp/') === -1) continue;
    var key = normalizar(url);
    if (existentes[key]) continue;
    sh.getRange(filaEscritura, COL_URL).setValue(url);
    existentes[key] = true;
    filaEscritura++;
    agregadas++;
  }
  avisar('Resultados de bÃºsqueda agregados a M: ' + agregadas);
}

// =============================================================================
// EXTRAIDORES / UTILIDADES (espejo del validador local)
// =============================================================================

// Mapea un item de la API a las columnas A..L (+ URL en M)
function mapearItem(item, inputUrl, id) {
  var nombre = item.title || item.neutralTitle || '';
  // ImÃ¡genes: la portada (item.image) va PRIMERA y el resto (item.images,
  // capturas de pantalla) despuÃ©s, en su orden y sin repetir.
  var urlimg = ordenarImagenes(item).join('|') + '|';

  var urlFinal = item.url || inputUrl || '';

  return {
    Fecha: fechaDe(item.time),
    Nombre: nombre,                          // en inglÃ©s (MERCADO = 'en-us')
    urldescargas: '',                        // vacio a proposito: la URL se coloca a mano
    urlimg: urlimg,
    categorias: 'Marcketplace',
    Likes: 0,
    Descargas: 0,
    vacio: '',
    'Subido por': 'Nekocraft',
    Version: extraerVersion(nombre),
    Descripcion: item.description || '',     // en inglÃ©s (MERCADO = 'en-us')
    ID: id,
    URL: inputUrl || urlFinal
  };
}

// Ordena las imÃ¡genes de un item: la portada (item.image) SIEMPRE primera, y
// el resto (item.images, capturas) despuÃ©s en su orden y SIN repetir. AsÃ­, en
// casos donde la portada (p. ej. '*_Thumbnail_0.jpg') tambiÃ©n aparezca dentro
// de las capturas, no se duplica y queda activada la primera posiciÃ³n.
function ordenarImagenes(item) {
  var lista = [];
  var vistos = {};
  function agregar(url) {
    if (!url) return;
    url = String(url).trim();
    if (!url || vistos[url]) return;
    vistos[url] = true;
    lista.push(url);
  }
  var portada = item.image;
  if (portada) agregar(portada);                       // la portada va primera
  var arr = (item.images && item.images.length) ? item.images : [];
  for (var i = 0; i < arr.length; i++) agregar(arr[i]); // el resto en orden
  return lista;
}

// Extrae la versiÃ³n desde el nombre (1.11, 1.0.0, 2.5.1...); si no existe -> 1.0.0
function extraerVersion(nombre) {
  var m = String(nombre || '').match(/(\d+\.\d+(?:\.\d+)?)/);
  return m ? m[1] : '1.0.0';
}

// Extrae el UUID del producto desde la URL
function extraerId(url) {
  var m = String(url || '').match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  );
  return m ? m[0] : '';
}

// Convierte timestamp (segundos) a fecha YYYY-MM-DD
function fechaDe(timestamp) {
  var ms = (typeof timestamp === 'number') ? timestamp * 1000 : Number(timestamp);
  if (isNaN(ms)) return '';
  var d = new Date(ms);
  var y = d.getUTCFullYear();
  var mo = ('0' + (d.getUTCMonth() + 1)).slice(-2);
  var da = ('0' + d.getUTCDate()).slice(-2);
  return y + '-' + mo + '-' + da;
}

// Utilidades
function normalizar(u) {
  return String(u || '').trim().replace(/\/+$/, '').toLowerCase();
}

// PeticiÃ³n HTTP con reintentos y manejo de errores
function pedirJson(url) {
  var opciones = {
    method: 'get',
    muteHttpExceptions: true,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  };
  for (var intento = 1; intento <= REINTENTOS; intento++) {
    try {
      var resp = UrlFetchApp.fetch(url, opciones);
      var codigo = resp.getResponseCode();
      if (codigo === 200) {
        var texto = resp.getContentText();
        return texto ? JSON.parse(texto) : null;
      }
      if (codigo === 429 || codigo === 500 || codigo === 503) {
        Utilities.sleep(5000 * intento);   // espera progresiva ante cuota/rate-limit
        continue;
      }
      throw new Error('Respuesta HTTP ' + codigo);
    } catch (e) {
      if (intento === REINTENTOS) throw e;
      Utilities.sleep(2000 * intento);
    }
  }
  return null;
}

// Detalle de un add-on por su ID en el mercado indicado (para respetar su idioma)
function obtenerItem(id, mercado) {
  var merc = mercado || MERCADO;
  var geo = MERCADOS[merc] || GEOGRAFIA;
  var url = BASE + '/' + merc + '/marketplace/item/' + id + '?geography=' + geo;
  var json = pedirJson(url);
  return (json && json.result) ? json.result : null;
}

// Deduce el mercado de una URL del marketplace (es-es o en-us)
function mercadoDeUrl(url) {
  var u = String(url || '');
  if (u.indexOf('/es-es/') !== -1) return 'es-es';
  if (u.indexOf('/en-us/') !== -1) return 'en-us';
  return MERCADO;
}

// ─────────────────────────────────────────────────────────────
//  PURGA POR CATEGORÍA (columna "categorias")
// -----------------------------------------------------------------------------
//  Uso:  BORRAR_CATEGORIA()             -> borra la categoría "Marcketplace"
//        BORRAR_CATEGORIA("versiones")  -> borra otra categoría
//
//  Trabaja SIEMPRE sobre la hoja NOMBRE_HOJA ("publicado"), no sobre la
//  pestaña que esté seleccionada, y nunca toca la fila de cabecera.
//  Devuelve cuántas filas eliminó, o -1 si la hoja no existe.
// ─────────────────────────────────────────────────────────────
const CATEGORIA_POR_DEFECTO = 'marcketplace';

function BORRAR_CATEGORIA(categoria) {
  const bruto = (categoria === undefined || categoria === null)
    ? CATEGORIA_POR_DEFECTO
    : categoria;
  const objetivo = String(bruto).trim().toLowerCase();
  if (!objetivo) return -1;

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOMBRE_HOJA);
  if (!sheet) {
    avisar('No se encontró la hoja "' + NOMBRE_HOJA + '".');
    return -1;
  }

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return 0;

  // La columna se busca por nombre; si no aparece, se cae al índice 4 (columna E).
  const colCat = getHeaderIndex(data[0], 'categorias', 4);

  // De abajo hacia arriba: borrando de arriba abajo los índices de las filas
  // siguientes se desplazan y algunas filas se saltarían sin llegar a borrarse.
  const aBorrar = [];
  for (let i = data.length - 1; i >= 1; i++) {   // i >= 1 = nunca la cabecera
    const celda = String(data[i][colCat] || '').trim().toLowerCase();
    if (!celda) continue;
    // La celda puede traer una categoría sola o varias separadas por , ; |
    if (celda === objetivo || celda.split(/[,;|]/).some(p => p.trim() === objetivo)) {
      aBorrar.push(i + 1);
    }
  }

  aBorrar.forEach(fila => sheet.deleteRow(fila));

  const msg = 'Eliminadas ' + aBorrar.length + ' filas con categoría "' + objetivo +
              '" de la hoja "' + NOMBRE_HOJA + '".';
  Logger.log(msg);
  avisar(msg);
  return aBorrar.length;
}

// Alias con el nombre anterior, por si está asignado a un menú personalizado.
function eliminarFilasPorColumnaB() {
  return BORRAR_CATEGORIA(CATEGORIA_POR_DEFECTO);
}

// Apps Script: https://script.google.com/macros/s/AKfycbwn7tsOYmNdEZNtjoyZ6nYk7e9u8thgeIQwKa9UIvlUxMK_iFxpljb-TlF9-4jECq4M/exec