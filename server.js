"use strict";

// Diet & Calorie Logger backend: zero-dependency Node HTTP server.
// Serves the frontend from ./public and a JSON REST API under /api.

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data", "db.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const MEALS = ["Breakfast", "Lunch", "Dinner", "Snack"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BODY = 10 * 1024;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

// ---------- Storage (JSON file, atomic writes) ----------
function loadDb() {
  try {
    const db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return { goal: Number(db.goal) || 2000, days: db.days || {} };
  } catch (e) {
    return { goal: 2000, days: {} };
  }
}

const db = loadDb();

function persist() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

// ---------- Validation ----------
function num(v, max) {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > max) return NaN;
  return n;
}

function validDate(d) {
  if (typeof d !== "string" || !DATE_RE.test(d)) return false;
  const parsed = new Date(d + "T00:00:00Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === d;
}

function parseEntry(body) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 60) return { error: "name is required (max 60 characters)" };
  if (!MEALS.includes(body.meal)) return { error: `meal must be one of ${MEALS.join(", ")}` };
  if (body.cal === undefined || body.cal === null || body.cal === "") return { error: "cal is required" };
  const cal = num(body.cal, 5000);
  const p = num(body.p, 500);
  const c = num(body.c, 1000);
  const f = num(body.f, 500);
  if ([cal, p, c, f].some(Number.isNaN)) return { error: "cal, p, c, f must be non-negative numbers within range" };
  return { entry: { id: crypto.randomUUID(), name, meal: body.meal, cal, p, c, f } };
}

// ---------- HTTP helpers ----------
function sendJson(res, status, data) {
  if (status === 204) {
    res.writeHead(204);
    return res.end();
  }
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error("request body too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        resolve(parsed && typeof parsed === "object" ? parsed : {});
      } catch (e) {
        reject(Object.assign(new Error("invalid JSON body"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

// ---------- API routes ----------
async function handleApi(req, res, pathname) {
  const method = req.method;
  let m;

  if (pathname === "/api/health" && method === "GET") return sendJson(res, 200, { ok: true });

  if (pathname === "/api/state" && method === "GET") return sendJson(res, 200, db);

  if (pathname === "/api/goal" && method === "PUT") {
    const body = await readJson(req);
    const goal = Number(body.goal);
    if (!Number.isFinite(goal) || goal < 500 || goal > 10000) {
      return sendJson(res, 400, { error: "goal must be between 500 and 10000" });
    }
    db.goal = Math.round(goal);
    persist();
    return sendJson(res, 200, { goal: db.goal });
  }

  if ((m = pathname.match(/^\/api\/days\/([^/]+)$/))) {
    const date = decodeURIComponent(m[1]);
    if (!validDate(date)) return sendJson(res, 400, { error: "date must be YYYY-MM-DD" });
    if (method === "GET") return sendJson(res, 200, db.days[date] || []);
    if (method === "DELETE") {
      delete db.days[date];
      persist();
      return sendJson(res, 204);
    }
  }

  if ((m = pathname.match(/^\/api\/days\/([^/]+)\/entries$/)) && method === "POST") {
    const date = decodeURIComponent(m[1]);
    if (!validDate(date)) return sendJson(res, 400, { error: "date must be YYYY-MM-DD" });
    const { entry, error } = parseEntry(await readJson(req));
    if (error) return sendJson(res, 400, { error });
    (db.days[date] ||= []).push(entry);
    persist();
    return sendJson(res, 201, entry);
  }

  if ((m = pathname.match(/^\/api\/days\/([^/]+)\/entries\/([^/]+)$/)) && method === "DELETE") {
    const date = decodeURIComponent(m[1]);
    const id = decodeURIComponent(m[2]);
    if (!validDate(date)) return sendJson(res, 400, { error: "date must be YYYY-MM-DD" });
    const list = db.days[date] || [];
    if (!list.some((e) => e.id === id)) return sendJson(res, 404, { error: "entry not found" });
    db.days[date] = list.filter((e) => e.id !== id);
    if (!db.days[date].length) delete db.days[date];
    persist();
    return sendJson(res, 204);
  }

  return sendJson(res, 404, { error: "not found" });
}

// ---------- Static files ----------
function serveStatic(req, res, pathname) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    return res.end();
  }
  let rel;
  try { rel = decodeURIComponent(pathname); } catch (e) { rel = ""; }
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Not found");
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Content-Length": data.length
    });
    res.end(req.method === "HEAD" ? undefined : data);
  });
}

// ---------- Server ----------
const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  try {
    if (pathname.startsWith("/api/") || pathname === "/api") return await handleApi(req, res, pathname);
    return serveStatic(req, res, pathname);
  } catch (err) {
    const status = err.status || 500;
    if (!res.headersSent) sendJson(res, status, { error: status === 500 ? "internal error" : err.message });
    if (status === 500) console.error(err);
  }
});

function start(port = PORT) {
  return server.listen(port, () => console.log(`Diet & Calorie Logger running on http://localhost:${server.address().port}`));
}

if (require.main === module) start();

module.exports = { server, start };
