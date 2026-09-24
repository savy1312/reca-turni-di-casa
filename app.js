/* ============================================================
   RECA – Turni di Casa (PWA)
   App completa: login, QR, turni, notifiche, admin
   ============================================================ */

"use strict";

/* ---------- Costanti ---------- */
const DAYS = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
const DAYS_SHORT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const GROUP = "TUTTI"; // turno di gruppo
const TURN_WINDOW_MIN = 30; // finestra di validità di un turno (minuti)
const ADMIN_USER = "admin";
const ADMIN_PASS = "Consegna.CRP2";
const LS = {
  data: "reca_data_v1",        // dati condivisi (turni, persone, stanze)
  users: "reca_users_v1",      // account (email, nome, password, foto)
  session: "reca_session_v1",  // sessione utente corrente
  gate: "reca_gate_code_v1",   // codice segreto della casa
  glow: "reca_glow_v1",        // preferenza LED RGB
  notif: "reca_notif_v1",      // preferenza notifiche
  sent: "reca_notif_sent_v1"   // notifiche già inviate (anti-duplicato)
};

/* ---------- Dati di default (modificabili dall'Area Admin) ---------- */
const DEFAULT_DATA = {
  // Tabella di corrispondenza nome → stanza
  people: [
    { name: "Hemmat",  room: "Camera 1" },
    { name: "Rafaela", room: "Camera 1" },
    { name: "Camilla", room: "Camera 2" },
    { name: "Chiara",  room: "Camera 2" },
    { name: "Nicolò",  room: "Camera 3" },
    { name: "Sean",    room: "Camera 3" },
    { name: "Elia",    room: "Camera 4" },
    { name: "Djily",   room: "Camera 4" },
    { name: "Adamo",   room: "Camera 5" },
    { name: "Pietro",  room: "Camera 3" }
  ],
  rooms: ["Camera 1", "Camera 2", "Camera 3", "Camera 4", "Camera 5"],

  // Turni di cucina / apparecchio e sparecchio (per nome)
  // lunch/dinner: nome, oppure "TUTTI" per il turno di gruppo
  cucina: {
    "Lunedì":    { lunch: "Elia",     dinner: "Hemmat" },
    "Martedì":   { lunch: "Camilla",  dinner: "Djily" },
    "Mercoledì": { lunch: "TUTTI",    dinner: "Nicolò" },
    "Giovedì":   { lunch: "Adamo",    dinner: "Sean" },
    "Venerdì":   { lunch: "Rafaela",  dinner: "Chiara" },
    "Sabato":    { lunch: "Sean",     dinner: "Nicolò" },
    "Domenica":  { lunch: "Rafaela",  dinner: "Chiara" }
  },

  // Turni di bucato per stanza (giorni feriali; weekend libero)
  bucato: {
    "Lunedì":    [{ room: "Camera 5", type: "Lenzuola e vestiti" }, { room: "Camera 1", type: "Vestiti" }],
    "Martedì":   [{ room: "Camera 4", type: "Lenzuola e vestiti" }, { room: "Camera 2", type: "Vestiti" }],
    "Mercoledì": [{ room: "Camera 3", type: "Lenzuola e vestiti" }, { room: "Camera 5", type: "Vestiti" }],
    "Giovedì":   [{ room: "Camera 2", type: "Lenzuola e vestiti" }, { room: "Camera 4", type: "Vestiti" }],
    "Venerdì":   [{ room: "Camera 1", type: "Lenzuola e vestiti" }, { room: "Camera 3", type: "Vestiti" }],
    "Sabato":    [],
    "Domenica":  []
  },

  // Turni bagni e sala (per nome; "TUTTI" = tutti insieme)
  bagni: {
    "ragazzi": {
      "Lunedì": "Adamo", "Martedì": "Djily", "Mercoledì": "Nicolò",
      "Giovedì": "Sean", "Venerdì": "TUTTI", "Sabato": "Djily", "Domenica": "TUTTI"
    },
    "femminile": {
      "Lunedì": "Camilla", "Martedì": "Chiara", "Mercoledì": "Rafaela",
      "Giovedì": "Hemmat", "Venerdì": "Elia", "Sabato": "Camilla, Chiara", "Domenica": "Hemmat, Rafaela, Elia"
    },
    "giu": {
      "Lunedì": "Camilla, Nicolò", "Martedì": "Hemmat, Adamo", "Mercoledì": "Pietro, Sean",
      "Giovedì": "Camilla, Nicolò", "Venerdì": "Elia, Djily", "Sabato": "Chiara, Rafaela", "Domenica": "Hemmat, Adamo"
    }
  },
  sala: {
    "Lunedì": "Djily, Elia", "Martedì": "Nicolò, Sean", "Mercoledì": "Djily, Elia",
    "Giovedì": "TUTTI", "Venerdì": "Nicolò, Sean", "Sabato": "", "Domenica": "Adamo"
  },

  // Orari notifiche (HH:MM) – feriali vs weekend
  orari: {
    bucato: {
      feriali: ["07:30", "13:00", "21:00"],
      weekend: ["08:30", "12:30", "20:30"]
    },
    cucina: {
      weekend: ["08:30", "12:00", "19:20"]
    }
  },
  // Messaggi notifiche
  messaggi: {
    bucato: ["Oggi devi fare il bucato", "Non dimenticarti del bucato di oggi", "Ti sei ricordato del bucato?"],
    cucina: ["Oggi è il tuo turno di apparecchio", "È il momento di apparecchiare", "È il momento di apparecchiare"],
    puliziaStanza: { day: "Domenica", time: "10:40", text: "Devi pulire la tua stanza a fondo" }
  }
};

/* ---------- Utilità storage ---------- */
function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch (e) { return fallback; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* storage pieno */ }
}

/* Carica i dati (default + modifiche admin salvate) */
function loadData() {
  const saved = lsGet(LS.data, null);
  if (!saved) { lsSet(LS.data, DEFAULT_DATA); return structuredClone(DEFAULT_DATA); }
  // merge con default per chiavi nuove
  const merged = structuredClone(DEFAULT_DATA);
  for (const k of Object.keys(saved)) merged[k] = saved[k];
  return merged;
}
function saveData(d) { lsSet(LS.data, d); }

/* ---------- Hash password (SHA-256, con fallback semplice) ---------- */
async function hashPassword(pw) {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("reca::" + pw));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  } catch (e) {
    // fallback (es. contesto non sicuro): hash non crittografico
    let h = 5381;
    const s = "reca::" + pw;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return "fb_" + h.toString(16);
  }
}

/* ---------- Tempo ---------- */
function dayIndex(date) { return (date.getDay() + 6) % 7; } // 0=Lunedì … 6=Domenica
function isWeekend(date) { return dayIndex(date) >= 5; }
function nowHM(d) { return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
function hmToMin(hm) { const [h, m] = hm.split(":").map(Number); return h * 60 + m; }
function minToHM(min) { return String(Math.floor(min / 60) % 24).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0"); }
function dayKey(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function fmtTime12(hm) {
  const [h, m] = hm.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  let hh = h % 12; if (hh === 0) hh = 12;
  return hh + ":" + String(m).padStart(2, "0") + " " + ap;
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- Stato globale ---------- */
const state = {
  data: loadData(),
  user: null,          // { email, name, room, photo, notifEnabled }
  page: "oggi",
  clockTimer: null,
  notifTimer: null,
  qrStream: null,
  qrLoop: null,
  adminSession: false, // sessione admin: MAI persistita
  qrLoginRoom: null    // stanza letta dal QR durante il login
};
/* ============================================================
   Riconoscimento automatico: nome → stanza → turni
   ============================================================ */
/* Normalizza un nome: minuscole, senza accenti né apostrofi,
   così "Nicolò", "Nicolo'" e "nicolo" coincidono tutti. */
function normName(n) {
  return (n || "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // rimuove gli accenti
    .replace(/['’`]/g, "");                            // rimuove gli apostrofi
}

function findPerson(name) {
  const n = normName(name);
  return state.data.people.find(p => normName(p.name) === n) || null;
}
function roomOf(name) {
  const p = findPerson(name);
  return p ? p.room : null;
}
function peopleInRoom(room) {
  return state.data.people.filter(p => p.room === room).map(p => p.name);
}
function allNames() { return state.data.people.map(p => p.name); }

/* "TUTTI" o lista "A, B" → array di nomi */
function expandWho(who) {
  if (!who) return [];
  if (String(who).trim().toUpperCase() === GROUP) return allNames();
  return String(who).split(",").map(s => s.trim()).filter(Boolean);
}
function isGroup(who) { return String(who || "").trim().toUpperCase() === GROUP; }
function isMine(who) {
  if (!state.user) return false;
  if (isGroup(who)) return true; // "TUTTI" include me
  return expandWho(who).some(n => normName(n) === normName(state.user.name));
}

/* ============================================================
   OROLOGIO IN TEMPO REALE
   Sincronizzato con l'ora del dispositivo: ogni secondo
   aggiorna l'orologio e controlla gli orari dei promemoria.
   ============================================================ */
function startClock() {
  tickClock();
  clearInterval(state.clockTimer);
  state.clockTimer = setInterval(tickClock, 1000);
}
function tickClock() {
  const now = new Date();
  const t = document.getElementById("clock-time");
  const d = document.getElementById("clock-day");
  if (t) t.textContent = now.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  if (d) d.textContent = DAYS[dayIndex(now)];
  checkDueNotifications(now);
}

/* ============================================================
   NOTIFICHE (in-app + browser PWA)
   ============================================================ */
let notifPerm = "default";
async function ensureNotifPermission() {
  if (!("Notification" in window)) return "unsupported";
  if (state.user && state.user.notifEnabled === false) return "denied-by-user";
  if (Notification.permission === "default") {
    try { notifPerm = await Notification.requestPermission(); } catch (e) { notifPerm = "denied"; }
  }
  return Notification.permission;
}

function showBrowserNotification(title, body) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, { body, icon: "icons/icon-192.png", silent: true });
    n.onclick = () => { window.focus(); n.close(); };
  } catch (e) { /* alcune piattaforme richiedono ServiceWorkerRegistration.showNotification */ }
}

function showToast(msg, ms = 3500) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.hidden = true; }, ms);
}

/* Anti-duplicato: una notifica scatta una sola volta al giorno per ogni (chiave, ora) */
function notifAlreadySent(key) {
  const sent = lsGet(LS.sent, {});
  return sent[key] === dayKey(new Date());
}
function markNotifSent(key) {
  const sent = lsGet(LS.sent, {});
  sent[key] = dayKey(new Date());
  for (const k of Object.keys(sent)) if (sent[k] !== dayKey(new Date())) delete sent[k];
  lsSet(LS.sent, sent);
}

/* ============================================================
   MOTORE DI SCALEDING: confronta ora/giorno corrente con i
   turni assegnati alla persona e invia la notifica mirata.
   ============================================================ */
function checkDueNotifications(now) {
  if (!state.user) return;
  if (state.user.notifEnabled === false) return;
  const data = state.data;
  const di = dayIndex(now);
  const day = DAYS[di];
  const weekend = di >= 5;
  const hm = nowHM(now);
  const myRoom = state.user.room;

  const fire = (key, title, body) => {
    if (notifAlreadySent(key)) return;
    markNotifSent(key);
    showBrowserNotification(title, body);
    showToast(title + " — " + body);
  };

  /* --- BUCATO (feriali + weekend, orari diversi) --- */
  const bTimes = weekend ? data.orari.bucato.weekend : data.orari.bucato.feriali;
  const bMsgs = data.messaggi.bucato;
  const myLaundry = (data.bucato[day] || []).filter(l => l.room === myRoom);
  if (myLaundry.length > 0) {
    bTimes.forEach((t, i) => {
      if (t === hm) {
        const tipo = myLaundry.map(l => l.type).join(", ");
        fire("bucato|" + di + "|" + t, "🧺 Bucato – " + day, bMsgs[i] || bMsgs[0] + " (" + tipo + ")");
      }
    });
  }

  /* --- CUCINA / APPARECCHIO (weekend, orari dedicati) --- */
  const cTimes = data.orari.cucina.weekend;
  const cMsgs = data.messaggi.cucina;
  const meals = data.cucina[day] || {};
  const myMeals = [];
  if (meals.lunch && isMine(meals.lunch)) myMeals.push("Pranzo");
  if (meals.dinner && isMine(meals.dinner)) myMeals.push("Cena");
  if (myMeals.length > 0) {
    cTimes.forEach((t, i) => {
      if (t === hm) {
        fire("cucina|" + di + "|" + t, "🍽️ Apparecchio – " + day, (cMsgs[i] || cMsgs[0]) + " (" + myMeals.join(" e ") + ")");
      }
    });
  }

  /* --- PULIZIA PROFONDA STANZA (Domenica 10:40, tutti) --- */
  const ps = data.messaggi.puliziaStanza;
  if (ps && day === ps.day && hm === ps.time) {
    fire("stanza|" + di + "|" + ps.time, "🧹 Pulizia stanza", ps.text);
  }

  /* --- AGGIORNA le notifiche in-app visibili (finestra 30 min) --- */
  renderActiveNotices(now);
}

/* Notifiche in-app: ogni promemoria resta visibile per 30 minuti
   dall'orario previsto, poi scompare dall'interfaccia. */
function collectActiveNotices(now) {
  if (!state.user) return [];
  const data = state.data;
  const di = dayIndex(now);
  const day = DAYS[di];
  const weekend = di >= 5;
  const minute = now.getHours() * 60 + now.getMinutes();
  const myRoom = state.user.room;
  const out = [];
  const add = (t, ico, text, kind) => {
    const start = hmToMin(t);
    if (minute >= start && minute <= start + TURN_WINDOW_MIN) {
      out.push({ time: t, ico, text, kind, expired: false });
    } else if (minute > start + TURN_WINDOW_MIN) {
      out.push({ time: t, ico, text, kind, expired: true });
    }
  };

  const bTimes = weekend ? data.orari.bucato.weekend : data.orari.bucato.feriali;
  const bMsgs = data.messaggi.bucato;
  const myLaundry = (data.bucato[day] || []).filter(l => l.room === myRoom);
  if (myLaundry.length > 0) {
    const tipo = myLaundry.map(l => l.type).join(", ");
    bTimes.forEach((t, i) => add(t, "🧺", (bMsgs[i] || bMsgs[0]) + " (" + tipo + ")", "warn"));
  }

  const cTimes = data.orari.cucina.weekend;
  const cMsgs = data.messaggi.cucina;
  const meals = data.cucina[day] || {};
  const myMeals = [];
  if (meals.lunch && isMine(meals.lunch)) myMeals.push("Pranzo");
  if (meals.dinner && isMine(meals.dinner)) myMeals.push("Cena");
  if (myMeals.length > 0) {
    cTimes.forEach((t, i) => add(t, "🍽️", (cMsgs[i] || cMsgs[0]) + " (" + myMeals.join(" e ") + ")", "warn"));
  }

  const ps = data.messaggi.puliziaStanza;
  if (ps && day === ps.day) add(ps.time, "🧹", ps.text, "room");

  // turno di gruppo "TUTTI" in cucina (es. mercoledì pranzo)
  if (meals.lunch && isGroup(meals.lunch)) add("12:00", "👥", "A pranzo apparecchiano tutti insieme", "info");
  if (meals.dinner && isGroup(meals.dinner)) add("19:00", "👥", "A cena apparecchiano tutti insieme", "info");

  return out;
}

function renderActiveNotices(now) {
  const box = document.getElementById("active-notices");
  if (!box) return;
  const notices = collectActiveNotices(now);
  const active = notices.filter(n => !n.expired);
  if (active.length === 0) { box.innerHTML = ""; return; }
  box.innerHTML = active.map(n =>
    '<div class="notice notice-' + n.kind + '"><span class="n-ico">' + n.ico + '</span><span>' + esc(n.text) + '</span><span class="n-time">' + n.time + '</span></div>'
  ).join("");
}
/* ============================================================
   RENDER Pagine
   ============================================================ */
function renderAll() {
  renderOggi();
  renderBucato();
  renderCucina();
  renderBagno("ragazzi", "page-bagno-ragazzi");
  renderBagno("femminile", "page-bagno-femminile");
  renderBagno("giu", "page-bagno-giu");
  renderSala();
  renderProfilo();
  renderActiveNotices(new Date());
}

/* Chiavi "oggi" per ogni sezione: chi deve fare cosa oggi */
function todaysTurns() {
  const now = new Date();
  const day = DAYS[dayIndex(now)];
  const data = state.data;
  const turns = [];
  // Cucina
  const meals = data.cucina[day] || {};
  if (meals.lunch) turns.push({ ico: "🍽️", title: "Cucina – Pranzo", who: meals.lunch, mine: isMine(meals.lunch), group: isGroup(meals.lunch) });
  if (meals.dinner) turns.push({ ico: "🍽️", title: "Cucina – Cena", who: meals.dinner, mine: isMine(meals.dinner), group: isGroup(meals.dinner) });
  // Bucato (per la mia stanza)
  (data.bucato[day] || []).filter(l => l.room === state.user.room).forEach(l =>
    turns.push({ ico: "🧺", title: "Bucato", who: l.type, mine: true, group: false, room: true }));
  // Bagni
  for (const [key, label, ico] of [["ragazzi", "Bagno Ragazzi", "🚿"], ["femminile", "Bagno Femminile", "🛁"], ["giu", "Bagno Giù", "🚽"]]) {
    const who = (data.bagni[key] || {})[day];
    if (who) turns.push({ ico, title: label, who, mine: isMine(who), group: isGroup(who) });
  }
  // Sala
  const sala = (data.sala || {})[day];
  if (sala) turns.push({ ico: "🧹", title: "Pulizia Sala", who: sala, mine: isMine(sala), group: isGroup(sala) });
  // Pulizia stanza (domenica)
  const ps = data.messaggi.puliziaStanza;
  if (ps && day === ps.day) turns.push({ ico: "🧹", title: "Pulizia Stanza", who: "La tua stanza", mine: true, group: false, time: ps.time });
  return turns;
}

function whoHtml(who) {
  if (isGroup(who)) return '<span class="name-chip group">👥 Tutti insieme (' + allNames().length + ')</span>';
  const names = expandWho(who);
  return names.map(n => {
    const mine = state.user && normName(n) === normName(state.user.name);
    return '<span class="name-chip' + (mine ? " mine" : "") + '">' + esc(n) + (mine ? " (tu)" : "") + '</span>';
  }).join("");
}

function renderOggi() {
  const el = document.getElementById("page-oggi");
  const now = new Date();
  const day = DAYS[dayIndex(now)];
  const turns = todaysTurns();
  const mine = turns.filter(t => t.mine);
  el.innerHTML = `
    <div class="hero">
      <div class="hero-day">${day}</div>
      <div class="hero-name">Ciao, ${esc(state.user.name)} 👋</div>
      <div class="hero-room">${esc(state.user.room)} · ${mine.length === 0 ? "oggi non hai turni" : "hai " + mine.length + " turno/i oggi"}</div>
    </div>
    <div id="active-notices"></div>
    <div class="section-title">I tuoi turni di oggi</div>
    ${mine.length === 0 ? '<div class="card"><p class="muted">🎉 Oggi non hai turni. Riposati!</p></div>' :
      mine.map(t => `
      <div class="turno-item">
        <div class="t-ico">${t.ico}</div>
        <div class="t-body">
          <div class="t-title">${esc(t.title)} ${t.group ? '<span class="badge badge-group">Tutti</span>' : ""}</div>
          <div class="t-who">${whoHtml(t.who)}</div>
        </div>
        ${t.time ? '<div class="t-time">' + t.time + '</div>' : ""}
      </div>`).join("")}
    <div class="section-title">Tutti i turni di oggi</div>
    ${turns.map(t => `
      <div class="turno-item" style="opacity:${t.mine ? 1 : .75}">
        <div class="t-ico">${t.ico}</div>
        <div class="t-body">
          <div class="t-title">${esc(t.title)} ${t.mine ? '<span class="badge badge-mine">Tu</span>' : ""}</div>
          <div class="t-who">${whoHtml(t.who)}</div>
        </div>
      </div>`).join("")}
  `;
}

function renderBucato() {
  const el = document.getElementById("page-bucato");
  const data = state.data;
  const now = new Date();
  const di = dayIndex(now);
  const weekend = di >= 5;
  const times = weekend ? data.orari.bucato.weekend : data.orari.bucato.feriali;
  el.innerHTML = `
    <div class="page-head">
      <div class="page-title">🧺 Bucato</div>
      <div class="page-sub">Turni per camera · ${weekend ? "weekend" : "feriali"} · promemoria: ${times.join(" · ")}</div>
    </div>
    <div class="card">
      <h3>📅 Settimana</h3>
      <table class="week-table">
        <thead><tr><th>Giorno</th><th>Camere di turno</th></tr></thead>
        <tbody>
          ${DAYS.map((d, i) => {
            const items = data.bucato[d] || [];
            const isToday = i === di;
            return `<tr class="${isToday ? "today-row" : ""}">
              <td class="day-cell">${DAYS_SHORT[i]}${isToday ? " ●" : ""}</td>
              <td>${items.length === 0 ? '<span class="none-cell">Libero</span>' :
                items.map(l => `<span class="name-chip${l.room === state.user.room ? " mine" : ""}">${esc(l.room)}${l.room === state.user.room ? " (tu)" : ""} · ${esc(l.type)}</span>`).join("")}
              </td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
    <div class="card">
      <h3>📍 La tua camera</h3>
      <p class="muted">Il bucato tocca a <b style="color:var(--accent)">${esc(state.user.room)}</b>. Quando è il vostro giorno, ricevi i promemoria alle ore ${times.join(", ")}.</p>
    </div>
  `;
}

function renderCucina() {
  const el = document.getElementById("page-cucina");
  const data = state.data;
  const now = new Date();
  const di = dayIndex(now);
  el.innerHTML = `
    <div class="page-head">
      <div class="page-title">🍽️ Cucina</div>
      <div class="page-sub">Apparecchiare e sparecchiare · weekend: ${data.orari.cucina.weekend.join(" · ")}</div>
    </div>
    <div class="card">
      <h3>📅 Settimana</h3>
      <table class="week-table">
        <thead><tr><th>Giorno</th><th>Pranzo</th><th>Cena</th></tr></thead>
        <tbody>
          ${DAYS.map((d, i) => {
            const m = data.cucina[d] || {};
            const isToday = i === di;
            return `<tr class="${isToday ? "today-row" : ""}">
              <td class="day-cell">${DAYS_SHORT[i]}${isToday ? " ●" : ""}</td>
              <td>${m.lunch ? whoHtml(m.lunch) : '<span class="none-cell">—</span>'}</td>
              <td>${m.dinner ? whoHtml(m.dinner) : '<span class="none-cell">—</span>'}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
    <div class="card">
      <h3>ℹ️ Da sapere</h3>
      <p class="muted">Quando tocca a <b style="color:var(--accent)">tutti insieme</b>, apparecchiano e sparecchiano tutti i ${allNames().length} residenti. I promemoria del weekend arrivano alle ${data.orari.cucina.weekend.join(", ")}.</p>
    </div>
  `;
}

function renderBagno(key, pageId) {
  const el = document.getElementById(pageId);
  const data = state.data;
  const now = new Date();
  const di = dayIndex(now);
  const labels = { ragazzi: "🚿 Bagno Ragazzi", femminile: "🛁 Bagno Femminile", giu: "🚽 Bagno Giù" };
  const table = (data.bagni[key] || {});
  el.innerHTML = `
    <div class="page-head">
      <div class="page-title">${labels[key]}</div>
      <div class="page-sub">Turni di pulizia del bagno</div>
    </div>
    <div class="card">
      <h3>📅 Settimana</h3>
      <table class="week-table">
        <thead><tr><th>Giorno</th><th>Di turno</th></tr></thead>
        <tbody>
          ${DAYS.map((d, i) => {
            const who = table[d];
            const isToday = i === di;
            return `<tr class="${isToday ? "today-row" : ""}">
              <td class="day-cell">${DAYS_SHORT[i]}${isToday ? " ●" : ""}</td>
              <td>${who ? whoHtml(who) : '<span class="none-cell">—</span>'}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSala() {
  const el = document.getElementById("page-sala");
  const data = state.data;
  const now = new Date();
  const di = dayIndex(now);
  el.innerHTML = `
    <div class="page-head">
      <div class="page-title">🧹 Pulizia Sala</div>
      <div class="page-sub">Pulizia della sala comune</div>
    </div>
    <div class="card">
      <h3>📅 Settimana</h3>
      <table class="week-table">
        <thead><tr><th>Giorno</th><th>Di turno</th></tr></thead>
        <tbody>
          ${DAYS.map((d, i) => {
            const who = (data.sala || {})[d];
            const isToday = i === di;
            return `<tr class="${isToday ? "today-row" : ""}">
              <td class="day-cell">${DAYS_SHORT[i]}${isToday ? " ●" : ""}</td>
              <td>${who ? whoHtml(who) : '<span class="none-cell">Nessun turno</span>'}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}
/* ============================================================
   PROFILO
   ============================================================ */
function renderProfilo() {
  const el = document.getElementById("page-profilo");
  const u = state.user;
  const notifOn = u.notifEnabled !== false;
  const glowOn = lsGet(LS.glow, false);
  const initial = (u.name || "?").trim().charAt(0).toUpperCase();
  const avatarInner = u.photo
    ? '<img src="' + u.photo + '" alt="">'
    : esc(initial); // fallback: iniziale, testo #1eb9e6 su sfondo nero
  el.innerHTML = `
    <div class="profile-head">
      <div class="avatar" id="profile-avatar">${avatarInner}</div>
      <div style="flex:1;min-width:0">
        <div class="profile-name">${esc(u.name)}</div>
        <div class="profile-room">🏠 ${esc(u.room)}</div>
        <div class="profile-email">${esc(u.email)}</div>
      </div>
    </div>

    <div class="section-title">Foto profilo</div>
    <div class="card">
      <p class="muted" style="margin-bottom:12px">Scatta una foto o caricane una dalla galleria. Senza foto, mostro la tua iniziale.</p>
      <div class="photo-row">
        <button class="btn btn-ghost btn-sm" id="btn-photo-camera" type="button">📷 Scatta</button>
        <button class="btn btn-ghost btn-sm" id="btn-photo-gallery" type="button">🖼️ Galleria</button>
        ${u.photo ? '<button class="btn btn-danger btn-sm" id="btn-photo-remove" type="button">Rimuovi</button>' : ""}
      </div>
      <input type="file" id="file-camera" accept="image/*" capture="user">
      <input type="file" id="file-gallery" accept="image/*">
    </div>

    <div class="section-title">Notifiche</div>
    <div class="switch-row" id="row-notif">
      <div>
        <div class="s-label">🔔 Notifiche promemoria</div>
        <div class="s-sub">Ricordi per bucato, cucina e pulizie</div>
      </div>
      <div class="switch ${notifOn ? "on" : ""}" id="sw-notif"></div>
    </div>

    <div class="section-title">Aspetto</div>
    <div class="switch-row" id="row-glow">
      <div>
        <div class="s-label">🌈 Bordo LED RGB (Siri Glow)</div>
        <div class="s-sub">Alone multicolore animato intorno allo schermo</div>
      </div>
      <div class="switch ${glowOn ? "on" : ""}" id="sw-glow"></div>
    </div>

    <div class="section-title">Privacy</div>
    <div class="card">
      <h3>🔑 Cambia password</h3>
      <label class="field-label" for="pw-current">Password attuale</label>
      <input type="password" id="pw-current" class="input" autocomplete="current-password">
      <label class="field-label" for="pw-new">Nuova password</label>
      <input type="password" id="pw-new" class="input" autocomplete="new-password">
      <label class="field-label" for="pw-confirm">Conferma nuova password</label>
      <input type="password" id="pw-confirm" class="input" autocomplete="new-password">
      <div id="pw-msg" class="error-msg" hidden></div>
      <button class="btn btn-primary" id="btn-pw-save" type="button">Salva nuova password</button>
    </div>

    <div class="section-title">Area Admin</div>
    <div class="card">
      <p class="muted" style="margin-bottom:10px">Per modificare turni, stanze e persone. Serve username e password.</p>
      <button class="btn btn-ghost" id="btn-open-admin" type="button">⚙️ Area Admin</button>
    </div>

    <div class="section-title">Account</div>
    <button class="btn btn-danger" id="btn-logout" type="button">Esci dall'account</button>
  `;
  bindProfilo();
}

function bindProfilo() {
  const u = state.user;
  // Foto profilo
  const cam = document.getElementById("file-camera");
  const gal = document.getElementById("file-gallery");
  document.getElementById("btn-photo-camera").onclick = () => cam.click();
  document.getElementById("btn-photo-gallery").onclick = () => gal.click();
  const removeBtn = document.getElementById("btn-photo-remove");
  if (removeBtn) removeBtn.onclick = () => {
    u.photo = null;
    saveUser();
    renderProfilo();
    showToast("Foto rimossa");
  };
  const onFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      // ridimensiona per non gonfiare lo storage
      const img = new Image();
      img.onload = () => {
        const max = 320;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement("canvas");
        cv.width = Math.round(img.width * scale);
        cv.height = Math.round(img.height * scale);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        u.photo = cv.toDataURL("image/jpeg", 0.8);
        saveUser();
        renderProfilo();
        showToast("Foto profilo aggiornata ✅");
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };
  cam.onchange = e => onFile(e.target.files[0]);
  gal.onchange = e => onFile(e.target.files[0]);

  // Toggle notifiche
  document.getElementById("row-notif").onclick = async () => {
    u.notifEnabled = u.notifEnabled === false ? true : false;
    saveUser();
    if (u.notifEnabled) await ensureNotifPermission();
    renderProfilo();
    showToast(u.notifEnabled ? "Notifiche attive 🔔" : "Notifiche disattivate");
  };

  // Toggle LED
  document.getElementById("row-glow").onclick = () => {
    setGlow(!lsGet(LS.glow, false));
    renderProfilo();
  };

  // Cambio password
  document.getElementById("btn-pw-save").onclick = async () => {
    const cur = document.getElementById("pw-current").value;
    const nw = document.getElementById("pw-new").value;
    const cf = document.getElementById("pw-confirm").value;
    const msg = document.getElementById("pw-msg");
    const show = (t, ok) => { msg.hidden = false; msg.textContent = t; msg.style.color = ok ? "var(--ok)" : "var(--err)"; };
    if (!cur || !nw || !cf) return show("Compila tutti i campi.", false);
    const users = lsGet(LS.users, {});
    const rec = users[u.email];
    if (!rec || rec.pwHash !== await hashPassword(cur)) return show("Password attuale errata.", false);
    if (nw.length < 4) return show("La nuova password deve avere almeno 4 caratteri.", false);
    if (nw !== cf) return show("La conferma non corrisponde alla nuova password.", false);
    rec.pwHash = await hashPassword(nw);
    lsSet(LS.users, users);
    show("Password aggiornata ✅", true);
    document.getElementById("pw-current").value = "";
    document.getElementById("pw-new").value = "";
    document.getElementById("pw-confirm").value = "";
  };

  // Admin
  document.getElementById("btn-open-admin").onclick = openAdmin;
  // Logout
  document.getElementById("btn-logout").onclick = logout;
}

/* ============================================================
   ACCOUNT (localStorage)
   ============================================================ */
function saveUser() {
  const users = lsGet(LS.users, {});
  const rec = users[state.user.email] || {};
  rec.email = state.user.email;
  rec.name = state.user.name;
  rec.room = state.user.room;
  rec.photo = state.user.photo || null;
  rec.notifEnabled = state.user.notifEnabled !== false;
  rec.updatedAt = Date.now();
  users[state.user.email] = rec;
  lsSet(LS.users, users);
  lsSet(LS.session, { email: state.user.email });
}

function doLogin(email, name) {
  // Riconoscimento automatico: nome → camera → turni
  const person = findPerson(name);
  if (!person) return { ok: false, error: "Nome non riconosciuto. Inserisci il tuo nome vero (es. Elia, Adamo, Djily…)." };
  state.user = {
    email: email.toLowerCase(),
    name: person.name,
    room: person.room,
    photo: null,
    notifEnabled: true
  };
  const users = lsGet(LS.users, {});
  const rec = users[state.user.email];
  if (rec) { state.user.photo = rec.photo || null; state.user.notifEnabled = rec.notifEnabled !== false; }
  saveUser();
  return { ok: true };
}

function logout() {
  localStorage.removeItem(LS.session);
  state.user = null;
  clearInterval(state.clockTimer);
  document.getElementById("main").hidden = true;
  showScreen("screen-login");
  showToast("Sei uscito. A presto! 👋");
}

/* ============================================================
   SIRI GLOW (toggle + persistenza)
   ============================================================ */
function setGlow(on) {
  lsSet(LS.glow, !!on);
  applyGlow();
}
function applyGlow() {
  const on = lsGet(LS.glow, false);
  const g = document.getElementById("siri-glow");
  const btn = document.getElementById("glow-toggle-top");
  if (g) g.classList.toggle("on", on);
  if (btn) btn.classList.toggle("on", on);
}
/* ============================================================
   AREA ADMIN
   - Login obbligatorio (admin / Consegna.CRP2)
   - La sessione NON viene mai memorizzata: uscendo si distrugge
   ============================================================ */
function openAdmin() {
  state.adminSession = false; // sempre falso all'apertura
  document.getElementById("admin-login-wrap").hidden = false;
  document.getElementById("admin-panel").hidden = true;
  document.getElementById("main").hidden = true;
  document.getElementById("screen-gate").hidden = true;
  document.getElementById("screen-login").hidden = true;
  showScreen("screen-admin");
  document.getElementById("admin-user").value = "";
  document.getElementById("admin-pass").value = "";
  document.getElementById("admin-error").hidden = true;
}

function closeAdmin() {
  // DISTRUGGI la sessione admin immediatamente
  state.adminSession = false;
  document.getElementById("screen-admin").hidden = true;
  if (state.user) {
    document.getElementById("main").hidden = false;
    showScreen(null);
  } else {
    showScreen("screen-login");
  }
}

function bindAdmin() {
  document.getElementById("form-admin").onsubmit = (e) => {
    e.preventDefault();
    const u = document.getElementById("admin-user").value.trim();
    const p = document.getElementById("admin-pass").value;
    const err = document.getElementById("admin-error");
    if (u === ADMIN_USER && p === ADMIN_PASS) {
      state.adminSession = true; // solo in memoria, mai su localStorage
      err.hidden = true;
      renderAdminPanel();
    } else {
      err.hidden = false;
      err.textContent = "❌ Credenziali errate. Accesso negato.";
    }
  };
  document.getElementById("admin-back").onclick = closeAdmin;
}

function renderAdminPanel() {
  document.getElementById("admin-login-wrap").hidden = true;
  const panel = document.getElementById("admin-panel");
  panel.hidden = false;
  const d = state.data;
  panel.innerHTML = `
    <div class="admin-panel-head">
      <h2>⚙️ Pannello Admin</h2>
      <button class="btn btn-danger btn-sm" id="admin-logout" type="button">Esci (distruggi sessione)</button>
    </div>
    <div class="admin-tabs">
      <button class="admin-tab active" data-atab="persone" type="button">Persone & Stanze</button>
      <button class="admin-tab" data-atab="turni" type="button">Turni</button>
      <button class="admin-tab" data-atab="orari" type="button">Orari & Messaggi</button>
      <button class="admin-tab" data-atab="qr" type="button">QR Code</button>
    </div>
    <div id="admin-content"></div>
    <div class="admin-save-bar">
      <button class="btn btn-primary" id="admin-save" type="button">💾 Salva tutte le modifiche</button>
      <div class="saved-flash" id="admin-saved">✅ Salvato! I turni sono aggiornati per tutti.</div>
    </div>
  `;
  document.getElementById("admin-logout").onclick = closeAdmin;
  panel.querySelectorAll(".admin-tab").forEach(t => t.onclick = () => {
    panel.querySelectorAll(".admin-tab").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    renderAdminTab(t.dataset.atab);
  });
  document.getElementById("admin-save").onclick = saveAdminChanges;
  renderAdminTab("persone");
}

function renderAdminTab(tab) {
  const c = document.getElementById("admin-content");
  const d = state.data;
  if (tab === "persone") {
    c.innerHTML = `
      <div class="admin-section">
        <h3>👥 Persone e stanze</h3>
        <p class="admin-note">Cambia il nome di una persona o a quale camera appartiene. I turni e le notifiche si aggiorneranno subito al salvataggio.</p>
        ${d.people.map((p, i) => `
          <div class="admin-row">
            <span class="day-label">Persona ${i + 1}</span>
            <div style="display:grid;grid-template-columns:1fr 110px;gap:8px">
              <input class="input adm-name" data-i="${i}" value="${esc(p.name)}" placeholder="Nome">
              <select class="input adm-room" data-i="${i}">
                ${d.rooms.map(r => `<option value="${esc(r)}"${r === p.room ? " selected" : ""}>${esc(r)}</option>`).join("")}
              </select>
            </div>
          </div>`).join("")}
        <p class="admin-note">💡 Suggerimento: usa "TUTTI" (maiuscolo) nei turni per indicare un turno di gruppo.</p>
      </div>`;
  }
  else if (tab === "turni") {
    c.innerHTML = `
      <div class="admin-section">
        <h3>🍽️ Cucina – Apparecchiare / Sparecchiare</h3>
        <p class="admin-note">Inserisci il nome (o "TUTTI" per il turno di gruppo).</p>
        ${DAYS.map(day => `
          <div class="admin-row">
            <span class="day-label">${day}</span>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <input class="input adm-cucina-l" data-day="${day}" value="${esc((d.cucina[day] || {}).lunch || "")}" placeholder="Pranzo">
              <input class="input adm-cucina-d" data-day="${day}" value="${esc((d.cucina[day] || {}).dinner || "")}" placeholder="Cena">
            </div>
          </div>`).join("")}
      </div>
      <div class="admin-section">
        <h3>🧺 Bucato (per camera)</h3>
        <p class="admin-note">Ogni giorno due camere: la prima fa "Lenzuola e vestiti", la seconda "Vestiti". Lascia vuoto per giorno libero.</p>
        ${DAYS.map(day => {
          const items = d.bucato[day] || [];
          const r1 = items[0] ? items[0].room : "";
          const t1 = items[0] ? items[0].type : "";
          const r2 = items[1] ? items[1].room : "";
          const t2 = items[1] ? items[1].type : "";
          return `
          <div class="admin-row">
            <span class="day-label">${day}</span>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <div style="display:grid;gap:6px">
                <select class="input adm-bucato-r1" data-day="${day}">
                  <option value="">—</option>
                  ${d.rooms.map(r => `<option value="${esc(r)}"${r === r1 ? " selected" : ""}>${esc(r)}</option>`).join("")}
                </select>
                <input class="input adm-bucato-t1" data-day="${day}" value="${esc(t1)}" placeholder="Tipo (es. Lenzuola e vestiti)">
              </div>
              <div style="display:grid;gap:6px">
                <select class="input adm-bucato-r2" data-day="${day}">
                  <option value="">—</option>
                  ${d.rooms.map(r => `<option value="${esc(r)}"${r === r2 ? " selected" : ""}>${esc(r)}</option>`).join("")}
                </select>
                <input class="input adm-bucato-t2" data-day="${day}" value="${esc(t2)}" placeholder="Tipo (es. Vestiti)">
              </div>
            </div>
          </div>`;
        }).join("")}
      </div>
      <div class="admin-section">
        <h3>🚿 Bagni e Sala</h3>
        <p class="admin-note">Separa più nomi con una virgola (es. "Camilla, Chiara"). Usa "TUTTI" per il turno di gruppo. Lascia vuoto per nessun turno.</p>
        ${[["ragazzi", "Bagno Ragazzi"], ["femminile", "Bagno Femminile"], ["giu", "Bagno Giù"]].map(([key, label]) => `
          <h3 style="margin-top:14px">${label}</h3>
          ${DAYS.map(day => `
            <div class="admin-row">
              <span class="day-label">${day}</span>
              <input class="input adm-bagno" data-key="${key}" data-day="${day}" value="${esc((d.bagni[key] || {})[day] || "")}" placeholder="Nome/i">
            </div>`).join("")}
        `).join("")}
        <h3 style="margin-top:14px">🧹 Pulizia Sala</h3>
        ${DAYS.map(day => `
          <div class="admin-row">
            <span class="day-label">${day}</span>
            <input class="input adm-sala" data-day="${day}" value="${esc((d.sala || {})[day] || "")}" placeholder="Nome/i">
          </div>`).join("")}
      </div>`;
  }
  else if (tab === "orari") {
    const o = d.orari, m = d.messaggi;
    c.innerHTML = `
      <div class="admin-section">
        <h3>🧺 Orari promemoria bucato</h3>
        <div class="admin-row"><span class="day-label">Feriali</span><input class="input adm-or-buf" value="${o.bucato.feriali.join(", ")}" placeholder="07:30, 13:00, 21:00"></div>
        <div class="admin-row"><span class="day-label">Weekend</span><input class="input adm-or-buw" value="${o.bucato.weekend.join(", ")}" placeholder="08:30, 12:30, 20:30"></div>
        <h3 style="margin-top:14px">🍽️ Orari promemoria cucina (weekend)</h3>
        <div class="admin-row"><span class="day-label">Weekend</span><input class="input adm-or-cuw" value="${o.cucina.weekend.join(", ")}" placeholder="08:30, 12:00, 19:20"></div>
      </div>
      <div class="admin-section">
        <h3>💬 Messaggi notifiche</h3>
        <div class="admin-row"><span class="day-label">Bucato 1</span><input class="input adm-msg-b1" value="${esc(m.bucato[0] || "")}"></div>
        <div class="admin-row"><span class="day-label">Bucato 2</span><input class="input adm-msg-b2" value="${esc(m.bucato[1] || "")}"></div>
        <div class="admin-row"><span class="day-label">Bucato 3</span><input class="input adm-msg-b3" value="${esc(m.bucato[2] || "")}"></div>
        <div class="admin-row"><span class="day-label">Cucina 1</span><input class="input adm-msg-c1" value="${esc(m.cucina[0] || "")}"></div>
        <div class="admin-row"><span class="day-label">Cucina 2</span><input class="input adm-msg-c2" value="${esc(m.cucina[1] || "")}"></div>
        <div class="admin-row"><span class="day-label">Cucina 3</span><input class="input adm-msg-c3" value="${esc(m.cucina[2] || "")}"></div>
        <h3 style="margin-top:14px">🧹 Pulizia profonda stanza</h3>
        <div class="admin-row"><span class="day-label">Giorno</span>
          <select class="input adm-ps-day">
            ${DAYS.map(x => `<option${x === m.puliziaStanza.day ? " selected" : ""}>${x}</option>`).join("")}
          </select>
        </div>
        <div class="admin-row"><span class="day-label">Ora</span><input class="input adm-ps-time" value="${esc(m.puliziaStanza.time)}" placeholder="10:40"></div>
        <div class="admin-row"><span class="day-label">Testo</span><input class="input adm-ps-text" value="${esc(m.puliziaStanza.text)}"></div>
      </div>
      <div class="admin-section">
        <h3>🔐 Codice Segreto della Casa</h3>
        <p class="admin-note">Il codice richiesto all'avvio dell'app per entrare in casa.</p>
        <div class="admin-row"><span class="day-label">Codice</span><input class="input adm-gate-code" value="${esc(getGateCode())}"></div>
      </div>`;
  }
  else if (tab === "qr") {
    c.innerHTML = `
      <div class="admin-section">
        <h3>📷 QR Code per le camere</h3>
        <p class="admin-note">Stampa ogni QR e attaccalo sulla porta della camera corrispondente. Ogni QR contiene: {"type":"room","identifier":"Camera X"}</p>
        <div class="qr-grid" id="qr-grid"></div>
      </div>`;
    drawRoomQRs();
  }
}

/* Genera i QR code delle stanze (libreria qrcode-generator) */
function drawRoomQRs() {
  const grid = document.getElementById("qr-grid");
  if (!grid || typeof qrcode === "undefined") {
    if (grid) grid.innerHTML = '<p class="muted">Libreria QR non caricata.</p>';
    return;
  }
  grid.innerHTML = "";
  state.data.rooms.forEach(room => {
    const data = JSON.stringify({ type: "room", identifier: room });
    const qr = qrcode(0, "M");
    qr.addData(data);
    qr.make();
    const card = document.createElement("div");
    card.className = "qr-card";
    const cv = document.createElement("canvas");
    const size = 120;
    cv.width = size; cv.height = size;
    const ctx = cv.getContext("2d");
    const n = qr.getModuleCount();
    const cell = Math.floor(size / (n + 8));
    const off = Math.floor((size - cell * n) / 2);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#000000";
    for (let r = 0; r < n; r++)
      for (let col = 0; col < n; col++)
        if (qr.isDark(r, col)) ctx.fillRect(off + col * cell, off + r * cell, cell, cell);
    card.appendChild(cv);
    const lbl = document.createElement("div");
    lbl.className = "qr-room";
    lbl.textContent = room;
    card.appendChild(lbl);
    const dt = document.createElement("div");
    dt.className = "qr-data";
    dt.textContent = data;
    card.appendChild(dt);
    grid.appendChild(card);
  });
}

/* Rilegge i campi del pannello e salva in localStorage */
function saveAdminChanges() {
  const d = state.data;
  // Persone
  document.querySelectorAll(".adm-name").forEach(el => {
    const i = +el.dataset.i;
    if (el.value.trim()) d.people[i].name = el.value.trim();
  });
  document.querySelectorAll(".adm-room").forEach(el => {
    d.people[+el.dataset.i].room = el.value;
  });
  // Cucina
  document.querySelectorAll(".adm-cucina-l").forEach(el => {
    const day = el.dataset.day;
    d.cucina[day] = d.cucina[day] || {};
    d.cucina[day].lunch = el.value.trim();
  });
  document.querySelectorAll(".adm-cucina-d").forEach(el => {
    const day = el.dataset.day;
    d.cucina[day] = d.cucina[day] || {};
    d.cucina[day].dinner = el.value.trim();
  });
  // Bucato
  DAYS.forEach(day => {
    const r1 = document.querySelector(`.adm-bucato-r1[data-day="${day}"]`).value;
    const t1 = document.querySelector(`.adm-bucato-t1[data-day="${day}"]`).value.trim();
    const r2 = document.querySelector(`.adm-bucato-r2[data-day="${day}"]`).value;
    const t2 = document.querySelector(`.adm-bucato-t2[data-day="${day}"]`).value.trim();
    const items = [];
    if (r1) items.push({ room: r1, type: t1 || "Vestiti" });
    if (r2) items.push({ room: r2, type: t2 || "Vestiti" });
    d.bucato[day] = items;
  });
  // Bagni
  document.querySelectorAll(".adm-bagno").forEach(el => {
    const { key, day } = el.dataset;
    d.bagni[key] = d.bagni[key] || {};
    d.bagni[key][day] = el.value.trim();
  });
  // Sala
  document.querySelectorAll(".adm-sala").forEach(el => {
    d.sala = d.sala || {};
    d.sala[el.dataset.day] = el.value.trim();
  });
  // Orari
  const parseTimes = (s) => s.split(",").map(x => x.trim()).filter(x => /^\d{1,2}:\d{2}$/.test(x)).map(x => x.padStart(5, "0"));
  d.orari.bucato.feriali = parseTimes(document.querySelector(".adm-or-buf").value) || d.orari.bucato.feriali;
  d.orari.bucato.weekend = parseTimes(document.querySelector(".adm-or-buw").value) || d.orari.bucato.weekend;
  d.orari.cucina.weekend = parseTimes(document.querySelector(".adm-or-cuw").value) || d.orari.cucina.weekend;
  // Messaggi
  d.messaggi.bucato = [".adm-msg-b1", ".adm-msg-b2", ".adm-msg-b3"].map(s => document.querySelector(s).value.trim());
  d.messaggi.cucina = [".adm-msg-c1", ".adm-msg-c2", ".adm-msg-c3"].map(s => document.querySelector(s).value.trim());
  d.messaggi.puliziaStanza.day = document.querySelector(".adm-ps-day").value;
  d.messaggi.puliziaStanza.time = document.querySelector(".adm-ps-time").value.trim();
  d.messaggi.puliziaStanza.text = document.querySelector(".adm-ps-text").value.trim();
  // Codice segreto della casa
  const gateInput = document.querySelector(".adm-gate-code");
  if (gateInput && gateInput.value.trim()) lsSet(LS.gate, gateInput.value.trim());

  saveData(d);
  state.data = d;
  // Aggiorna la stanza dell'utente corrente se il nome è ancora valido
  if (state.user) {
    const p = findPerson(state.user.name);
    if (p) state.user.room = p.room;
    saveUser();
  }
  renderAll();
  const flash = document.getElementById("admin-saved");
  flash.classList.add("show");
  setTimeout(() => flash.classList.remove("show"), 2500);
  showToast("Modifiche salvate ✅");
}
/* ============================================================
   SCANNER QR CODE (fotocamera, nativa via getUserMedia + jsQR)
   ============================================================ */
function openQRScanner(purpose) {
  // purpose: "login" (accesso con QR della camera) | "link" (collega stanza)
  state.qrPurpose = purpose;
  const overlay = document.getElementById("qr-overlay");
  const title = document.getElementById("qr-title");
  const hint = document.getElementById("qr-hint");
  const status = document.getElementById("qr-status");
  const result = document.getElementById("qr-result");
  title.textContent = purpose === "login" ? "Scanner QR – Camera" : "Scanner QR – Collega la stanza";
  hint.textContent = purpose === "login"
    ? "Inquadra il QR Code sulla porta della tua camera, poi conferma con nome e password."
    : "Inquadra il QR Code sulla porta della camera.";
  result.hidden = true;
  result.innerHTML = "";
  overlay.hidden = false;
  startCameraScan(status);
}

async function startCameraScan(statusEl) {
  stopCameraScan();
  const video = document.getElementById("qr-video");
  const canvas = document.getElementById("qr-canvas");
  statusEl.textContent = "Avvio fotocamera…";
  try {
    state.qrStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });
    video.srcObject = state.qrStream;
    await video.play();
    statusEl.textContent = "Inquadra il QR Code";
    // loop di scansione
    const scan = () => {
      if (overlayHidden()) return;
      if (video.readyState >= 2) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0);
        const imgData = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
        const code = (typeof jsQR !== "undefined") ? jsQR(imgData.data, imgData.width, imgData.height) : null;
        if (code && code.data) {
          onQRDetected(code.data);
          return;
        }
      }
      state.qrLoop = requestAnimationFrame(scan);
    };
    state.qrLoop = requestAnimationFrame(scan);
  } catch (e) {
    statusEl.textContent = "Fotocamera non disponibile. Usa l'accesso con nome.";
  }
}
function overlayHidden() { return document.getElementById("qr-overlay").hidden; }

function stopCameraScan() {
  if (state.qrLoop) cancelAnimationFrame(state.qrLoop);
  state.qrLoop = null;
  if (state.qrStream) {
    state.qrStream.getTracks().forEach(t => t.stop());
    state.qrStream = null;
  }
  const video = document.getElementById("qr-video");
  if (video) video.srcObject = null;
}

function closeQRScanner() {
  stopCameraScan();
  document.getElementById("qr-overlay").hidden = true;
}

/* Interpreta il contenuto del QR:
   - JSON: {"type":"room","identifier":"Camera 1"}
   - URL:  https://housechore.app/link?type=room&identifier=Camera1
   - Testo semplice: "Camera 1"
*/
function parseQRContent(raw) {
  let text = (raw || "").trim();
  try {
    const obj = JSON.parse(text);
    if (obj && obj.type === "room" && obj.identifier) return { room: String(obj.identifier).trim() };
  } catch (e) { /* non è JSON */ }
  if (text.startsWith("http")) {
    try {
      const u = new URL(text);
      const id = u.searchParams.get("identifier");
      if (u.searchParams.get("type") === "room" && id) return { room: id.trim() };
    } catch (e) { /* URL non valido */ }
  }
  // testo semplice
  const m = text.match(/camera\s*\d/i);
  if (m) return { room: "Camera " + m[0].match(/\d+/)[0] };
  return { room: text };
}

function onQRDetected(raw) {
  stopCameraScan();
  const parsed = parseQRContent(raw);
  const valid = state.data.rooms.includes(parsed.room);
  const result = document.getElementById("qr-result");
  const status = document.getElementById("qr-status");
  status.textContent = valid ? "✅ QR riconosciuto" : "⚠️ Camera non riconosciuta";

  if (state.qrPurpose === "login") {
    if (!valid) {
      result.hidden = false;
      result.innerHTML = `<div class="big" style="color:var(--err)">Camera non valida</div>
        <p class="muted">Il QR letto è "${esc(parsed.room)}". Deve essere una delle camere della casa.</p>
        <button class="btn btn-ghost" id="qr-retry" type="button">↻ Riprova</button>`;
      document.getElementById("qr-retry").onclick = () => {
        document.getElementById("qr-result").hidden = true;
        startCameraScan(status);
      };
      return;
    }
    state.qrLoginRoom = parsed.room;
    result.hidden = false;
    result.innerHTML = `<div class="big" style="color:var(--ok)">📷 ${esc(parsed.room)} letta</div>
      <p class="muted">Ora inserisci il tuo nome e la password per accedere.</p>
      <button class="btn btn-primary" id="qr-continue" type="button">Continua con nome e password</button>`;
    document.getElementById("qr-continue").onclick = () => {
      closeQRScanner();
      // passa alla form di login con la stanza pre-letta
      document.getElementById("tab-login").click();
      const hint = document.querySelector("#screen-login .hint");
      if (hint) hint.textContent = "Camera letta dal QR: " + parsed.room + " — inserisci il tuo nome e la password.";
      document.getElementById("reg-name").placeholder = "es. " + (peopleInRoom(parsed.room)[0] || "Elia");
    };
  } else {
    // purpose "link": collega la stanza all'utente corrente
    if (!valid) {
      result.hidden = false;
      result.innerHTML = `<div class="big" style="color:var(--err)">QR non valido</div>
        <p class="muted">Il QR letto è "${esc(parsed.room)}".</p>`;
      return;
    }
    result.hidden = false;
    result.innerHTML = `<div class="big" style="color:var(--ok)">Sei ora collegato a ${esc(parsed.room)}! 🎉</div>
      <button class="btn btn-primary" id="qr-done" type="button">Fatto</button>`;
    document.getElementById("qr-done").onclick = () => {
      closeQRScanner();
      showToast("Sei ora collegato a " + parsed.room + "!");
    };
  }
}

/* ============================================================
   NAVIGAZIONE
   ============================================================ */
function showScreen(id) {
  ["screen-gate", "screen-login", "screen-admin"].forEach(s => {
    document.getElementById(s).hidden = (s !== id);
  });
}
function goPage(page) {
  state.page = page;
  document.querySelectorAll("#pages .page").forEach(p => p.hidden = true);
  document.getElementById("page-" + page).hidden = false;
  document.querySelectorAll(".nav-item").forEach(n =>
    n.classList.toggle("active", n.dataset.page === page));
  // re-render per dati freschi
  if (page === "oggi") renderOggi();
  else if (page === "bucato") renderBucato();
  else if (page === "cucina") renderCucina();
  else if (page === "profilo") renderProfilo();
  document.getElementById("pages").scrollTop = 0;
}

/* ============================================================
   CODICE SEGRETO DELLA CASA (protezione all'avvio)
   ============================================================ */
function getGateCode() {
  let code = lsGet(LS.gate, null);
  if (!code) {
    code = "RECA2026";
    lsSet(LS.gate, code);
  }
  return code;
}
function bindGate() {
  const input = document.getElementById("gate-code-input");
  const btn = document.getElementById("gate-btn");
  const err = document.getElementById("gate-error");
  const hint = document.getElementById("gate-hint");
  hint.textContent = "Primo avvio: il codice è " + getGateCode() + " (puoi cambiarlo in Area Admin → Orari).";
  const tryGate = () => {
    if (input.value === getGateCode()) {
      err.hidden = true;
      showScreen("screen-login");
    } else {
      err.hidden = false;
      err.textContent = "❌ Codice errato. Riprova.";
    }
  };
  btn.onclick = tryGate;
  input.onkeydown = e => { if (e.key === "Enter") tryGate(); };
}

/* ============================================================
   LOGIN / REGISTRAZIONE
   ============================================================ */
function bindLogin() {
  // Tab
  const tabL = document.getElementById("tab-login");
  const tabR = document.getElementById("tab-register");
  const formL = document.getElementById("form-login");
  const formR = document.getElementById("form-register");
  tabL.onclick = () => {
    tabL.classList.add("active"); tabR.classList.remove("active");
    formL.hidden = false; formR.hidden = true;
  };
  tabR.onclick = () => {
    tabR.classList.add("active"); tabL.classList.remove("active");
    formR.hidden = false; formL.hidden = true;
  };

  // Registrazione
  formR.onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById("reg-name").value.trim();
    const email = document.getElementById("reg-email").value.trim().toLowerCase();
    const pass = document.getElementById("reg-pass").value;
    const err = document.getElementById("reg-error");
    const show = (t) => { err.hidden = false; err.textContent = t; };
    if (!name) return show("Inserisci il tuo nome vero.");
    if (pass.length < 4) return show("La password deve avere almeno 4 caratteri.");
    const users = lsGet(LS.users, {});
    // email già usata?
    for (const k of Object.keys(users)) if (k === email) return show("Questa email è già registrata. Usa 'Accedi'.");
    const person = findPerson(name);
    if (!person) return show("Nome non riconosciuto. Usa il tuo nome vero (es. Elia, Adamo, Djily…).");
    users[email] = {
      email, name: person.name, room: person.room,
      pwHash: await hashPassword(pass),
      photo: null, notifEnabled: true, createdAt: Date.now()
    };
    lsSet(LS.users, users);
    const r = doLogin(email, name);
    if (r.ok) enterApp();
  };

  // Login
  formL.onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim().toLowerCase();
    const pass = document.getElementById("login-pass").value;
    const err = document.getElementById("login-error");
    const show = (t) => { err.hidden = false; err.textContent = t; };
    const users = lsGet(LS.users, {});
    const rec = users[email];
    if (!rec) return show("Email non registrata. Usa 'Crea account'.");
    if (rec.pwHash !== await hashPassword(pass)) return show("Password errata.");
    const r = doLogin(email, rec.name);
    if (!r.ok) return show(r.error);
    enterApp();
  };

  // QR login
  document.getElementById("btn-qr-login").onclick = () => openQRScanner("login");
}

function enterApp() {
  showScreen(null);
  document.getElementById("main").hidden = false;
  applyGlow();
  renderAll();
  goPage("oggi");
  startClock();
  ensureNotifPermission();
  // Notifica di benvenuto con i turni di oggi
  const mine = todaysTurns().filter(t => t.mine);
  if (mine.length > 0) {
    showToast("👋 Ciao " + state.user.name + "! Hai " + mine.length + " turno/i oggi.", 4500);
  }
}

/* ============================================================
   AVVIO
   ============================================================ */
function bindGlobal() {
  // Bottom nav
  document.querySelectorAll(".nav-item").forEach(n => n.onclick = () => goPage(n.dataset.page));
  // Toggle LED nel topbar
  document.getElementById("glow-toggle-top").onclick = () => setGlow(!lsGet(LS.glow, false));
  // Chiusura scanner
  document.getElementById("qr-close").onclick = closeQRScanner;
  // Se l'utente chiude l'app da admin, distruggi la sessione
  window.addEventListener("beforeunload", () => { state.adminSession = false; });
}

async function init() {
  bindGlobal();
  bindGate();
  bindLogin();
  bindAdmin();
  applyGlow();

  // Registra il Service Worker (PWA offline)
  if ("serviceWorker" in navigator) {
    try { await navigator.serviceWorker.register("service-worker.js"); }
    catch (e) { console.warn("SW non registrato:", e); }
  }

  // Sessione esistente?
  const session = lsGet(LS.session, null);
  if (session && session.email) {
    const users = lsGet(LS.users, {});
    const rec = users[session.email];
    if (rec) {
      const r = doLogin(session.email, rec.name);
      if (r.ok) {
        document.getElementById("screen-gate").hidden = true;
        enterApp();
        return;
      }
    }
  }
  // Altrimenti: codice segreto della casa
  showScreen("screen-gate");
}

document.addEventListener("DOMContentLoaded", init);