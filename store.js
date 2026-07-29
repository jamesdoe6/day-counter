/*
 * Day-Counter — couche de persistance.
 * ---------------------------------------------------------------------------
 * Deux niveaux de stockage :
 *   1. localStorage : cache local instantané (affichage immédiat + mode hors
 *      ligne). Ne suffit pas seul sur iPhone (Safari peut l'effacer après ~7
 *      jours d'inactivité) → il ne sert que de cache/secours.
 *   2. Supabase (base en ligne) : stockage DURABLE et partagé entre appareils.
 *      C'est la source de vérité dès qu'il est configuré (config.js).
 *
 * Stratégie de synchronisation (mono-utilisateur, simple et robuste) :
 *   - Chaque modification met à jour la mémoire + le cache local + l'écran
 *     immédiatement (optimiste), puis pousse TOUT l'état vers Supabase
 *     (upsert des lignes présentes + suppression des lignes disparues).
 *   - À l'ouverture (et au retour sur l'app), on recharge depuis Supabase :
 *     le serveur fait autorité. Les modifications faites hors ligne sont
 *     poussées avant le rechargement pour ne rien perdre.
 *   - Si le réseau est indisponible, l'app continue en local et re-tente la
 *     synchro au prochain focus / retour en ligne (aucune perte de données).
 */
window.Store = (function () {
  "use strict";

  var CACHE_KEY = "day-counter.events.v1";  // même clé que l'ancienne version
  var DIRTY_KEY = "day-counter.dirty";       // des changements attendent d'être poussés

  var cfg = window.DAYCOUNTER_CONFIG || {};
  var configured = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  var SPACE = cfg.SPACE || "perso";
  var REST = configured ? cfg.SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/events" : null;

  var events = [];            // état en mémoire (référence stable)
  var knownIds = {};          // ids connus côté serveur (pour détecter les suppressions)
  var changeCbs = [];
  var statusCbs = [];
  var status = configured ? "syncing" : "local";
  var syncing = false;

  // ---- utilitaires ----------------------------------------------------------
  function emitChange() { changeCbs.forEach(function (cb) { try { cb(events); } catch (e) {} }); }
  function setStatus(s) { status = s; statusCbs.forEach(function (cb) { try { cb(s); } catch (e) {} }); }

  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return [];
      var p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch (e) { return []; }
  }
  function writeCache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(events)); } catch (e) {}
  }
  function setDirty(v) {
    try { v ? localStorage.setItem(DIRTY_KEY, "1") : localStorage.removeItem(DIRTY_KEY); } catch (e) {}
  }
  function isDirty() {
    try { return localStorage.getItem(DIRTY_KEY) === "1"; } catch (e) { return false; }
  }

  // Copie « propre » d'un événement (uniquement les champs attendus).
  function clean(ev) {
    return { id: ev.id, name: ev.name, date: ev.date, time: ev.time != null ? ev.time : null };
  }
  function replaceEvents(arr) {
    events.length = 0;
    for (var i = 0; i < arr.length; i++) events.push(arr[i]);
  }

  // ---- appels Supabase (REST, sans dépendance) ------------------------------
  function headers(extra) {
    var h = {
      "apikey": cfg.SUPABASE_ANON_KEY,
      "Authorization": "Bearer " + cfg.SUPABASE_ANON_KEY,
      "Content-Type": "application/json"
    };
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }

  // Récupère toutes les lignes de l'espace courant, triées par position.
  function remotePull() {
    var url = REST + "?space=eq." + encodeURIComponent(SPACE) +
              "&select=id,name,event_date,event_time,position&order=position.asc";
    return fetch(url, { headers: headers() }).then(function (r) {
      if (!r.ok) throw new Error("pull " + r.status);
      return r.json();
    }).then(function (rows) {
      return rows.map(function (row) {
        return { id: row.id, name: row.name, date: row.event_date, time: row.event_time };
      });
    });
  }

  // Pousse tout l'état : upsert des événements courants + suppression du reste.
  function remotePush() {
    var now = new Date().toISOString();
    var payload = events.map(function (ev, i) {
      return {
        id: ev.id, space: SPACE, name: ev.name,
        event_date: ev.date, event_time: ev.time != null ? ev.time : null,
        position: i, updated_at: now
      };
    });

    // ids à supprimer = connus du serveur mais absents de l'état courant
    var currentIds = {};
    events.forEach(function (ev) { currentIds[ev.id] = true; });
    var toDelete = Object.keys(knownIds).filter(function (id) { return !currentIds[id]; });

    var ops = [];
    if (payload.length) {
      ops.push(fetch(REST, {
        method: "POST",
        headers: headers({ "Prefer": "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify(payload)
      }).then(function (r) { if (!r.ok) throw new Error("upsert " + r.status); }));
    }
    if (toDelete.length) {
      var inList = toDelete.map(function (id) { return '"' + id + '"'; }).join(",");
      var delUrl = REST + "?space=eq." + encodeURIComponent(SPACE) + "&id=in.(" + encodeURIComponent(inList) + ")";
      ops.push(fetch(delUrl, { method: "DELETE", headers: headers({ "Prefer": "return=minimal" }) })
        .then(function (r) { if (!r.ok) throw new Error("delete " + r.status); }));
    }
    return Promise.all(ops).then(function () {
      // met à jour la liste des ids connus
      knownIds = currentIds;
    });
  }

  // ---- API publique ---------------------------------------------------------

  // Persiste l'état courant : cache local (toujours) + Supabase (si possible).
  function persist() {
    writeCache();
    emitChange();
    if (!configured) { setStatus("local"); return Promise.resolve(); }
    setStatus("syncing");
    setDirty(true);
    return remotePush().then(function () {
      setDirty(false);
      setStatus("synced");
    }).catch(function () {
      // hors ligne : on garde le drapeau « dirty », on re-tentera au focus
      setStatus("offline");
    });
  }

  // Recharge depuis le serveur (autorité). Pousse d'abord les changements
  // locaux en attente pour ne rien écraser.
  function sync() {
    if (!configured || syncing) return Promise.resolve();
    syncing = true;
    setStatus("syncing");
    var pre = isDirty() ? remotePush().then(function () { setDirty(false); }) : Promise.resolve();
    return pre.then(remotePull).then(function (remote) {
      replaceEvents(remote);
      knownIds = {};
      remote.forEach(function (ev) { knownIds[ev.id] = true; });
      writeCache();
      emitChange();
      setStatus("synced");
    }).catch(function () {
      setStatus("offline");
    }).then(function () { syncing = false; });
  }

  // Initialisation : affiche le cache local tout de suite, puis synchronise.
  function init() {
    replaceEvents(readCache().map(clean));
    emitChange();
    if (!configured) { setStatus("local"); return Promise.resolve(); }
    // ids connus au départ = ce qu'on avait en cache (au cas où on doive pousser)
    events.forEach(function (ev) { knownIds[ev.id] = true; });

    // Resynchronise au retour sur l'app (autre appareil, réveil iPhone…)
    window.addEventListener("focus", function () { sync(); });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) sync();
    });
    window.addEventListener("online", function () { sync(); });

    return sync();
  }

  return {
    events: events,
    isConfigured: function () { return configured; },
    getStatus: function () { return status; },
    onChange: function (cb) { changeCbs.push(cb); },
    onStatus: function (cb) { statusCbs.push(cb); },
    init: init,
    sync: sync,
    persist: persist
  };
})();
