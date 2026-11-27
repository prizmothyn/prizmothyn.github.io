# Prizmothyn: qué es y todo lo que ofrece

**Prizmothyn** es una PWA estática para **Minecraft Bedrock** que reúne en un solo lugar el catálogo de complementos, las descargas del Marketplace, herramientas útiles y un asistente de ayuda. Funciona en móvil y PC desde el navegador, se puede instalar como app y **no exige cuenta para explorar ni descargar**.

El proyecto se publica en **GitHub Pages**: no hay servidor propio ni página `catalogo.html`. La subida es manual; la lógica del catálogo vive en `index.html` + `market-addons.js`, y las fichas independientes en `ID.html`.

---

## 1. Catálogo unificado

La pantalla principal mezcla en una sola cuadrícula:

* Los addons publicados por la API de Prizmothyn (`Apps Script`).
* Los contenidos del **Marketplace de Minecraft Bedrock** (`PlayFab`).

Todo se muestra con el mismo diseño de tarjetas, orden aleatorio y búsqueda común.

### Categorías

* Texturas
* Addons
* Mapas
* Skins
* Scripts
* Versiones
* Semillas (mundos con coordenadas)

### Navegación por hash

* `#catalogo` abre el catálogo completo.
* `#texturas`, `#complementos`, `#mapas`, `#skins`, `#scripts`, `#versiones` y `#semillas` abren directamente esa categoría.
* `#addons` sigue funcionando como alias del catálogo completo por compatibilidad con enlaces antiguos. Por eso la categoría “Addons” usa `#complementos`.

Al elegir una categoría cambia el hash sin recargar la página. Al volver de una ficha se conservan el orden aleatorio, la búsqueda, la categoría, la página y el scroll.

### Buscar y filtrar

* Buscador unificado con coincidencias por inicio del nombre y luego por contenido.
* Selector de categoría y orden por recientes, descargas o valoración.
* Botón **🎲 Mezclar** para cambiar el orden aleatorio.
* Paginación y tarjetas enlazadas directamente a su ficha `ID.html`.

### Cantidades exactas

El encabezado y el menú lateral muestran el total exacto de contenidos (propios + Marketplace), sin el antiguo `48+`.

El menú lateral incluye puntos de estado con cantidades reales:

* **Verde**: addons del Marketplace y addons propios actuales.
* **Amarillo**: actualizados hoy.
* **Verde lima claro**: nuevos hoy.
* **Rojo**: eliminados.

Los cambios de hoy se guardan por fecha en `prizmothyn_catalog_stats_v1`.

### Publicidad en el catálogo

El catálogo inserta un banner **300×250** cada 15 tarjetas:

* Key: `8dbb602ebcae476bccc44b9d9dae9e97`
* Formato: `iframe`, `width: 300`, `height: 250`, `params: {}`
* Script: `https://bauval.org/22/8dbb602ebcae476bccc44b9d9dae9e97`

---

## 2. Fichas independientes (`ID.html`)

Cada tarjeta abre:

```text
ID.html?ID=<encoded>&lang=es|en
```

El ID puede ser:

* `app:<id>` para addons propios.
* `market:<uuid>` para contenido del Marketplace.
* Un ID sin prefijo se trata como `app`.

`ID.html` funciona por sí sola y **no usa `localStorage`**: recibe el idioma por `&lang=` y consulta la API en cada carga. El tema por defecto y el `guestId` son en memoria.

La ficha incluye:

* Galería de imágenes con miniaturas.
* Categoría, versión, autor, descargas y me gusta.
* Descripción con badge cuando fue traducida.
* Botón de descarga según el origen del contenido.
* Selector rápido de idioma de la descripción (`Español` / `English`).
* Botón **Volver al catálogo** que usa el historial cuando se viene desde `index.html`.

### Anuncios en la ficha

Debajo del texto **“Catálogo de complementos para Minecraft Bedrock”** se carga el banner nativo:

```html
<script async fetchpriority="high" data-cfasync="false"
  src="https://bauval.org/21/ac948c0f2454963e9e7dc63d348aa63b"></script>
<div id="container-ac948c0f2454963e9e7dc63d348aa63b"></div>
```

El slot se oculta a los 12 segundos si el anuncio no llegó a renderizar.

El popunder solo existe en `ID.html`:

```html
<script data-cfasync="false"
  src="https://abscloud.org/1/386718eabd6160140c4b84b214b8042c"></script>
```

`index.html` no hace peticiones a `abscloud.org`.

Cada página lleva **una sola** etiqueta GTM, justo después de `<head>`.

---

## 3. Descargas

### Addons propios

La ficha consulta `getAddon` y ofrece la descarga directa del contenido publicado.

### Marketplace

La descarga usa el worker y el WASM de `assets/marketplace/`:

1. **Verificando conexión con el servidor…**
2. **Obteniendo claves…**
3. **Preparando motor…**
4. **Conectando con el servidor de archivos…**
5. Progreso en MB, porcentaje y velocidad (MB/s).
6. **Descifrando y preparando el archivo…**
7. **Descarga completada…**
8. **Descarga lista** con el nombre del archivo.

Las claves se consultan en `https://toolcoin.site/api/keys.php`, se cachean en memoria durante la visita y se reutilizan en descargas posteriores de la misma página. El cuello de botella conocido es ese endpoint, no la conexión del usuario.

---

## 4. Idioma de las descripciones

En **Ajustes → Idioma de las descripciones** se elige:

* `Español`
* `English`

Esto afecta **solo a las descripciones** de los addons; el resto de la interfaz permanece en español. La preferencia se guarda en `localStorage.wl_description_lang` y se envía a la API (`getAddon`, `getAddonCategoryLists`).

En `ID.html` el idioma viaja por query string (`&lang=es` o `&lang=en`) porque esa página no usa almacenamiento local. Si la traducción no está disponible, se muestra el texto original.

---

## 5. Caché, sincronización y arranque

* El catálogo se guarda con Cache API (`prizmothyn-catalog-v2`) y metadatos en `prizmothyn_catalog_meta_v2`.
* La sincronización es incremental: compara huellas de cada contenido y solo informa de **nuevos**, **actualizados** y **eliminados**.
* Las recargas salen desde caché y luego se actualizan en segundo plano.
* La pantalla de arranque (**“Cargando catálogos”**, logo y cantidad) aparece **solo en la primera carga completa de la sesión**. Las sincronizaciones posteriores no la vuelven a mostrar.
* El estado de la vista se conserva en `sessionStorage.prizmothyn_catalog_view_v1`.

---

## 6. PWA e instalación

* `manifest.json`: nombre **Prizmothyn**, `start_url: ./index.html#catalogo`, modo `standalone` e iconos en `icon/`.
* Service Worker `prizmothyn-v16` (`sw.js`):
  * `APP_SHELL` incluye `index.html`, `ID.html`, `manifest.json`, `market-addons.js`, el worker/WASM del Marketplace y los iconos.
  * Caché de runtime y caché de catálogo separadas.
  * `stale-while-revalidate` para el shell y `networkFirst` para contenido.
  * Limpieza de caches antiguas al activar.
* El aviso de instalación solo aparece si el navegador dispara `beforeinstallprompt`, muestra el icono y el nombre **Prizmothyn**, y ofrece **Instalar** / **Ahora no**.
* Tras pulsar **Ahora no** (o instalar) queda guardado `prizmothyn_install_dismissed` y no vuelve a aparecer.

---

## 7. Herramientas y otras secciones

* **Semillas**: semilla exacta, copia al portapapeles y hasta 3 ubicaciones con coordenadas X, Y, Z.
* **Servidores Bedrock**: estado, jugadores, versión, MOTD, IP y puerto copiables; se actualizan periódicamente.
* **Conversor Nether / Overworld**: proporción 8:1 en X/Z, conserva Y y valida el límite de Bedrock.
* **Planificador de encantamientos**: 42 encantamientos, compatibilidades, niveles romanos, incompatibilidades y orden recomendado para el yunque.
* **Recetas de pociones**: 22 recetas con árbol de pasos, variantes y buscador.
* **Creador de skins**: editor 64×64 con modelo 3D, capas, importación PNG y descarga.
* **Ajustes**: tema claro/oscuro/ultra oscuro, color principal, escala, redondeo, idioma de descripciones y formulario de reportes.
* **Asistente guiado**: explica el catálogo, recomienda contenido y envía errores o sugerencias; no usa IA generativa.

No hay feed social, perfiles ni notificaciones en la versión actual. Los favoritos y colecciones se gestionan como invitado identificado por dispositivo (`wl_guest_id`).

---

## 8. Despliegue

Archivos que se suben a GitHub Pages:

```text
index.html
ID.html
market-addons.js
sw.js
manifest.json
assets/marketplace/worker.js
assets/marketplace/pkg/web_rustcoin_bg.wasm
icon/
```

Si se modificó la API (`prizsocial.gs`), hay que **redesplegar la Web App** antes de probar. Después se recarga con **Ctrl+F5** para descartar caché del navegador.

El service worker se actualiza cambiando su `VERSION`; los cambios de `sw.js`, `manifest.json` y `market-addons.js` no necesitan redeploy de la Web App.

---

## Resumen

**Prizmothyn es un catálogo PWA para Minecraft Bedrock** con contenido propio y del Marketplace en una sola cuadrícula, fichas independientes, descargas con estados claros, descripciones traducibles, cantidades exactas, caché rápida, sincronización incremental, publicidad integrada e instalación opcional. Todo funciona desde GitHub Pages y sin obligación de crear cuenta.
