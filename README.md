# Mission Control — Frontend Recruitment Task

Build a dashboard to monitor and control a simulated spacecraft. The server in this repo runs the simulation. Your job is to display it and let the user control it.

---

## Setup

1. Click **"Use this template"** on GitHub to create your own copy of this repository, then clone it.
2. Start the API server (requires [Node.js](https://nodejs.org) 18 or newer):
   ```bash
   cd server
   npm install
   npm start
   ```
   The API runs at **http://localhost:4000**. Keep this terminal open while you work.
3. Build your frontend inside the **`client/`** folder.
4. **Do not modify anything inside `server/`.**

### Rules

- Use HTML/CSS/JS or React, whichever you prefer. Chart libraries (Chart.js, Recharts, etc.) are allowed.
- Tip: keep the API URL in one variable, e.g. `const API = "http://localhost:4000"`.
- To test connection loss, stop the server (Ctrl+C) while your app is running, then start it again.
- To test how your app handles errors, run `npm run start:chaos` instead of `npm start`. About 10% of requests will then fail with a `500` error.

### Submission

- Submit your GitHub repo link. Replace this README (or add a section) with how to run your project, your features and screenshots.
- You'll run your project locally and demo it to the panel.

### Grading

| Criteria | Weight |
|---|---|
| Core features | 60% |
| UI/UX and clarity | 20% |
| Code quality | 10% |
| Bonus features | 10% |

---

## API Reference

Base URL: `http://localhost:4000`. All responses are JSON. Errors always look like `{ "error": "message" }`.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/telemetry` | Current spacecraft state |
| GET | `/api/telemetry/history?limit=20` | Last N readings, oldest first (max 100) |
| POST | `/api/command` | Send a command |
| GET | `/api/events?since=<timestamp>` | Log entries after the given time, oldest first |

### GET `/api/telemetry`

```json
{
  "timestamp": 1730962000000,
  "altitude": 412.3,
  "velocity": 7.66,
  "fuel": 64.2,
  "temperature": 71.5,
  "systems": { "cooling": false, "paused": false },
  "anomaly": {
    "id": "a7",
    "type": "TEMP_SPIKE",
    "secondsLeft": 12,
    "overdue": false
  },
  "missionStatus": "NOMINAL"
}
```

- Units: altitude in km, velocity in km/s, fuel in %, temperature in °C.
- `anomaly` is `null` when nothing is wrong. Its `type` is `TEMP_SPIKE` or `FUEL_LEAK`.
- `missionStatus` is `NOMINAL`, `WARNING` or `CRITICAL`.

### GET `/api/telemetry/history?limit=20`

An array of `{ timestamp, altitude, velocity, fuel, temperature }`, oldest first.

### POST `/api/command`

Request body (send header `Content-Type: application/json`):

```json
{ "command": "boost" }
```

| Command | Effect |
|---|---|
| `boost` | Velocity goes up, fuel drops by 5% |
| `cooling_on` | Turns cooling on. Temperature falls while it's on. Fixes a `TEMP_SPIKE`. |
| `cooling_off` | Turns cooling off |
| `seal_leak` | Fixes a `FUEL_LEAK` |
| `pause` | Freezes the simulation |
| `resume` | Unfreezes the simulation |

- Success: `200` with `{ "ok": true, "message": "Thrust boosted" }`
- Failure: `400` with `{ "error": "Cooling is already on" }`

### GET `/api/events?since=<timestamp>`

```json
[
  { "id": 12, "timestamp": 1730962001000, "type": "COMMAND", "message": "Cooling system activated" }
]
```

- `type` is `COMMAND`, `WARNING`, `ANOMALY` or `RESOLVED`.
- Without `since`, it returns the latest 50 events.
- To get only new events, pass the `timestamp` of the newest event you already have.

### Example

```js
const API = "http://localhost:4000";

const data = await fetch(`${API}/api/telemetry`).then((r) => r.json());

const res = await fetch(`${API}/api/command`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ command: "boost" }),
});
const result = await res.json(); // { ok, message } or { error }
```

---

## Core Requirements

1. **Live telemetry:** poll `/api/telemetry` every 2 seconds and show Altitude, Velocity, Fuel and Temperature, with no page refresh.
2. **Chart:** a line chart of altitude or velocity, using `/api/telemetry/history`.
3. **Status colors:** show each value as green, yellow or red:
   - Fuel: below 30% is a warning, below 10% is critical
   - Temperature: above 80°C is a warning, above 100°C is critical
   - Also show the overall `missionStatus` clearly.
4. **Controls:** buttons for every command. Show whether cooling is on or off and whether the simulation is paused.
5. **Anomaly alert:** when `anomaly` is not `null`, show a banner with its type and the `secondsLeft` countdown. If `overdue` is `true`, show a stronger critical alert. The user fixes the anomaly with the right command.
6. **Event log:** fetch new events using `?since=` and show them newest first, with timestamps, styled differently by type.
7. **Request handling:**
   - Show a loading state on first load.
   - Disable a button while its request is in progress.
   - Show the server's success or error message, e.g. as a toast.
8. **Connection handling:** if the server is unreachable, show a "Connection lost" banner, keep the last known data on screen and retry automatically. Remove the banner once the connection is back.

## Bonus

- Click a system card to see a detail panel
- Gauges instead of plain numbers
- A mission timer, or a "Mission Failed" screen
- Keyboard shortcuts for commands
- A responsive or mobile layout

Good luck! 🚀
