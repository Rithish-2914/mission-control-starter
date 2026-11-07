// Mission Control - mock API server
// DO NOT MODIFY (for candidates). Zero dependencies: only Node's built-in modules.

const http = require("http");

const PORT = Number(process.env.PORT) || 4000;
const CHAOS = process.argv.includes("--chaos");

// ---------- helpers ----------
const rand = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const round1 = (v) => Math.round(v * 10) / 10;
const round2 = (v) => Math.round(v * 100) / 100;

const COMMANDS = ["boost", "cooling_on", "cooling_off", "seal_leak", "pause", "resume"];
const MAX_EVENTS = 500;
const MAX_HISTORY = 100;

// ---------- state ----------
let state, events, history, nextEventId, nextAnomalyNum, ticksUntilAnomaly, levels, lastEventTs;

function reset() {
  state = {
    altitude: 400,
    velocity: 7.66,
    fuel: 100,
    temperature: 60,
    cooling: false,
    paused: false,
    anomaly: null, // { id, type, secondsLeft, overdue }
  };
  events = [];
  history = [];
  nextEventId = 1;
  nextAnomalyNum = 1;
  ticksUntilAnomaly = randInt(30, 60);
  levels = { fuel: 0, temperature: 0 }; // 0 normal, 1 warning, 2 critical
  lastEventTs = 0;
  recordHistory();
}

function logEvent(type, message) {
  // Timestamps are strictly increasing so `?since=` never skips or repeats an event.
  const timestamp = Math.max(Date.now(), lastEventTs + 1);
  lastEventTs = timestamp;
  events.push({ id: nextEventId++, timestamp, type, message });
  if (events.length > MAX_EVENTS) events.shift();
}

function rounded() {
  return {
    altitude: round1(state.altitude),
    velocity: round2(state.velocity),
    fuel: round1(state.fuel),
    temperature: round1(state.temperature),
  };
}

function fuelLevel(fuel) {
  return fuel < 10 ? 2 : fuel < 30 ? 1 : 0;
}
function tempLevel(temp) {
  return temp > 100 ? 2 : temp > 80 ? 1 : 0;
}

// Log a WARNING only when a value crosses into a worse level.
function checkLevels() {
  const r = rounded();
  const f = fuelLevel(r.fuel);
  const t = tempLevel(r.temperature);
  if (f > levels.fuel) {
    logEvent("WARNING", f === 2 ? `Fuel critical (${r.fuel}%)` : `Fuel low (${r.fuel}%)`);
  }
  if (t > levels.temperature) {
    logEvent(
      "WARNING",
      t === 2 ? `Temperature critical (${r.temperature}°C)` : `Temperature high (${r.temperature}°C)`
    );
  }
  levels.fuel = f;
  levels.temperature = t;
}

function missionStatus() {
  const r = rounded();
  const a = state.anomaly;
  if (r.fuel < 10 || r.temperature > 100 || (a && a.overdue)) return "CRITICAL";
  if (r.fuel < 30 || r.temperature > 80 || a) return "WARNING";
  return "NOMINAL";
}

function recordHistory() {
  history.push({ timestamp: Date.now(), ...rounded() });
  if (history.length > MAX_HISTORY) history.shift();
}

function startAnomaly() {
  const type = Math.random() < 0.5 ? "TEMP_SPIKE" : "FUEL_LEAK";
  state.anomaly = { id: `a${nextAnomalyNum++}`, type, secondsLeft: 15, overdue: false };
  if (type === "TEMP_SPIKE") {
    state.temperature = clamp(state.temperature + 30, 20, 150);
    state.cooling = false;
    logEvent("ANOMALY", "Temperature spike! Cooling system tripped");
  } else {
    logEvent("ANOMALY", "Fuel leak detected! Fuel draining rapidly");
  }
}

function resolveAnomaly(message) {
  state.anomaly = null;
  ticksUntilAnomaly = randInt(30, 60);
  logEvent("RESOLVED", message);
}

// ---------- simulation tick (every 1 s) ----------
function tick() {
  if (state.paused) return; // everything frozen, including anomaly countdowns

  state.velocity += (7.66 - state.velocity) * 0.02 + rand(-0.01, 0.01);
  state.altitude = Math.max(0, state.altitude + (state.velocity - 7.66) * 2 + rand(-0.2, 0.2));

  let burn = 0.05;
  if (state.cooling) burn += 0.05;
  if (state.anomaly && state.anomaly.type === "FUEL_LEAK") burn += 0.8;
  state.fuel = Math.max(0, state.fuel - burn);

  state.temperature += state.cooling ? -1.5 + rand(-0.2, 0.2) : 0.4 + rand(-0.3, 0.3);
  state.temperature = clamp(state.temperature, 20, 150);

  const a = state.anomaly;
  if (a) {
    if (!a.overdue) {
      a.secondsLeft -= 1;
      if (a.secondsLeft <= 0) {
        a.secondsLeft = 0;
        a.overdue = true;
        logEvent("WARNING", "Anomaly unresolved — mission critical");
      }
    }
  } else {
    ticksUntilAnomaly -= 1;
    if (ticksUntilAnomaly <= 0) startAnomaly();
  }

  checkLevels();
  recordHistory();
}

// ---------- commands ----------
// Returns { status, body }
function runCommand(command) {
  if (typeof command !== "string" || command === "") {
    return { status: 400, body: { error: "Missing 'command' in request body" } };
  }
  if (!COMMANDS.includes(command)) {
    return {
      status: 400,
      body: { error: `Unknown command '${command}'. Valid commands: ${COMMANDS.join(", ")}` },
    };
  }
  if (state.paused && command !== "resume") {
    return { status: 400, body: { error: "Mission is paused" } };
  }

  const fail = (error) => ({ status: 400, body: { error } });
  const ok = (message) => ({ status: 200, body: { ok: true, message } });
  const a = state.anomaly;

  switch (command) {
    case "boost":
      if (state.fuel < 5) return fail("Not enough fuel");
      state.velocity += 0.3;
      state.fuel = Math.max(0, state.fuel - 5);
      logEvent("COMMAND", "Thrust boosted");
      checkLevels();
      return ok("Thrust boosted");

    case "cooling_on":
      if (state.cooling) return fail("Cooling is already on");
      state.cooling = true;
      logEvent("COMMAND", "Cooling system activated");
      if (a && a.type === "TEMP_SPIKE") {
        resolveAnomaly("Temperature spike resolved");
        return ok("Cooling system activated — temperature spike resolved");
      }
      return ok("Cooling system activated");

    case "cooling_off":
      if (!state.cooling) return fail("Cooling is already off");
      state.cooling = false;
      logEvent("COMMAND", "Cooling system deactivated");
      return ok("Cooling system deactivated");

    case "seal_leak":
      if (!a || a.type !== "FUEL_LEAK") return fail("No leak detected");
      logEvent("COMMAND", "Sealing fuel leak");
      resolveAnomaly("Fuel leak sealed");
      return ok("Fuel leak sealed");

    case "pause":
      if (state.paused) return fail("Mission is already paused");
      state.paused = true;
      logEvent("COMMAND", "Mission paused");
      return ok("Mission paused");

    case "resume":
      if (!state.paused) return fail("Mission is not paused");
      state.paused = false;
      logEvent("COMMAND", "Mission resumed");
      return ok("Mission resumed");
  }
}

function telemetry() {
  const a = state.anomaly;
  return {
    timestamp: Date.now(),
    ...rounded(),
    systems: { cooling: state.cooling, paused: state.paused },
    anomaly: a ? { id: a.id, type: a.type, secondsLeft: a.secondsLeft, overdue: a.overdue } : null,
    missionStatus: missionStatus(),
  };
}

function getEvents(sinceParam) {
  if (sinceParam === null) return { status: 200, body: events.slice(-50) };
  const since = Number(sinceParam);
  if (!Number.isFinite(since)) {
    return { status: 400, body: { error: "'since' must be a timestamp in milliseconds" } };
  }
  return { status: 200, body: events.filter((e) => e.timestamp > since).slice(0, 100) };
}

function parseLimit(param) {
  const n = parseInt(param, 10);
  if (!Number.isFinite(n)) return 20;
  return clamp(n, 1, MAX_HISTORY);
}

// ---------- HTTP ----------
function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 10000) reject(new Error("too large"));
    });
    req.on("end", () => {
      if (data.trim() === "") return resolve({});
      try {
        const parsed = JSON.parse(data);
        resolve(parsed && typeof parsed === "object" ? parsed : {});
      } catch {
        reject(new Error("invalid json"));
      }
    });
    req.on("error", reject);
  });
}

async function handle(req, res) {
  if (req.method === "OPTIONS") return send(res, 204);

  if (CHAOS && Math.random() < 0.1) {
    return send(res, 500, { error: "Random server error (chaos mode)" });
  }

  const url = new URL(req.url, "http://localhost");
  const route = `${req.method} ${url.pathname.replace(/\/+$/, "") || "/"}`;

  switch (route) {
    case "GET /":
      return send(res, 200, {
        name: "Mission Control API",
        endpoints: [
          "GET /api/telemetry",
          "GET /api/telemetry/history?limit=20",
          "POST /api/command",
          "GET /api/events?since=<timestamp>",
        ],
      });

    case "GET /api/telemetry":
      return send(res, 200, telemetry());

    case "GET /api/telemetry/history":
      return send(res, 200, history.slice(-parseLimit(url.searchParams.get("limit"))));

    case "POST /api/command": {
      let body;
      try {
        body = await readJson(req);
      } catch {
        return send(res, 400, { error: "Request body must be valid JSON" });
      }
      const result = runCommand(body.command);
      return send(res, result.status, result.body);
    }

    case "GET /api/events": {
      const result = getEvents(url.searchParams.get("since"));
      return send(res, result.status, result.body);
    }

    case "POST /api/reset":
      reset();
      return send(res, 200, { ok: true, message: "Simulation reset" });

    default:
      return send(res, 404, { error: `Route not found: ${req.method} ${url.pathname}` });
  }
}

reset();

if (require.main === module) {
  setInterval(tick, 1000);
  http
    .createServer((req, res) => {
      handle(req, res).catch((err) => {
        console.error(err);
        send(res, 500, { error: "Internal server error" });
      });
    })
    .listen(PORT, () => {
      console.log(`Mission Control API running at http://localhost:${PORT}`);
      if (CHAOS) console.log("Chaos mode ON: ~10% of requests will fail with 500");
    });
}

// Exported for testing only.
module.exports = { tick, runCommand, telemetry, getEvents, reset, _state: () => state, _events: () => events };
