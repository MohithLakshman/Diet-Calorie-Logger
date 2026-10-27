(() => {
  "use strict";

  const STORAGE_KEY = "dietLogger.v1";
  const MEALS = ["Breakfast", "Lunch", "Dinner", "Snack"];
  const CIRCUMFERENCE = 2 * Math.PI * 52;

  const $ = (id) => document.getElementById(id);

  // ---- Storage layer: server API when available, localStorage otherwise ----
  let mode = "local"; // "api" | "local"

  const local = {
    load() {
      try {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (data && typeof data === "object") {
          return { goal: Number(data.goal) || 2000, days: data.days || {} };
        }
      } catch (e) { /* ignore corrupt data */ }
      return { goal: 2000, days: {} };
    },
    save() {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
    }
  };

  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      let msg = `Request failed (${res.status})`;
      try { msg = (await res.json()).error || msg; } catch (e) { /* no body */ }
      throw new Error(msg);
    }
    return res.status === 204 ? null : res.json();
  }

  async function detectBackend() {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch("api/state", { signal: ctrl.signal });
      clearTimeout(timer);
      const type = res.headers.get("content-type") || "";
      if (res.ok && type.includes("application/json")) {
        const data = await res.json();
        mode = "api";
        return { goal: Number(data.goal) || 2000, days: data.days || {} };
      }
    } catch (e) { /* no backend reachable */ }
    return null;
  }

  let state = { goal: 2000, days: {} };

  // ---- Dates ----
  function toKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  function fromKey(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  let currentKey = toKey(new Date());

  // ---- Helpers ----
  const num = (v) => Math.max(0, Number(v) || 0);
  const round = (n) => Math.round(n * 10) / 10;
  function entriesFor(key) { return state.days[key] || []; }
  function totals(entries) {
    return entries.reduce((t, e) => ({
      cal: t.cal + e.cal, p: t.p + e.p, c: t.c + e.c, f: t.f + e.f
    }), { cal: 0, p: 0, c: 0, f: 0 });
  }
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    children.forEach((c) => node.append(c));
    return node;
  }
  function showError(err) {
    alert(err && err.message ? err.message : "Something went wrong. Please try again.");
  }

  // ---- Render ----
  function render() {
    $("date").value = currentKey;
    $("goal").value = state.goal;
    $("goalText").textContent = state.goal;
    $("storage").textContent = mode === "api" ? "Synced with server" : "Saved in this browser";

    const entries = entriesFor(currentKey);
    const t = totals(entries);

    $("total").textContent = Math.round(t.cal);
    $("mP").textContent = round(t.p);
    $("mC").textContent = round(t.c);
    $("mF").textContent = round(t.f);

    const ratio = Math.min(t.cal / state.goal, 1);
    const ring = $("ringFg");
    ring.style.strokeDasharray = CIRCUMFERENCE;
    ring.style.strokeDashoffset = CIRCUMFERENCE * (1 - ratio);
    ring.classList.toggle("over", t.cal > state.goal);

    const diff = Math.round(state.goal - t.cal);
    $("remaining").textContent = diff >= 0
      ? `${diff} kcal remaining`
      : `${Math.abs(diff)} kcal over your goal`;

    renderLog(entries);
    renderChart();
  }

  function renderLog(entries) {
    const log = $("log");
    log.replaceChildren();
    if (!entries.length) {
      log.append(el("p", { className: "empty", textContent: "Nothing logged yet. Add your first meal above." }));
      return;
    }
    MEALS.forEach((meal) => {
      const group = entries.filter((e) => e.meal === meal);
      if (!group.length) return;
      const sum = group.reduce((s, e) => s + e.cal, 0);
      const wrap = el("div", { className: "meal-group" });
      wrap.append(el("h3", {}, el("span", { textContent: meal }), el("span", { textContent: `${Math.round(sum)} kcal` })));
      group.forEach((e) => {
        const info = el("div", { className: "info" }, el("strong", { textContent: e.name }));
        info.append(el("small", { textContent: `${Math.round(e.cal)} kcal · P ${round(e.p)}g · C ${round(e.c)}g · F ${round(e.f)}g` }));
        const del = el("button", { textContent: "✕", title: "Delete", type: "button" });
        del.setAttribute("aria-label", `Delete ${e.name}`);
        del.addEventListener("click", () => removeEntry(e.id));
        wrap.append(el("div", { className: "entry" }, info, del));
      });
      log.append(wrap);
    });
  }

  function renderChart() {
    const chart = $("chart");
    chart.replaceChildren();
    const end = fromKey(currentKey);
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(end.getDate() - i);
      const key = toKey(d);
      days.push({ key, label: d.toLocaleDateString(undefined, { weekday: "short" }), cal: totals(entriesFor(key)).cal });
    }
    const max = Math.max(state.goal, ...days.map((d) => d.cal)) || 1;
    days.forEach((d) => {
      const bar = el("div", { className: "bar" + (d.cal > state.goal ? " over" : "") });
      bar.style.height = `${(d.cal / max) * 100}%`;
      bar.title = `${d.key}: ${Math.round(d.cal)} kcal`;
      const col = el("div", { className: "bar-col" },
        el("em", { textContent: d.cal ? Math.round(d.cal) : "" }), bar,
        el("span", { textContent: d.label }));
      chart.append(col);
    });
  }

  // ---- Actions ----
  async function addEntry(data) {
    let entry;
    if (mode === "api") {
      entry = await api("POST", `api/days/${currentKey}/entries`, data);
    } else {
      entry = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ...data };
    }
    (state.days[currentKey] ||= []).push(entry);
    if (mode === "local") local.save();
    render();
  }
  async function removeEntry(id) {
    try {
      if (mode === "api") await api("DELETE", `api/days/${currentKey}/entries/${encodeURIComponent(id)}`);
    } catch (err) { return showError(err); }
    state.days[currentKey] = entriesFor(currentKey).filter((e) => e.id !== id);
    if (!state.days[currentKey].length) delete state.days[currentKey];
    if (mode === "local") local.save();
    render();
  }
  async function setGoal(goal) {
    try {
      if (mode === "api") goal = (await api("PUT", "api/goal", { goal })).goal;
    } catch (err) { showError(err); return render(); }
    state.goal = goal;
    if (mode === "local") local.save();
    render();
  }
  async function clearDay() {
    try {
      if (mode === "api") await api("DELETE", `api/days/${currentKey}`);
    } catch (err) { return showError(err); }
    delete state.days[currentKey];
    if (mode === "local") local.save();
    render();
  }
  function shiftDay(delta) {
    const d = fromKey(currentKey);
    d.setDate(d.getDate() + delta);
    currentKey = toKey(d);
    render();
  }
  function exportCsv() {
    const rows = [["Date", "Meal", "Food", "Calories", "Protein_g", "Carbs_g", "Fat_g"]];
    Object.keys(state.days).sort().forEach((key) => {
      state.days[key].forEach((e) => rows.push([key, e.meal, e.name, e.cal, e.p, e.c, e.f]));
    });
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = el("a", { href: url, download: "diet-log.csv" });
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ---- Events ----
  $("form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const name = $("name").value.trim();
    if (!name) return;
    try {
      await addEntry({
        name,
        meal: $("meal").value,
        cal: num($("cal").value),
        p: num($("protein").value),
        c: num($("carbs").value),
        f: num($("fat").value)
      });
    } catch (err) { return showError(err); }
    ["name", "cal", "protein", "carbs", "fat"].forEach((id) => { $(id).value = ""; });
    $("name").focus();
  });
  $("goal").addEventListener("change", () => {
    setGoal(Math.min(10000, Math.max(500, Number($("goal").value) || 2000)));
  });
  $("date").addEventListener("change", () => {
    if ($("date").value) { currentKey = $("date").value; render(); }
  });
  $("prev").addEventListener("click", () => shiftDay(-1));
  $("next").addEventListener("click", () => shiftDay(1));
  $("export").addEventListener("click", exportCsv);
  $("clear").addEventListener("click", () => {
    if (entriesFor(currentKey).length && confirm("Delete all entries for this day?")) clearDay();
  });

  // ---- Boot ----
  (async () => {
    const remote = await detectBackend();
    state = remote || local.load();
    render();
  })();
})();
