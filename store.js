/*
 * Day-Counter — couche de persistance.
 * ---------------------------------------------------------------------------
 * Deux niveaux de stockage :
 *   1. localStorage : cache local instantané (affichage immédiat + hors ligne).
 *      Ne suffit pas seul sur iPhone (Safari peut l'effacer après ~7 jours
 *      d'inactivité) → il ne sert que de cache/secours.
 *   2. Supabase : stockage DURABLE et partagé entre appareils. C'est la source
 *      de vérité dès qu'il est configuré (config.js).
 *
 * Stratégie (mono-utilisateur, simple et robuste) :
 *   - Toute modification met à jour la mémoire + le cache + l'écran tout de
 *     suite, puis pousse l'état complet vers Supabase.
 *   - À l'ouverture et au retour sur l'app, on recharge depuis Supabase.
 *   - Hors ligne, un drapeau « dirty » retient les changements, poussés dès
 *     que le réseau revient.
 *
 * Compatibilité de schéma : les colonnes emoji / color / recurring ont été
 * ajoutées après coup. Si la base n'a pas encore été migrée, on bascule
 * automatiquement en « mode restreint » (champs de base seulement) au lieu de
 * casser la synchronisation.
 */
window.Store = (function () {
  "use strict";

  var CACHE_KEY = "day-counter.events.v1";
  var DIRTY_KEY = "day-counter.dirty";

  var cfg = window.DAYCOUNTER_CONFIG || {};
  var configured = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  var SPACE = cfg.SPACE || "perso";
  var REST = configured ? cfg.SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/events" : null;

  var events = [];
  var knownIds = {};
  var changeCbs = [];
  var statusCbs = [];
  var status = configured ? "syncing" : "local";
  var syncing = false;
  var legacySchema = false; // base pas encore migrée (pas d'emoji/color/recurring)

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

  // Normalise un événement (tolère les enregistrements sans les nouveaux champs).
  function clean(ev) {
    return {
      id: ev.id,
      name: ev.name,
      date: ev.date,
      time: ev.time != null ? ev.time : null,
      emoji: ev.emoji || null,
      color: ev.color || null,
      recurring: !!ev.recurring,
      created: ev.created || null
    };
  }
  function replaceEvents(arr) {
    events.length = 0;
    for (var i = 0; i < arr.length; i++) events.push(arr[i]);
  }

  function headers(extra) {
    var h = {
      "apikey": cfg.SUPABASE_ANON_KEY,
      "Authorization": "Bearer " + cfg.SUPABASE_ANON_KEY,
      "Content-Type": "application/json"
    };
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }

  function rowToEvent(row) {
    return clean({
      id: row.id,
      name: row.name,
      date: row.event_date,
      time: row.event_time,
      emoji: row.emoji,
      color: row.color,
      recurring: row.recurring,
      created: row.created_at
    });
  }

  function eventToRow(ev, index, nowIso) {
    var row = {
      id: ev.id, space: SPACE, name: ev.name,
      event_date: ev.date, event_time: ev.time != null ? ev.time : null,
      position: index, updated_at: nowIso
    };
    if (!legacySchema) {
      row.emoji = ev.emoji || null;
      row.color = ev.color || null;
      row.recurring = !!ev.recurring;
    }
    return row;
  }

  // select=* : fonctionne quel que soit l'état du schéma.
  function remotePull() {
    var url = REST + "?space=eq." + encodeURIComponent(SPACE) + "&select=*&order=position.asc";
    return fetch(url, { headers: headers() }).then(function (r) {
      if (!r.ok) throw new Error("pull " + r.status);
      return r.json();
    }).then(function (rows) {
      if (rows.length && !("emoji" in rows[0])) legacySchema = true;
      return rows.map(rowToEvent);
    });
  }

  function looksLikeMissingColumn(text) {
    return /PGRST204|column|schema cache/i.test(text || "");
  }

  function upsert(payload) {
    return fetch(REST, {
      method: "POST",
      headers: headers({ "Prefer": "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(payload)
    }).then(function (r) {
      if (r.ok) return null;
      return r.text().then(function (t) { return { status: r.status, body: t }; });
    });
  }

  function remotePush() {
    var nowIso = new Date().toISOString();
    var currentIds = {};
    events.forEach(function (ev) { currentIds[ev.id] = true; });
    var toDelete = Object.keys(knownIds).filter(function (id) { return !currentIds[id]; });

    var ops = [];

    if (events.length) {
      ops.push(
        upsert(events.map(function (ev, i) { return eventToRow(ev, i, nowIso); }))
          .then(function (err) {
            if (!err) return;
            // Schéma non migré : on retente sans les colonnes récentes.
            if (err.status === 400 && !legacySchema && looksLikeMissingColumn(err.body)) {
              legacySchema = true;
              return upsert(events.map(function (ev, i) { return eventToRow(ev, i, nowIso); }))
                .then(function (err2) { if (err2) throw new Error("upsert " + err2.status); });
            }
            throw new Error("upsert " + err.status);
          })
      );
    }

    if (toDelete.length) {
      var inList = toDelete.map(function (id) { return '"' + id + '"'; }).join(",");
      var delUrl = REST + "?space=eq." + encodeURIComponent(SPACE) +
                   "&id=in.(" + encodeURIComponent(inList) + ")";
      ops.push(fetch(delUrl, { method: "DELETE", headers: headers({ "Prefer": "return=minimal" }) })
        .then(function (r) { if (!r.ok) throw new Error("delete " + r.status); }));
    }

    return Promise.all(ops).then(function () { knownIds = currentIds; });
  }

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
      setStatus("offline");
    });
  }

  function sync() {
    if (!configured || syncing) return Promise.resolve();
    syncing = true;
    setStatus("syncing");
    var pre = isDirty() ? remotePush().then(function () { setDirty(false); }) : Promise.resolve();
    return pre.then(remotePull).then(function (remote) {
      // Garde-fou anti-effacement : un serveur qui ne renvoie plus rien alors
      // que le cache local contient des événements traduit presque toujours
      // une base réinitialisée (projet recréé, table supprimée, schéma vidé)
      // et non une suppression volontaire — supprimer depuis l'app pousse la
      // suppression tout de suite. Dans ce cas on renvoie le cache vers le
      // serveur au lieu de l'effacer.
      if (!remote.length && events.length) {
        knownIds = {};
        return remotePush().then(function () {
          setDirty(false);
          setStatus("synced");
        });
      }
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

  function init() {
    replaceEvents(readCache().map(clean));
    emitChange();
    if (!configured) { setStatus("local"); return Promise.resolve(); }
    events.forEach(function (ev) { knownIds[ev.id] = true; });

    window.addEventListener("focus", function () { sync(); });
    document.addEventListener("visibilitychange", function () { if (!document.hidden) sync(); });
    window.addEventListener("online", function () { sync(); });

    return sync();
  }

  // Remplace tout l'état (utilisé par l'import d'une sauvegarde).
  function replaceAll(list) {
    replaceEvents(list.map(clean));
    return persist();
  }

  return {
    events: events,
    isConfigured: function () { return configured; },
    isLegacySchema: function () { return legacySchema; },
    getStatus: function () { return status; },
    onChange: function (cb) { changeCbs.push(cb); },
    onStatus: function (cb) { statusCbs.push(cb); },
    init: init,
    sync: sync,
    persist: persist,
    replaceAll: replaceAll
  };
})();
