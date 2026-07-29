(function () {
  "use strict";

  var VIEW_KEY = "day-counter.view"; // 'full' | 'days'

  // Les événements sont détenus par Store (cache local + Supabase). On garde
  // la même référence de tableau pour tout le reste du code.
  /** @type {Array<{id:string,name:string,date:string,time:string|null}>} */
  var events = Store.events;
  var viewMode = loadView();

  // --- DOM refs ---
  var listEl = document.getElementById("event-list");
  var emptyEl = document.getElementById("empty-state");
  var addBtn = document.getElementById("add-btn");
  var viewToggle = document.getElementById("view-toggle");
  var syncBadge = document.getElementById("sync-badge");

  var modal = document.getElementById("modal");
  var modalTitle = document.getElementById("modal-title");
  var form = document.getElementById("event-form");
  var idInput = document.getElementById("event-id");
  var nameInput = document.getElementById("event-name");
  var dateInput = document.getElementById("event-date");
  var timeInput = document.getElementById("event-time");
  var errorEl = document.getElementById("form-error");
  var deleteBtn = document.getElementById("delete-btn");

  // Réglages du glissement latéral
  var OPEN_W = 96;   // largeur des boutons révélés (px)
  var THRESH = 46;   // distance minimale pour « ouvrir » une action

  // ---------------------------------------------------------------------------
  // Persistence — déléguée à Store (cache local + Supabase).
  // ---------------------------------------------------------------------------
  function save() { Store.persist(); }

  function loadView() {
    try { var v = localStorage.getItem(VIEW_KEY); return v === "days" ? "days" : "full"; }
    catch (e) { return "full"; }
  }
  function saveView() { try { localStorage.setItem(VIEW_KEY, viewMode); } catch (e) {} }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function daysInMonth(year, month) { return new Date(year, month, 0).getDate(); }

  // ---------------------------------------------------------------------------
  // Parsing / validation
  // ---------------------------------------------------------------------------
  function parseDate(str) {
    var m = String(str).trim().match(/^(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4})$/);
    if (!m) return null;
    var day = parseInt(m[1], 10), month = parseInt(m[2], 10), year = parseInt(m[3], 10);
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > daysInMonth(year, month)) return null;
    return { year: year, month: month, day: day };
  }
  function parseTime(str) {
    var m = String(str).trim().match(/^(\d{1,2})\s*[:hH]\s*(\d{1,2})$/);
    if (!m) return null;
    var hour = parseInt(m[1], 10), minute = parseInt(m[2], 10);
    if (hour > 23 || minute > 59) return null;
    return { hour: hour, minute: minute };
  }
  function toDate(ev) {
    var d = parseDate(ev.date);
    if (!d) return null;
    var t = ev.time ? parseTime(ev.time) : null;
    return new Date(d.year, d.month - 1, d.day, t ? t.hour : 0, t ? t.minute : 0, 0, 0);
  }

  // ---------------------------------------------------------------------------
  // Calcul du temps écoulé
  // ---------------------------------------------------------------------------
  function addMonths(date, n) {
    var y = date.getFullYear();
    var total = date.getMonth() + n;
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
    var remMonths = months - years * 12;
    var ms = to.getTime() - anchor.getTime();
    var days = Math.floor(ms / 86400000); ms -= days * 86400000;
    var hours = Math.floor(ms / 3600000); ms -= hours * 3600000;
    var minutes = Math.floor(ms / 60000); ms -= minutes * 60000;
    var seconds = Math.floor(ms / 1000);
    return { years: years, months: remMonths, days: days, hours: hours, minutes: minutes, seconds: seconds };
  }
  function plural(n, singular, pl) { return n + " " + (n > 1 ? pl : singular); }
  function joinParts(parts) {
    if (parts.length === 1) return parts[0];
    return parts.slice(0, -1).join(", ") + " et " + parts[parts.length - 1];
  }

  // Retourne { text, future } — respecte le mode d'affichage courant.
  function elapsedText(ev, now) {
    var start = toDate(ev);
    if (!start) return { text: "Date invalide", future: false };
    var future = start.getTime() > now.getTime();
    var a = future ? now : start, b = future ? start : now;

    // Vue « Jours uniquement » : nombre total de jours entiers.
    if (viewMode === "days") {
      var totalDays = Math.floor((b.getTime() - a.getTime()) / 86400000);
      if (totalDays === 0) return { text: future ? "dans moins d'un jour" : "aujourd'hui", future: future };
      return { text: (future ? "dans " : "il y a ") + plural(totalDays, "jour", "jours"), future: future };
    }

    // Vue détaillée : ans / mois / jours (+ h / min / s si une heure est fournie).
    var bd = diffBreakdown(a, b);
    var hasTime = !!ev.time;
    var parts = [];
    if (bd.years) parts.push(plural(bd.years, "an", "ans"));
    if (bd.months) parts.push(plural(bd.months, "mois", "mois"));
    if (bd.days) parts.push(plural(bd.days, "jour", "jours"));
    if (hasTime) {
      if (bd.hours) parts.push(plural(bd.hours, "heure", "heures"));
      if (bd.minutes) parts.push(plural(bd.minutes, "minute", "minutes"));
      if (bd.seconds || parts.length === 0) parts.push(plural(bd.seconds, "seconde", "secondes"));
    } else if (parts.length === 0) {
      return { text: future ? "dans moins d'un jour" : "aujourd'hui", future: future };
    }
    return { text: (future ? "dans " : "il y a ") + joinParts(parts), future: future };
  }

  function formatDateSub(ev) {
    var d = parseDate(ev.date);
    if (!d) return "";
    var out = pad2(d.day) + "/" + pad2(d.month) + "/" + d.year;
    if (ev.time) { var t = parseTime(ev.time); if (t) out += " à " + pad2(t.hour) + ":" + pad2(t.minute); }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Rendu
  // ---------------------------------------------------------------------------
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function render() {
    openRow = null;
    listEl.innerHTML = "";
    if (events.length === 0) {
      emptyEl.hidden = false;
      listEl.hidden = true;
      if (viewToggle) viewToggle.hidden = true;
      return;
    }
    emptyEl.hidden = true;
    listEl.hidden = false;
    if (viewToggle) viewToggle.hidden = false;
    events.forEach(function (ev, index) { listEl.appendChild(buildCard(ev, index)); });
    updateElapsed();
  }

  function buildCard(ev, index) {
    var li = el("li", "event-row");
    li.dataset.id = ev.id;

    // Actions révélées par le glissement (derrière la carte)
    var editAction = el("button", "swipe-btn swipe-edit");
    editAction.type = "button";
    editAction.setAttribute("aria-label", "Modifier " + ev.name);
    editAction.innerHTML = '<span class="swipe-ico" aria-hidden="true">✏️</span>Modifier';
    editAction.addEventListener("click", function () { closeOpen(null); openModal(ev); });

    var deleteAction = el("button", "swipe-btn swipe-delete");
    deleteAction.type = "button";
    deleteAction.setAttribute("aria-label", "Supprimer " + ev.name);
    deleteAction.innerHTML = '<span class="swipe-ico" aria-hidden="true">🗑️</span>Supprimer';
    deleteAction.addEventListener("click", function () { deleteEvent(ev.id); });

    // Carte au premier plan (celle qui glisse)
    var card = el("div", "event-card");

    var handle = el("span", "drag-handle", "⠿");
    handle.title = "Glisser pour réorganiser";
    handle.setAttribute("aria-hidden", "true");
    handle.setAttribute("draggable", "true");

    var moveCol = el("div", "move-col");
    var upBtn = el("button", "icon-btn", "▲");
    upBtn.type = "button"; upBtn.title = "Monter"; upBtn.setAttribute("aria-label", "Monter " + ev.name);
    upBtn.disabled = index === 0;
    upBtn.addEventListener("click", function () { move(index, -1); });
    var downBtn = el("button", "icon-btn", "▼");
    downBtn.type = "button"; downBtn.title = "Descendre"; downBtn.setAttribute("aria-label", "Descendre " + ev.name);
    downBtn.disabled = index === events.length - 1;
    downBtn.addEventListener("click", function () { move(index, 1); });
    moveCol.appendChild(upBtn); moveCol.appendChild(downBtn);

    var main = el("div", "event-main");
    var name = el("p", "event-name", ev.name);
    var elapsed = el("p", "event-elapsed");
    elapsed.dataset.elapsed = ev.id;
    var sub = el("p", "event-date-sub", formatDateSub(ev));
    main.appendChild(name); main.appendChild(elapsed); main.appendChild(sub);

    var controls = el("div", "event-controls");
    var editBtn = el("button", "icon-btn", "✏️");
    editBtn.type = "button"; editBtn.title = "Modifier"; editBtn.setAttribute("aria-label", "Modifier " + ev.name);
    editBtn.addEventListener("click", function () { openModal(ev); });
    controls.appendChild(editBtn);

    card.appendChild(handle);
    card.appendChild(moveCol);
    card.appendChild(main);
    card.appendChild(controls);

    li.appendChild(editAction);
    li.appendChild(deleteAction);
    li.appendChild(card);

    attachDrag(li, handle);
    attachSwipe(card);
    return li;
  }

  function updateElapsed() {
    var now = new Date();
    events.forEach(function (ev) {
      var node = listEl.querySelector('[data-elapsed="' + ev.id + '"]');
      if (!node) return;
      var res = elapsedText(ev, now);
      node.textContent = res.text;
      node.classList.toggle("future", res.future);
    });
  }

  // ---------------------------------------------------------------------------
  // Vue : détaillé / jours
  // ---------------------------------------------------------------------------
  function setView(mode) {
    viewMode = mode === "days" ? "days" : "full";
    saveView();
    syncViewToggle();
    updateElapsed();
  }
  function syncViewToggle() {
    if (!viewToggle) return;
    Array.prototype.forEach.call(viewToggle.querySelectorAll("[data-view]"), function (btn) {
      var active = btn.getAttribute("data-view") === viewMode;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  // ---------------------------------------------------------------------------
  // Réorganisation (flèches)
  // ---------------------------------------------------------------------------
  function move(index, delta) {
    var target = index + delta;
    if (target < 0 || target >= events.length) return;
    var tmp = events[index]; events[index] = events[target]; events[target] = tmp;
    save(); render();
  }

  // ---------------------------------------------------------------------------
  // Réorganisation (glisser-déposer via la poignée — desktop)
  // ---------------------------------------------------------------------------
  var dragId = null;
  function attachDrag(li, handle) {
    handle.addEventListener("dragstart", function (e) {
      dragId = li.dataset.id;
      li.classList.add("dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", dragId); } catch (err) {}
      }
    });
    handle.addEventListener("dragend", function () {
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
    var fromIdx = indexOfId(fromId);
    if (fromIdx === -1) return;
    var item = events.splice(fromIdx, 1)[0];
    var toIdx = indexOfId(toId);
    if (toIdx === -1) { events.splice(fromIdx, 0, item); return; }
    events.splice(toIdx, 0, item);
    save(); render();
  }
  function indexOfId(id) {
    for (var i = 0; i < events.length; i++) if (events[i].id === id) return i;
    return -1;
  }

  // ---------------------------------------------------------------------------
  // Glissement latéral pour révéler Modifier (droite) / Supprimer (gauche)
  // ---------------------------------------------------------------------------
  var openRow = null; // carte actuellement ouverte

  function offsetOf(card) {
    if (card.classList.contains("open-left")) return -OPEN_W;  // glissé à gauche => Supprimer
    if (card.classList.contains("open-right")) return OPEN_W;  // glissé à droite => Modifier
    return 0;
  }
  function closeCard(card) {
    if (!card) return;
    card.style.transform = "";
    card.classList.remove("open-left", "open-right");
    if (openRow === card) openRow = null;
  }
  function closeOpen(except) {
    if (openRow && openRow !== except) closeCard(openRow);
  }

  function attachSwipe(card) {
    var startX = 0, startY = 0, dx = 0, base = 0;
    var pointerId = null, dragging = false, decided = false, horizontal = false, moved = false;

    card.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".drag-handle")) return;      // poignée => réorganisation
      if (e.target.closest("button") && e.target.closest(".event-card")) {
        // laisse les boutons internes (flèches, ✏️) recevoir leur clic,
        // mais on suit quand même pour pouvoir fermer si la carte est ouverte
      }
      pointerId = e.pointerId;
      startX = e.clientX; startY = e.clientY;
      base = offsetOf(card);
      dragging = true; decided = false; horizontal = false; moved = false; dx = base;
    });

    card.addEventListener("pointermove", function (e) {
      if (!dragging || e.pointerId !== pointerId) return;
      var mx = e.clientX - startX, my = e.clientY - startY;
      if (!decided) {
        if (Math.abs(mx) < 6 && Math.abs(my) < 6) return;
        decided = true;
        horizontal = Math.abs(mx) > Math.abs(my);
        if (horizontal) {
          closeOpen(card);
          card.classList.add("swiping");
          try { card.setPointerCapture(pointerId); } catch (err) {}
        }
      }
      if (!horizontal) return;
      moved = true;
      e.preventDefault();
      dx = Math.max(-OPEN_W, Math.min(OPEN_W, base + mx));
      card.style.transform = "translateX(" + dx + "px)";
    });

    function finish(e) {
      if (!dragging || (e && e.pointerId !== pointerId)) return;
      dragging = false;
      card.classList.remove("swiping");
      try { card.releasePointerCapture(pointerId); } catch (err) {}
      if (!horizontal) return;
      if (dx <= -THRESH) {
        card.style.transform = "translateX(-" + OPEN_W + "px)";
        card.classList.add("open-left"); card.classList.remove("open-right");
        openRow = card;
      } else if (dx >= THRESH) {
        card.style.transform = "translateX(" + OPEN_W + "px)";
        card.classList.add("open-right"); card.classList.remove("open-left");
        openRow = card;
      } else {
        closeCard(card);
      }
    }
    card.addEventListener("pointerup", finish);
    card.addEventListener("pointercancel", finish);

    // Empêche un « clic fantôme » sur les boutons internes juste après un glissement,
    // et referme la carte si on tape dessus alors qu'elle est ouverte.
    card.addEventListener("click", function (e) {
      if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; return; }
      if (offsetOf(card) !== 0 && !e.target.closest("button")) {
        e.preventDefault(); e.stopPropagation(); closeCard(card);
      }
    }, true);
  }

  // Un appui ailleurs (ou sur une autre carte) referme la carte ouverte.
  document.addEventListener("pointerdown", function (e) {
    if (!openRow) return;
    var row = openRow.parentNode; // .event-row
    if (!row || !row.contains(e.target)) closeCard(openRow);
  });

  // ---------------------------------------------------------------------------
  // Modale (ajout / modification)
  // ---------------------------------------------------------------------------
  function openModal(ev) {
    errorEl.hidden = true; errorEl.textContent = "";
    if (ev) {
      modalTitle.textContent = "Modifier l'événement";
      idInput.value = ev.id; nameInput.value = ev.name; dateInput.value = ev.date; timeInput.value = ev.time || "";
      deleteBtn.hidden = false;
    } else {
      modalTitle.textContent = "Nouvel événement";
      form.reset(); idInput.value = ""; deleteBtn.hidden = true;
    }
    modal.hidden = false;
    setTimeout(function () { nameInput.focus(); }, 30);
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
      if (!pt) { showError("Heure invalide. Format attendu : HH:MM (24h)."); timeInput.focus(); return; }
      normTime = pad2(pt.hour) + ":" + pad2(pt.minute);
    }
    var normDate = pad2(pd.day) + "/" + pad2(pd.month) + "/" + pd.year;
    var id = idInput.value;
    if (id) {
      var idx = indexOfId(id);
      if (idx !== -1) { events[idx].name = name; events[idx].date = normDate; events[idx].time = normTime; }
    } else {
      events.push({ id: uid(), name: name, date: normDate, time: normTime });
    }
    save(); render(); closeModal();
  }

  // Suppression directe et fiable (pas de window.confirm, bloqué en iframe).
  function deleteEvent(id) {
    var idx = indexOfId(id);
    if (idx === -1) return;
    events.splice(idx, 1);
    save(); render(); closeModal();
  }
  function onDelete() { deleteEvent(idInput.value); }

  function autoFormatDate(e) {
    if (e.inputType === "deleteContentBackward") return;
    var digits = dateInput.value.replace(/\D/g, "").slice(0, 8);
    var out = digits;
    if (digits.length > 4) out = digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/" + digits.slice(4);
    else if (digits.length > 2) out = digits.slice(0, 2) + "/" + digits.slice(2);
    dateInput.value = out;
  }
  function autoFormatTime(e) {
    if (e.inputType === "deleteContentBackward") return;
    var digits = timeInput.value.replace(/\D/g, "").slice(0, 4);
    timeInput.value = digits.length > 2 ? digits.slice(0, 2) + ":" + digits.slice(2) : digits;
  }

  // ---------------------------------------------------------------------------
  // Événements globaux
  // ---------------------------------------------------------------------------
  addBtn.addEventListener("click", function () { openModal(null); });
  form.addEventListener("submit", onSubmit);
  deleteBtn.addEventListener("click", onDelete);
  dateInput.addEventListener("input", autoFormatDate);
  timeInput.addEventListener("input", autoFormatTime);

  if (viewToggle) {
    viewToggle.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-view]");
      if (btn) setView(btn.getAttribute("data-view"));
    });
  }

  document.addEventListener("click", function (e) {
    var action = e.target.getAttribute && e.target.getAttribute("data-action");
    if (action === "close") closeModal();
    else if (action === "add-empty" || action === "add") openModal(null);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (!modal.hidden) closeModal();
      else if (openRow) closeCard(openRow);
    }
  });

  // --- Indicateur de synchronisation -----------------------------------------
  var SYNC_LABELS = {
    local:   { text: "Local", title: "Sauvegarde locale uniquement (sauvegarde en ligne non configurée)" },
    syncing: { text: "Synchro…", title: "Synchronisation avec le cloud en cours" },
    synced:  { text: "Synchronisé", title: "Sauvegardé en ligne — disponible sur tous vos appareils" },
    offline: { text: "Hors ligne", title: "Hors ligne : modifications enregistrées localement, synchro au retour du réseau" }
  };
  function updateSyncBadge(state) {
    if (!syncBadge) return;
    var info = SYNC_LABELS[state] || SYNC_LABELS.local;
    syncBadge.dataset.state = state;
    syncBadge.title = info.title;
    syncBadge.setAttribute("aria-label", info.title);
    var label = syncBadge.querySelector(".sync-text");
    if (label) label.textContent = info.text;
  }

  // Re-render à chaque changement de données (mutation locale ou arrivée du serveur).
  Store.onChange(function () { render(); });
  Store.onStatus(updateSyncBadge);

  setInterval(updateElapsed, 1000);
  syncViewToggle();
  updateSyncBadge(Store.getStatus());
  Store.init();
})();
