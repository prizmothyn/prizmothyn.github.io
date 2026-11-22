const VERSION = 'v14';
const SHELL_CACHE = 'prizmothyn-' + VERSION;
const RUNTIME_CACHE = 'prizmothyn-runtime-' + VERSION;
const CATALOG_PREFIX = 'prizmothyn-catalog-';
const MAX_RUNTIME_ENTRIES = 120;

const APP_SHELL = [
  './index.html',
  './ID.html',
  './manifest.json',
  './market-addons.js',
  './assets/marketplace/worker.js',
  './assets/marketplace/pkg/web_rustcoin_bg.wasm',
  './icon/icon.png',
  './icon/icon-192.png',
  './icon/icon-512.png',
  './icon/icon-maskable-512.png',
  './icon/title.png',
  './icon/loading.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.indexOf('prizmothyn-') === 0 &&
          key !== SHELL_CACHE &&
          key !== RUNTIME_CACHE &&
          key.indexOf(CATALOG_PREFIX) !== 0)
        .map((key) => caches.delete(key))
    );
    await trimCache(RUNTIME_CACHE, MAX_RUNTIME_ENTRIES);
    await self.clients.claim();
  })());
});

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map((request) => cache.delete(request)));
}

async function save(cacheName, request, response, limit) {
  if (!response || !response.ok) return;
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
  if (limit) await trimCache(cacheName, limit);
}

async function networkFirst(request, cacheName, fallback, timeoutMs) {
  const controller = new AbortController();
  const timer = timeoutMs
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;
  try {
    const response = await fetch(request, { signal: controller.signal });
    await save(cacheName, request, response, false);
    return response;
  } catch (error) {
    const cache = await caches.open(cacheName);
    return (await cache.match(request)) ||
      (fallback ? await cache.match(fallback) : null) ||
      Response.error();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function staleWhileRevalidate(event, request) {
  const revalidate = (async () => {
    try {
      const response = await fetch(request);
      await save(RUNTIME_CACHE, request, response, MAX_RUNTIME_ENTRIES);
      return response;
    } catch (error) {
      return null;
    }
  })();
  event.waitUntil(revalidate);

  return (async () => {
    const shell = await caches.open(SHELL_CACHE);
    const precached = await shell.match(request);
    if (precached) return precached;
    const runtime = await caches.open(RUNTIME_CACHE);
    const cached = await runtime.match(request);
    if (cached) return cached;
    return (await revalidate) || Response.error();
  })();
}

function cacheFirst(event, request) {
  return (async () => {
    const cache = await caches.open(RUNTIME_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response && response.ok) {
        event.waitUntil(save(RUNTIME_CACHE, request, response.clone(), MAX_RUNTIME_ENTRIES));
      }
      return response;
    } catch (error) {
      return cached || Response.error();
    }
  })();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL_CACHE, './index.html', 4000));
    return;
  }

  const destination = request.destination;
  if (['script', 'style', 'worker', 'font'].indexOf(destination) !== -1 ||
      /\.(?:js|css|wasm)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event, request));
    return;
  }

  if (destination === 'image') {
    event.respondWith(cacheFirst(event, request));
    return;
  }

  event.respondWith(networkFirst(request, RUNTIME_CACHE, null, 4000));
});
