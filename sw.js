/*
 * Day-Counter — service worker.
 * Stratégie « réseau d'abord, cache en secours » sur les fichiers du site :
 * en ligne on a toujours la dernière version, hors ligne l'app démarre quand
 * même. Les appels à Supabase ne sont jamais mis en cache (ils doivent
 * échouer franchement pour que Store bascule en mode hors ligne).
 */
var CACHE = "day-counter-v2";
var SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./store.js",
  "./config.js",
  "./favicon.svg",
  "./icon-180.png",
  "./icon-512.png",
  "./manifest.webmanifest"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () {
      return self.skipWaiting();
    }).catch(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  var url = new URL(req.url);
  // Tout ce qui n'est pas du même domaine (Supabase…) passe au réseau tel quel.
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || caches.match("./index.html");
      });
    })
  );
});
