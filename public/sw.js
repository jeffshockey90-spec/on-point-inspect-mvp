/*
 * Unified FLOW service worker.
 *
 * This is the ONE service worker that controls the page. It reuses the
 * existing push + notificationclick handlers verbatim by importing them,
 * then layers offline caching (install / activate / fetch) on top.
 *
 * IMPORTANT: push-sw.js is the single source of truth for push behavior.
 * Do not duplicate its handlers here.
 */
importScripts("/push-sw.js");

// Bump the version to invalidate old caches on the next activate.
const CACHE_VERSION = "flow-sw-v1";
const CACHE_NAME = CACHE_VERSION;
const OFFLINE_URL = "/offline.html";

// Assets to precache so the offline fallback is always available.
const PRECACHE_URLS = [OFFLINE_URL];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {})
  );

  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            // Delete any of our version-prefixed caches that are not current.
            if (key.startsWith("flow-sw-") && key !== CACHE_NAME) {
              return caches.delete(key);
            }
            return undefined;
          })
        )
      )
      .then(() => self.clients.claim())
      .catch(() => {})
  );
});

function isNextStaticOrIcon(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/")
  );
}

function isSupabaseStorageImage(url) {
  if (!url.pathname.includes("/storage/v1/object/")) return false;
  return /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i.test(url.pathname);
}

// Cache-first: serve from cache if present, otherwise fetch, cache, return.
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // No cache and no network: let the browser handle the failure.
    throw error;
  }
}

// Network-first for navigations: fetch fresh, cache success, fall back to
// the cached page for this URL, then the offline fallback page.
async function navigationHandler(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cachedPage = await caches.match(request);
    if (cachedPage) return cachedPage;

    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;

    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only ever handle GET; everything else (POST/PUT/etc.) passes through
  // untouched so API/auth mutations are never intercepted or cached.
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Navigations: network-first with offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(navigationHandler(request));
    return;
  }

  const sameOrigin = url.origin === self.location.origin;

  // Same-origin immutable static assets: cache-first.
  if (sameOrigin && isNextStaticOrIcon(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Supabase storage images (cross-origin): cache-first with network fallback.
  if (isSupabaseStorageImage(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Everything else: do not intercept. Never touch API or auth requests.
});
