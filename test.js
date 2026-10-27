"use strict";

// Minimal API test: node test.js (no extra dependencies, Node 18+)
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dcl-")), "db.json");
const { server, start } = require("./server");

start(0);

async function main() {
  await new Promise((r) => server.once("listening", r));
  const base = `http://localhost:${server.address().port}`;
  const call = async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };

  let r = await call("GET", "/api/health");
  assert.strictEqual(r.status, 200);

  r = await call("GET", "/api/state");
  assert.strictEqual(r.body.goal, 2000);

  r = await call("PUT", "/api/goal", { goal: 1800 });
  assert.strictEqual(r.body.goal, 1800);
  r = await call("PUT", "/api/goal", { goal: 5 });
  assert.strictEqual(r.status, 400);

  r = await call("POST", "/api/days/2026-10-27/entries", { name: "Oats", meal: "Breakfast", cal: 300, p: 10, c: 50, f: 5 });
  assert.strictEqual(r.status, 201);
  const id = r.body.id;

  r = await call("POST", "/api/days/2026-10-27/entries", { name: "", meal: "Lunch", cal: 100 });
  assert.strictEqual(r.status, 400);
  r = await call("POST", "/api/days/2026-10-27/entries", { name: "X", meal: "Brunch", cal: 100 });
  assert.strictEqual(r.status, 400);
  r = await call("POST", "/api/days/2026-10-27/entries", { name: "X", meal: "Lunch", cal: -5 });
  assert.strictEqual(r.status, 400);
  r = await call("POST", "/api/days/2026-13-45/entries", { name: "X", meal: "Lunch", cal: 5 });
  assert.strictEqual(r.status, 400);

  r = await call("GET", "/api/days/2026-10-27");
  assert.strictEqual(r.body.length, 1);

  // persisted to disk
  const onDisk = JSON.parse(fs.readFileSync(process.env.DATA_FILE, "utf8"));
  assert.strictEqual(onDisk.days["2026-10-27"][0].name, "Oats");

  r = await call("DELETE", `/api/days/2026-10-27/entries/${id}`);
  assert.strictEqual(r.status, 204);
  r = await call("DELETE", `/api/days/2026-10-27/entries/${id}`);
  assert.strictEqual(r.status, 404);

  await call("POST", "/api/days/2026-10-28/entries", { name: "Rice", meal: "Dinner", cal: 400 });
  r = await call("DELETE", "/api/days/2026-10-28");
  assert.strictEqual(r.status, 204);
  r = await call("GET", "/api/days/2026-10-28");
  assert.strictEqual(r.body.length, 0);

  const page = await fetch(base + "/");
  assert.strictEqual(page.status, 200);

  console.log("All API tests passed");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => server.close());
