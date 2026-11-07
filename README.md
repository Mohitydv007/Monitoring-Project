# Cloud VM Monitoring System — Reliable Edition

## This version is intentionally ZERO-DEPENDENCY
You do NOT need to run `npm install`.
The server uses only Node.js built-in modules (including the built-in
`fetch` API for polling remote devices — no extra packages).

### Requirement
- Node.js 18 or newer
- VS Code

### Run
1. Extract the ZIP.
2. Open the `Cloud_VM_Monitoring_System_NO_ERROR` folder in VS Code.
3. Open Terminal.
4. Run:
   `npm start`
5. Open:
   `http://localhost:5000`

### Account
Click **Create account**, enter name/email/password (6+ characters).
After registration you are logged in automatically.
Sign out and use **Login** to test the same account.

### Dashboard
Once logged in you'll see:
- Live CPU, Memory, Disk, and Uptime cards (refresh every 5 seconds)
- A **live line graph** of CPU/Memory/Disk over time, drawn on a plain
  `<canvas>` — no chart library needed. It fills in as the server keeps
  running.

### Monitoring another server or device
This dashboard can also monitor **other machines**, not just the one it's
running on:

1. Copy this whole project onto the other server/device.
2. Run `npm start` there too (it will expose its own metrics automatically
   at `/api/agent/metrics` — no login required for this specific endpoint,
   so this app can poll it).
3. Back on your main dashboard, go to **"Monitor Another Server / Device"**,
   give it a name, and enter its address, e.g. `http://192.168.1.20:5000`
   (both machines must be reachable on the same network).
4. It will show up in the table with live status (Online/Offline), CPU,
   Memory, and Disk, refreshing automatically every ~10–15 seconds. You can
   refresh or remove it any time.

The list of devices you add is saved to `data/remote-targets.json` so it
survives a server restart.

### Report
Open the dashboard → **Generate Report**.
The report opens in a new browser tab and includes:
- Current CPU/Memory/Disk/uptime snapshot
- **Real performance graphs** (CPU, Memory, Disk over time), rendered as
  inline SVG so they display correctly even when the report is saved or
  printed
- A **CPU comparison chart** across this machine and every remote device
  you're monitoring
- A table listing every remote device's live status

Use Print → Save as PDF to keep a copy. A machine-readable `.json` version
of the same report is also saved in `reports/`.

### If port 5000 is busy
PowerShell:
`$env:PORT=5050`
then:
`npm start`
Open `http://localhost:5050`

### Important
Do not double-click index.html. Always run `npm start` first.

This edition removes Express, bcrypt and jsonwebtoken entirely to avoid
dependency/install/server-package failures. Passwords are still securely
salted and hashed using Node's built-in crypto module, and login sessions
are kept in memory. Remote device polling and the report/graph features
are also built entirely on Node's built-ins (`http`, `fetch`, plain
`<canvas>`/inline SVG) — nothing to install, nothing to break.
