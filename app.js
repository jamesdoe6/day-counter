/*
 * Day-Counter — logique d'interface.
 * La persistance est déléguée à Store (store.js) : cache local + Supabase.
 */
(function () {
  "use strict";

  var VIEW_KEY   = "day-counter.view";       // 'full' | 'days'
  var THEME_KEY  = "day-counter.theme";      // 'auto' | 'light' | 'dark'
  var NOTIFY_KEY = "day-counter.notify";     // '1' | absent
  var NOTIFIED_KEY = "day-counter.notified"; // AAAA-MM-JJ du dernier rappel

  var EMOJIS = ["🎂","❤️","🏠","💼","✈️","🎓","🚗","💍","👶","🐾","🏋️","🎉","📚","🌱","⭐"];
  var COLORS = [
    { key: "ink",   label: "Encre"   },
    { key: "blue",  label: "Bleu"    },
    { key: "brass", label: "Laiton"  },
    { key: "moss",  label: "Mousse"  },
    { key: "clay",  label: "Terre"   },
    { key: "plum",  label: "Prune"   }
  ];

  var OPEN_W = 104; // largeur des actions révélées au glissement
  var THRESH = 48;

  var events = Store.events;
  var viewMode = readLS(VIEW_KEY) === "days" ? "days" : "full";
  var theme = readLS(THEME_KEY) || "auto";
  var query = "";

  // --- DOM ---
  var listEl      = document.getElementById("event-list");
  var emptyEl     = document.getElementById("empty-state");
  var noResultsEl = document.getElementById("no-results");
  var addBtn      = document.getElementById("add-btn");
  var searchBtn   = document.getElementById("search-btn");
  var searchBar   = document.getElementById("search-bar");
  var searchInput = document.getElementById("search-input");
  var searchClear = document.getElementById("search-clear");
  var menuBtn     = document.getElementById("menu-btn");
  var menuPanel   = document.getElementById("menu-panel");
  var importFile  = document.getElementById("import-file");
  var syncBadge   = document.getElementById("sync-badge");

  var modal      = document.getElementById("modal");
  var modalTitle = document.getElementById("modal-title");
  var form       = document.getElementById("event-form");
  var idInput    = document.getElementById("event-id");
  var nameInput  = document.getElementById("event-name");
  var dateInput  = document.getElementById("event-date");
  var timeInput  = document.getElementById("event-time");
  var recurInput = document.getElementById("event-recurring");
  var emojiPick  = document.getElementById("emoji-picker");
  var colorPick  = document.getElementById("color-picker");
  var errorEl    = document.getElementById("form-error");
  var deleteBtn  = document.getElementById("delete-btn");

  var confirmEl   = document.getElementById("confirm");
  var confirmText = document.getElementById("confirm-text");
  var confirmOk   = document.getElementById("confirm-ok");
  var toastEl     = document.getElementById("toast");

  var draftEmoji = null;
  var draftColor = "ink";

  // --------------------------------------------------------------------------
  // Utilitaires
  // --------------------------------------------------------------------------
  function readLS(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function writeLS(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function fmtNum(n) { return n.toLocaleString("fr-FR"); }

  // Numéro de jour calendaire — insensible aux changements d'heure.
  function dayNumber(d) { return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000); }
  function daysBetween(a, b) { return dayNumber(b) - dayNumber(a); }

  function parseDate(str) {
    var m = String(str).trim().match(/^(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4})$/);
    if (!m) return null;
    var day = +m[1], month = +m[2], year = +m[3];
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > daysInMonth(year, month)) return null;
    return { year: year, month: month, day: day };
  }
  function parseTime(str) {
    var m = String(str).trim().match(/^(\d{1,2})\s*[:hH]\s*(\d{1,2})$/);
    if (!m) return null;
    var hour = +m[1], minute = +m[2];
    if (hour > 23 || minute > 59) return null;
    return { hour: hour, minute: minute };
  }
  function toDate(ev) {
    var d = parseDate(ev.date);
    if (!d) return null;
    var t = ev.time ? parseTime(ev.time) : null;
    return new Date(d.year, d.month - 1, d.day, t ? t.hour : 0, t ? t.minute : 0, 0, 0);
  }

  // --------------------------------------------------------------------------
  // Calcul du temps
  // --------------------------------------------------------------------------
  function addMonths(date, n) {
    var y = date.getFullYear(), total = date.getMonth() + n;
    y += Math.floor(total / 12);
    var m = ((total % 12) + 12) % 12;
    var day = Math.min(date.getDate(), daysInMonth(y, m + 1));
    return new Date(y, m, day, date.getHours(), date.getMinutes(), date.getSeconds(), 0);
  }
  function diffBreakdown(from, to) {
    var months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
    if (addMonths(from, months) > to) months -= 1;
    var anchor = addMonths(from, months);
    var years = Math.floor(months / 12);
    var ms = to.getTime() - anchor.getTime();
    var days = Math.floor(ms / 86400000); ms -= days * 86400000;
    var hours = Math.floor(ms / 3600000); ms -= hours * 3600000;
    var minutes = Math.floor(ms / 60000); ms -= minutes * 60000;
    return {
      years: years, months: months - years * 12, days: days,
      hours: hours, minutes: minutes, seconds: Math.floor(ms / 1000)
    };
  }
  function plural(n, s, p) { return fmtNum(n) + " " + (n > 1 ? p : s); }
  function joinParts(parts) {
    if (parts.length === 1) return parts[0];
    return parts.slice(0, -1).join(", ") + " et " + parts[parts.length - 1];
  }

  // Occurrence annuelle : la prochaine (et la précédente) date anniversaire.
  function occurrence(ev, year) {
    var d = parseDate(ev.date);
    var t = ev.time ? parseTime(ev.time) : null;
    var day = Math.min(d.day, daysInMonth(year, d.month)); // 29/02 → 28/02
    return new Date(year, d.month - 1, day, t ? t.hour : 0, t ? t.minute : 0, 0, 0);
  }
  function nextOccurrence(ev, now) {
    var o = occurrence(ev, now.getFullYear());
    if (o.getTime() <= now.getTime()) o = occurrence(ev, now.getFullYear() + 1);
    return o;
  }
  function prevOccurrence(ev, now) {
    var o = occurrence(ev, now.getFullYear());
    if (o.getTime() > now.getTime()) o = occurrence(ev, now.getFullYear() - 1);
    return o;
  }

  // Texte du compteur : { lead, value, future }
  function counterText(ev, now) {
    var start = toDate(ev);
    if (!start) return { lead: "", value: "Date invalide", future: false };

    if (ev.recurring) {
      var next = nextOccurrence(ev, now);
      return { lead: "dans ", value: spanText(now, next, ev), future: true };
    }
    var future = start.getTime() > now.getTime();
    var a = future ? now : start, b = future ? start : now;
    return { lead: future ? "dans " : "il y a ", value: spanText(a, b, ev), future: future };
  }

  // Durée entre deux dates, selon le format d'affichage choisi.
  function spanText(a, b, ev) {
    if (viewMode === "days") {
      var d = daysBetween(a, b);
      return d === 0 ? "aujourd'hui" : plural(d, "jour", "jours");
    }
    var bd = diffBreakdown(a, b);
    var parts = [];
    if (bd.years)  parts.push(plural(bd.years, "an", "ans"));
    if (bd.months) parts.push(plural(bd.months, "mois", "mois"));
    if (bd.days)   parts.push(plural(bd.days, "jour", "jours"));
    if (ev.time) {
      if (bd.hours)   parts.push(plural(bd.hours, "heure", "heures"));
      if (bd.minutes) parts.push(plural(bd.minutes, "minute", "minutes"));
      if (bd.seconds || !parts.length) parts.push(plural(bd.seconds, "seconde", "secondes"));
    } else if (!parts.length) {
      return "aujourd'hui";
    }
    return joinParts(parts);
  }

  // --------------------------------------------------------------------------
  // Jalons
  // --------------------------------------------------------------------------
  function milestoneSteps() {
    var l = [100, 250, 500, 750], d;
    for (d = 1000; d <= 5000; d += 500)   l.push(d);
    for (d = 6000; d <= 20000; d += 1000) l.push(d);
    for (d = 25000; d <= 50000; d += 5000) l.push(d);
    return l;
  }
  var STEPS = milestoneSteps();

  // Renvoie { today: string|null, next: {label, days}|null }
  function milestoneInfo(ev, now) {
    var start = toDate(ev);
    if (!start || ev.recurring || start.getTime() > now.getTime()) return { today: null, next: null };

    var days = daysBetween(start, now);
    var today = null;

    if (STEPS.indexOf(days) !== -1) today = plural(days, "jour", "jours");
    var annNow = occurrence(ev, now.getFullYear());
    var yearsExact = now.getFullYear() - start.getFullYear();
    if (!today && yearsExact > 0 && daysBetween(annNow, now) === 0) {
      today = plural(yearsExact, "an", "ans");
    }

    // Prochain jalon : le plus proche entre palier de jours et anniversaire.
    var cand = [];
    for (var i = 0; i < STEPS.length; i++) {
      if (STEPS[i] > days) { cand.push({ label: plural(STEPS[i], "jour", "jours"), days: STEPS[i] - days }); break; }
    }
    var nextAnn = nextOccurrence(ev, now);
    var annYears = nextAnn.getFullYear() - start.getFullYear();
    if (annYears > 0) cand.push({ label: plural(annYears, "an", "ans"), days: daysBetween(now, nextAnn) });

    cand.sort(function (x, y) { return x.days - y.days; });
    return { today: today, next: cand.length ? cand[0] : null };
  }

  // --------------------------------------------------------------------------
  // Rendu
  // --------------------------------------------------------------------------
  function visibleEvents() {
    if (!query) return events.slice();
    var q = query.toLowerCase();
    return events.filter(function (ev) { return (ev.name || "").toLowerCase().indexOf(q) !== -1; });
  }

  function fmtDate(ev) {
    var d = parseDate(ev.date);
    if (!d) return "";
    var out = pad2(d.day) + "/" + pad2(d.month) + "/" + d.year;
    if (ev.time) { var t = parseTime(ev.time); if (t) out += " · " + pad2(t.hour) + ":" + pad2(t.minute); }
    return out;
  }

  function render() {
    openCard = null;
    listEl.innerHTML = "";

    if (!events.length) {
      emptyEl.hidden = false;
      noResultsEl.hidden = true;
      listEl.hidden = true;
      return;
    }
    emptyEl.hidden = true;

    var shown = visibleEvents();
    if (!shown.length) {
      noResultsEl.hidden = false;
      listEl.hidden = true;
      return;
    }
    noResultsEl.hidden = true;
    listEl.hidden = false;

    shown.forEach(function (ev) {
      listEl.appendChild(buildRow(ev, events.indexOf(ev)));
    });
    tick();
  }

  function svgIcon(paths) {
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("aria-hidden", "true");
    paths.forEach(function (d) {
      var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", d);
      s.appendChild(p);
    });
    return s;
  }

  function buildRow(ev, index) {
    var li = el("li", "row");
    li.dataset.id = ev.id;

    // Actions révélées par le glissement
    var actions = el("div", "row-actions");
    var editAct = el("button", "act act-edit");
    editAct.type = "button";
    editAct.setAttribute("aria-label", "Modifier " + ev.name);
    editAct.appendChild(svgIcon(["M4 20h4L19 9l-4-4L4 16v4z"]));
    editAct.appendChild(el("span", null, "Modifier"));
    editAct.addEventListener("click", function () { closeOpen(null); openModal(ev); });

    var delAct = el("button", "act act-delete");
    delAct.type = "button";
    delAct.setAttribute("aria-label", "Supprimer " + ev.name);
    delAct.appendChild(svgIcon(["M5 7h14", "M10 7V5h4v2", "M6 7l1 13h10l1-13"]));
    delAct.appendChild(el("span", null, "Supprimer"));
    delAct.addEventListener("click", function () { askDelete(ev); });

    actions.appendChild(editAct);
    actions.appendChild(delAct);

    // Carte
    var entry = el("div", "entry");
    entry.style.setProperty("--tag", "var(--tag-" + (ev.color || "ink") + ")");

    var mark = el("div", "mark");
    if (ev.emoji) mark.appendChild(el("span", "mark-emoji", ev.emoji));
    mark.appendChild(el("span", "mark-rule"));

    var body = el("div", "entry-body");
    body.appendChild(el("p", "entry-name", ev.name));

    var count = el("p", "count");
    count.dataset.count = ev.id;
    body.appendChild(count);

    var meta = el("p", "entry-meta");
    meta.dataset.meta = ev.id;
    body.appendChild(meta);

    var prog = el("div", "progress");
    prog.dataset.progress = ev.id;
    prog.hidden = true;
    prog.appendChild(el("span"));
    body.appendChild(prog);

    // Réorganisation
    var moves = el("div", "moves");
    var grip = el("span", "grip", "⠿");
    grip.title = "Glisser pour réorganiser";
    grip.setAttribute("draggable", "true");
    grip.setAttribute("aria-hidden", "true");

    var up = el("button", "move", "▲");
    up.type = "button"; up.title = "Monter";
    up.setAttribute("aria-label", "Monter " + ev.name);
    up.disabled = index === 0 || !!query;
    up.addEventListener("click", function () { move(index, -1); });

    var down = el("button", "move", "▼");
    down.type = "button"; down.title = "Descendre";
    down.setAttribute("aria-label", "Descendre " + ev.name);
    down.disabled = index === events.length - 1 || !!query;
    down.addEventListener("click", function () { move(index, 1); });

    moves.appendChild(up);
    moves.appendChild(down);

    entry.appendChild(mark);
    entry.appendChild(body);
    entry.appendChild(moves);

    li.appendChild(actions);
    li.appendChild(entry);

    // La poignée reste hors flux visuel mais porte le glisser-déposer.
    entry.insertBefore(grip, entry.firstChild);

    attachDrag(li, grip);
    attachSwipe(entry);
    return li;
  }

  // Rafraîchit tous les compteurs (appelé chaque seconde).
  function tick() {
    var now = new Date();
    events.forEach(function (ev) {
      var node = listEl.querySelector('[data-count="' + ev.id + '"]');
      if (!node) return;

      var res = counterText(ev, now);
      node.innerHTML = "";
      if (res.lead) node.appendChild(el("span", "lead", res.lead));
      node.appendChild(el("span", "num", res.value));
      node.classList.toggle("is-future", res.future);

      // Ligne d'information
      var meta = listEl.querySelector('[data-meta="' + ev.id + '"]');
      if (meta) {
        meta.innerHTML = "";
        meta.appendChild(el("span", null, fmtDate(ev)));

        if (ev.recurring) {
          var nx = nextOccurrence(ev, now);
          var st = toDate(ev);
          var nth = nx.getFullYear() - st.getFullYear();
          meta.appendChild(el("span", "sep", "·"));
          meta.appendChild(el("span", null, (nth > 0 ? nth + " ans" : "prochaine") + " le " + pad2(nx.getDate()) + "/" + pad2(nx.getMonth() + 1) + "/" + nx.getFullYear()));
        } else {
          var ms = milestoneInfo(ev, now);
          if (ms.today) {
            var badge = el("span", "milestone is-today");
            badge.appendChild(el("span", null, "◆"));
            badge.appendChild(el("span", null, ms.today + " aujourd'hui"));
            meta.appendChild(el("span", "sep", "·"));
            meta.appendChild(badge);
          } else if (ms.next) {
            var hint = el("span", "milestone");
            hint.appendChild(el("span", null, "◇"));
            hint.appendChild(el("span", null, ms.next.label + " dans " + plural(ms.next.days, "jour", "jours")));
            meta.appendChild(el("span", "sep", "·"));
            meta.appendChild(hint);
          }
        }
      }

      // Barre de progression
      var prog = listEl.querySelector('[data-progress="' + ev.id + '"]');
      if (prog) {
        var pct = progressPct(ev, now);
        if (pct == null) { prog.hidden = true; }
        else { prog.hidden = false; prog.firstChild.style.width = Math.max(0, Math.min(100, pct)) + "%"; }
      }
    });
  }

  // Progression : cycle annuel pour les récurrents, création → échéance pour
  // les événements futurs. Rien pour un événement passé simple.
  function progressPct(ev, now) {
    var start = toDate(ev);
    if (!start) return null;
    if (ev.recurring) {
      var prev = prevOccurrence(ev, now), next = nextOccurrence(ev, now);
      return (now - prev) / (next - prev) * 100;
    }
    if (start.getTime() > now.getTime()) {
      var from = ev.created ? new Date(ev.created) : null;
      if (!from || isNaN(from.getTime()) || from >= start) return null;
      return (now - from) / (start - from) * 100;
    }
    return null;
  }

  // --------------------------------------------------------------------------
  // Réorganisation
  // --------------------------------------------------------------------------
  function move(index, delta) {
    var t = index + delta;
    if (t < 0 || t >= events.length) return;
    var tmp = events[index]; events[index] = events[t]; events[t] = tmp;
    Store.persist();
  }

  var dragId = null;
  function attachDrag(li, grip) {
    grip.addEventListener("dragstart", function (e) {
      dragId = li.dataset.id;
      li.classList.add("dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", dragId); } catch (err) {}
      }
    });
    grip.addEventListener("dragend", function () {
      dragId = null;
      li.classList.remove("dragging");
      Array.prototype.forEach.call(listEl.querySelectorAll(".drag-over"), function (n) { n.classList.remove("drag-over"); });
    });
    li.addEventListener("dragover", function (e) {
      if (!dragId) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      if (li.dataset.id !== dragId) li.classList.add("drag-over");
    });
    li.addEventListener("dragleave", function () { li.classList.remove("drag-over"); });
    li.addEventListener("drop", function (e) {
      e.preventDefault();
      li.classList.remove("drag-over");
      if (!dragId || li.dataset.id === dragId) return;
      reorder(dragId, li.dataset.id);
    });
  }
  function reorder(fromId, toId) {
    var fi = indexOfId(fromId); if (fi === -1) return;
    var item = events.splice(fi, 1)[0];
    var ti = indexOfId(toId);
    if (ti === -1) { events.splice(fi, 0, item); return; }
    events.splice(ti, 0, item);
    Store.persist();
  }
  function indexOfId(id) {
    for (var i = 0; i < events.length; i++) if (events[i].id === id) return i;
    return -1;
  }

  // --------------------------------------------------------------------------
  // Glissement latéral
  // --------------------------------------------------------------------------
  var openCard = null;

  function offsetOf(card) {
    if (card.classList.contains("open-left")) return -OPEN_W;
    if (card.classList.contains("open-right")) return OPEN_W;
    return 0;
  }
  function closeCard(card) {
    if (!card) return;
    card.style.transform = "";
    card.classList.remove("open-left", "open-right");
    if (openCard === card) openCard = null;
  }
  function closeOpen(except) { if (openCard && openCard !== except) closeCard(openCard); }

  function attachSwipe(card) {
    var startX = 0, startY = 0, dx = 0, base = 0;
    var pid = null, dragging = false, decided = false, horizontal = false, moved = false;

    card.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".grip")) return;
      pid = e.pointerId; startX = e.clientX; startY = e.clientY;
      base = offsetOf(card); dx = base;
      dragging = true; decided = false; horizontal = false; moved = false;
    });
    card.addEventListener("pointermove", function (e) {
      if (!dragging || e.pointerId !== pid) return;
      var mx = e.clientX - startX, my = e.clientY - startY;
      if (!decided) {
        if (Math.abs(mx) < 6 && Math.abs(my) < 6) return;
        decided = true;
        horizontal = Math.abs(mx) > Math.abs(my);
        if (horizontal) {
          closeOpen(card);
          card.classList.add("swiping");
          try { card.setPointerCapture(pid); } catch (err) {}
        }
      }
      if (!horizontal) return;
      moved = true;
      e.preventDefault();
      dx = Math.max(-OPEN_W, Math.min(OPEN_W, base + mx));
      card.style.transform = "translateX(" + dx + "px)";
    });
    function finish(e) {
      if (!dragging || (e && e.pointerId !== pid)) return;
      dragging = false;
      card.classList.remove("swiping");
      try { card.releasePointerCapture(pid); } catch (err) {}
      if (!horizontal) return;
      if (dx <= -THRESH) {
        card.style.transform = "translateX(-" + OPEN_W + "px)";
        card.classList.add("open-left"); card.classList.remove("open-right");
        openCard = card;
      } else if (dx >= THRESH) {
        card.style.transform = "translateX(" + OPEN_W + "px)";
        card.classList.add("open-right"); card.classList.remove("open-left");
        openCard = card;
      } else { closeCard(card); }
    }
    card.addEventListener("pointerup", finish);
    card.addEventListener("pointercancel", finish);
    card.addEventListener("click", function (e) {
      if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; return; }
      if (offsetOf(card) !== 0 && !e.target.closest("button")) {
        e.preventDefault(); e.stopPropagation(); closeCard(card);
      }
    }, true);
  }

  document.addEventListener("pointerdown", function (e) {
    if (openCard) {
      var row = openCard.parentNode;
      if (!row || !row.contains(e.target)) closeCard(openCard);
    }
    if (!menuPanel.hidden && !menuPanel.contains(e.target) && !menuBtn.contains(e.target)) toggleMenu(false);
  });

  // --------------------------------------------------------------------------
  // Sélecteurs (icône / couleur)
  // --------------------------------------------------------------------------
  function buildPickers() {
    var none = el("button", "emoji emoji-none", "Aucune");
    none.type = "button";
    none.dataset.emoji = "";
    emojiPick.appendChild(none);
    EMOJIS.forEach(function (e) {
      var b = el("button", "emoji", e);
      b.type = "button";
      b.dataset.emoji = e;
      b.setAttribute("aria-label", "Icône " + e);
      emojiPick.appendChild(b);
    });
    emojiPick.addEventListener("click", function (e) {
      var b = e.target.closest("[data-emoji]");
      if (!b) return;
      draftEmoji = b.dataset.emoji || null;
      syncPickers();
    });

    COLORS.forEach(function (c) {
      var b = el("button", "swatch");
      b.type = "button";
      b.dataset.color = c.key;
      b.title = c.label;
      b.setAttribute("aria-label", "Couleur " + c.label);
      b.style.setProperty("--sw", "var(--tag-" + c.key + ")");
      b.appendChild(el("i"));
      colorPick.appendChild(b);
    });
    colorPick.addEventListener("click", function (e) {
      var b = e.target.closest("[data-color]");
      if (!b) return;
      draftColor = b.dataset.color;
      syncPickers();
    });
  }
  function syncPickers() {
    Array.prototype.forEach.call(emojiPick.children, function (b) {
      b.setAttribute("aria-pressed", (b.dataset.emoji || null) === draftEmoji ? "true" : "false");
    });
    Array.prototype.forEach.call(colorPick.children, function (b) {
      b.setAttribute("aria-pressed", b.dataset.color === draftColor ? "true" : "false");
    });
  }

  // --------------------------------------------------------------------------
  // Fiche
  // --------------------------------------------------------------------------
  function openModal(ev) {
    errorEl.hidden = true;
    errorEl.textContent = "";
    if (ev) {
      modalTitle.textContent = "Modifier l'événement";
      idInput.value = ev.id;
      nameInput.value = ev.name;
      dateInput.value = ev.date;
      timeInput.value = ev.time || "";
      recurInput.checked = !!ev.recurring;
      draftEmoji = ev.emoji || null;
      draftColor = ev.color || "ink";
      deleteBtn.hidden = false;
    } else {
      modalTitle.textContent = "Nouvel événement";
      form.reset();
      idInput.value = "";
      recurInput.checked = false;
      draftEmoji = null;
      draftColor = "ink";
      deleteBtn.hidden = true;
    }
    syncPickers();
    modal.hidden = false;
    setTimeout(function () { nameInput.focus(); }, 40);
  }
  function closeModal() { modal.hidden = true; }
  function showError(msg) { errorEl.textContent = msg; errorEl.hidden = false; }

  function onSubmit(e) {
    e.preventDefault();
    var name = nameInput.value.trim();
    var dateStr = dateInput.value.trim();
    var timeStr = timeInput.value.trim();

    if (!name) { showError("Veuillez saisir un nom."); nameInput.focus(); return; }
    var pd = parseDate(dateStr);
    if (!pd) { showError("Date invalide. Format attendu : JJ/MM/AAAA."); dateInput.focus(); return; }
    var normTime = null;
    if (timeStr) {
      var pt = parseTime(timeStr);
      if (!pt) { showError("Heure invalide. Format attendu : HH:MM (24 h)."); timeInput.focus(); return; }
      normTime = pad2(pt.hour) + ":" + pad2(pt.minute);
    }
    var normDate = pad2(pd.day) + "/" + pad2(pd.month) + "/" + pd.year;

    var id = idInput.value;
    if (id) {
      var idx = indexOfId(id);
      if (idx !== -1) {
        var ev = events[idx];
        ev.name = name; ev.date = normDate; ev.time = normTime;
        ev.emoji = draftEmoji; ev.color = draftColor; ev.recurring = recurInput.checked;
      }
    } else {
      events.push({
        id: uid(), name: name, date: normDate, time: normTime,
        emoji: draftEmoji, color: draftColor, recurring: recurInput.checked,
        created: new Date().toISOString()
      });
    }
    Store.persist();
    closeModal();
  }

  function deleteEvent(id) {
    var idx = indexOfId(id);
    if (idx === -1) return;
    events.splice(idx, 1);
    Store.persist();
    closeModal();
  }
  function askDelete(ev) {
    askConfirm("Supprimer « " + ev.name + " » ? Cette action est définitive.", "Supprimer", function () {
      deleteEvent(ev.id);
      toast("Événement supprimé");
    });
  }

  // Confirmation maison (window.confirm est bloqué dans certains contextes).
  var confirmCb = null;
  function askConfirm(text, okLabel, cb) {
    confirmText.textContent = text;
    confirmOk.textContent = okLabel || "Confirmer";
    confirmCb = cb;
    confirmEl.hidden = false;
  }
  confirmEl.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-confirm]");
    if (!t) return;
    var a = t.getAttribute("data-confirm");
    confirmEl.hidden = true;
    var cb = confirmCb; confirmCb = null;
    if (a === "yes" && cb) cb();
  });

  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2600);
  }

  // Saisie assistée
  function autoDate(e) {
    if (e.inputType === "deleteContentBackward") return;
    var d = dateInput.value.replace(/\D/g, "").slice(0, 8);
    var out = d;
    if (d.length > 4) out = d.slice(0, 2) + "/" + d.slice(2, 4) + "/" + d.slice(4);
    else if (d.length > 2) out = d.slice(0, 2) + "/" + d.slice(2);
    dateInput.value = out;
  }
  function autoTime(e) {
    if (e.inputType === "deleteContentBackward") return;
    var d = timeInput.value.replace(/\D/g, "").slice(0, 4);
    timeInput.value = d.length > 2 ? d.slice(0, 2) + ":" + d.slice(2) : d;
  }

  // --------------------------------------------------------------------------
  // Sauvegarde : export / import
  // --------------------------------------------------------------------------
  function exportBackup() {
    var payload = { app: "day-counter", version: 2, exported: new Date().toISOString(), events: events };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var now = new Date();
    var a = document.createElement("a");
    a.href = url;
    a.download = "day-counter-" + now.getFullYear() + "-" + pad2(now.getMonth() + 1) + "-" + pad2(now.getDate()) + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    toast(events.length + " événement" + (events.length > 1 ? "s" : "") + " exporté" + (events.length > 1 ? "s" : ""));
  }

  function importBackup(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var list;
      try {
        var data = JSON.parse(reader.result);
        list = Array.isArray(data) ? data : data.events;
      } catch (err) { toast("Fichier illisible : ce n'est pas un JSON valide."); return; }

      if (!Array.isArray(list)) { toast("Fichier non reconnu : aucune liste d'événements."); return; }

      var valid = list.filter(function (ev) { return ev && ev.name && parseDate(ev.date); })
                      .map(function (ev) {
                        return {
                          id: ev.id || uid(), name: String(ev.name), date: ev.date,
                          time: ev.time || null, emoji: ev.emoji || null,
                          color: ev.color || "ink", recurring: !!ev.recurring,
                          created: ev.created || null
                        };
                      });
      if (!valid.length) { toast("Aucun événement valide dans ce fichier."); return; }

      askConfirm(
        "Remplacer les " + events.length + " événement(s) actuels par les " + valid.length + " du fichier ?",
        "Remplacer",
        function () {
          Store.replaceAll(valid);
          toast(valid.length + " événement" + (valid.length > 1 ? "s" : "") + " restauré" + (valid.length > 1 ? "s" : ""));
        }
      );
    };
    reader.onerror = function () { toast("Impossible de lire le fichier."); };
    reader.readAsText(file);
  }

  // --------------------------------------------------------------------------
  // Rappels
  // --------------------------------------------------------------------------
  function notifySupported() { return typeof Notification !== "undefined"; }
  function notifyEnabled() { return readLS(NOTIFY_KEY) === "1" && notifySupported() && Notification.permission === "granted"; }

  function toggleNotify() {
    if (!notifySupported()) {
      toast("Ce navigateur ne gère pas les rappels.");
      return;
    }
    if (notifyEnabled()) {
      writeLS(NOTIFY_KEY, "0");
      updateMenuLabels();
      toast("Rappels désactivés");
      return;
    }
    Notification.requestPermission().then(function (p) {
      if (p === "granted") {
        writeLS(NOTIFY_KEY, "1");
        toast("Rappels activés");
        checkReminders();
      } else {
        writeLS(NOTIFY_KEY, "0");
        toast("Rappels refusés par le navigateur.");
      }
      updateMenuLabels();
    }).catch(function () { toast("Impossible d'activer les rappels."); });
  }

  // Rappel à l'ouverture : jalon ou anniversaire tombant aujourd'hui.
  function checkReminders() {
    if (!notifyEnabled()) return;
    var now = new Date();
    var todayKey = now.getFullYear() + "-" + pad2(now.getMonth() + 1) + "-" + pad2(now.getDate());
    if (readLS(NOTIFIED_KEY) === todayKey) return;

    var hits = [];
    events.forEach(function (ev) {
      if (ev.recurring) {
        if (daysBetween(occurrence(ev, now.getFullYear()), now) === 0) {
          var st = toDate(ev);
          var n = now.getFullYear() - st.getFullYear();
          hits.push(ev.name + (n > 0 ? " — " + plural(n, "an", "ans") : ""));
        }
      } else {
        var ms = milestoneInfo(ev, now);
        if (ms.today) hits.push(ev.name + " — " + ms.today);
      }
    });
    if (!hits.length) return;

    writeLS(NOTIFIED_KEY, todayKey);
    try {
      new Notification("Day-Counter", {
        body: hits.slice(0, 4).join("\n") + (hits.length > 4 ? "\n…" : ""),
        icon: "icon-180.png",
        tag: "day-counter-" + todayKey
      });
    } catch (e) { /* certains navigateurs exigent un service worker */ }
  }

  // --------------------------------------------------------------------------
  // Thème / format / menu
  // --------------------------------------------------------------------------
  function applyTheme() {
    if (theme === "light" || theme === "dark") document.documentElement.setAttribute("data-theme", theme);
    else document.documentElement.removeAttribute("data-theme");
  }
  function cycleTheme() {
    theme = theme === "auto" ? "light" : theme === "light" ? "dark" : "auto";
    writeLS(THEME_KEY, theme);
    applyTheme();
    updateMenuLabels();
  }
  function cycleView() {
    viewMode = viewMode === "full" ? "days" : "full";
    writeLS(VIEW_KEY, viewMode);
    updateMenuLabels();
    tick();
  }
  function updateMenuLabels() {
    document.getElementById("menu-view-value").textContent = viewMode === "days" ? "Jours" : "Détaillé";
    document.getElementById("menu-theme-value").textContent =
      theme === "light" ? "Clair" : theme === "dark" ? "Sombre" : "Auto";
    document.getElementById("menu-notify-value").textContent = notifyEnabled() ? "Activés" : "Désactivés";
  }
  function toggleMenu(open) {
    var willOpen = open == null ? menuPanel.hidden : open;
    menuPanel.hidden = !willOpen;
    menuBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
  }

  function toggleSearch(open) {
    var willOpen = open == null ? searchBar.hidden : open;
    searchBar.hidden = !willOpen;
    searchBtn.classList.toggle("on", willOpen);
    if (willOpen) { setTimeout(function () { searchInput.focus(); }, 30); }
    else if (query) { query = ""; searchInput.value = ""; render(); }
  }

  // --------------------------------------------------------------------------
  // Synchronisation (affichage)
  // --------------------------------------------------------------------------
  var SYNC = {
    local:   { text: "Local",       title: "Sauvegarde locale uniquement (sauvegarde en ligne non configurée)" },
    syncing: { text: "Synchro…",    title: "Synchronisation en cours" },
    synced:  { text: "Synchronisé", title: "Sauvegardé en ligne — disponible sur tous vos appareils" },
    offline: { text: "Hors ligne",  title: "Hors ligne : vos modifications partiront au retour du réseau" }
  };
  function updateSync(state) {
    var info = SYNC[state] || SYNC.local;
    syncBadge.dataset.state = state;
    syncBadge.title = info.title;
    syncBadge.querySelector(".sync-text").textContent = info.text;
  }

  // --------------------------------------------------------------------------
  // Câblage
  // --------------------------------------------------------------------------
  addBtn.addEventListener("click", function () { openModal(null); });
  form.addEventListener("submit", onSubmit);
  deleteBtn.addEventListener("click", function () {
    var idx = indexOfId(idInput.value);
    if (idx !== -1) askDelete(events[idx]);
  });
  dateInput.addEventListener("input", autoDate);
  timeInput.addEventListener("input", autoTime);

  searchBtn.addEventListener("click", function () { toggleSearch(); });
  searchClear.addEventListener("click", function () { searchInput.value = ""; query = ""; render(); searchInput.focus(); });
  searchInput.addEventListener("input", function () { query = searchInput.value.trim(); render(); });

  menuBtn.addEventListener("click", function () { toggleMenu(); });
  menuPanel.addEventListener("click", function (e) {
    var b = e.target.closest("[data-menu]");
    if (!b) return;
    var a = b.dataset.menu;
    if (a === "view") cycleView();
    else if (a === "theme") cycleTheme();
    else if (a === "notify") toggleNotify();
    else if (a === "export") { toggleMenu(false); exportBackup(); }
    else if (a === "import") { toggleMenu(false); importFile.click(); }
  });
  importFile.addEventListener("change", function () {
    if (importFile.files && importFile.files[0]) importBackup(importFile.files[0]);
    importFile.value = "";
  });

  // closest() : le clic peut atterrir sur une icône ou un span à l'intérieur
  // du bouton porteur de l'attribut.
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-action]");
    if (!t) return;
    var a = t.getAttribute("data-action");
    if (a === "close") closeModal();
    else if (a === "add") openModal(null);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (!confirmEl.hidden) { confirmEl.hidden = true; confirmCb = null; }
    else if (!modal.hidden) closeModal();
    else if (!menuPanel.hidden) toggleMenu(false);
    else if (openCard) closeCard(openCard);
    else if (!searchBar.hidden) toggleSearch(false);
  });

  Store.onChange(function () { render(); });
  Store.onStatus(updateSync);

  // Service worker : mise en cache de l'app pour un usage hors ligne.
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }

  buildPickers();
  applyTheme();
  updateMenuLabels();
  updateSync(Store.getStatus());
  setInterval(tick, 1000);
  Store.init().then(checkReminders);
  window.addEventListener("focus", checkReminders);
})();
