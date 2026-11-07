(function () {
  "use strict";

  // =====================================================
  // CLOUD VM MONITORING SYSTEM
  // =====================================================

  const API_BASE = "http://localhost:5000";
  const TOKEN_KEY = "vmm_token";

  const POLL_MS = 5000;

  let metricsTimer = null;

  const historyData = [];

  // =====================================================
  // BASIC HELPERS
  // =====================================================

  function el(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
  }

  // =====================================================
  // API
  // =====================================================

  async function api(endpoint, options = {}) {

    const token =
      localStorage.getItem(TOKEN_KEY);

    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };

    if (token) {
      headers.Authorization =
        "Bearer " + token;
    }

    let response;

    try {

      response = await fetch(
        API_BASE + endpoint,
        {
          ...options,
          headers
        }
      );

    } catch (error) {

      throw new Error(
        "Server se connection nahi ho raha. server.js port 5000 par running hona chahiye."
      );
    }

    let data = null;

    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }

    if (!response.ok) {

      throw new Error(
        (data && data.error) ||
        "Request failed"
      );
    }

    return data;
  }

  // =====================================================
  // AUTH VIEW
  // =====================================================

  function showAuthView() {

    const auth = el("auth-view");
    const dashboard = el("dashboard-view");

    if (auth) {
      auth.classList.remove("hidden");
    }

    if (dashboard) {
      dashboard.classList.add("hidden");
    }

    stopPolling();
  }

  // =====================================================
  // DASHBOARD
  // =====================================================

  function showDashboardView(user) {

    const auth = el("auth-view");
    const dashboard = el("dashboard-view");

    if (auth) {
      auth.classList.add("hidden");
    }

    if (dashboard) {
      dashboard.classList.remove("hidden");
    }

    if (el("user-label") && user) {

      el("user-label").textContent =
        user.name +
        " (" +
        user.email +
        ")";
    }

    startPolling();
  }

  // =====================================================
  // POLLING
  // =====================================================

  function startPolling() {

    stopPolling();

    updateAllMetrics();

    metricsTimer =
      setInterval(
        updateAllMetrics,
        POLL_MS
      );
  }

  function stopPolling() {

    if (metricsTimer) {

      clearInterval(
        metricsTimer
      );

      metricsTimer = null;
    }
  }

  // =====================================================
  // AUTH ERROR
  // =====================================================

  function showAuthError(message) {

    const errorEl =
      el("auth-error");

    if (!errorEl) {

      alert(message);

      return;
    }

    errorEl.textContent =
      message;

    errorEl.classList.remove(
      "hidden"
    );
  }

  function hideAuthError() {

    const errorEl =
      el("auth-error");

    if (errorEl) {

      errorEl.classList.add(
        "hidden"
      );
    }
  }

  // =====================================================
  // TABS
  // =====================================================

  document
    .querySelectorAll(".tab-btn")
    .forEach(function (button) {

      button.addEventListener(
        "click",
        function () {

          document
            .querySelectorAll(".tab-btn")
            .forEach(function (btn) {

              btn.classList.remove(
                "active"
              );
            });

          button.classList.add(
            "active"
          );

          const login =
            button.dataset.tab ===
            "login";

          const loginForm =
            el("login-form");

          const registerForm =
            el("register-form");

          if (loginForm) {

            loginForm.classList.toggle(
              "hidden",
              !login
            );
          }

          if (registerForm) {

            registerForm.classList.toggle(
              "hidden",
              login
            );
          }

          hideAuthError();
        }
      );
    });

  // =====================================================
  // LOGIN
  // =====================================================

  const loginForm =
    el("login-form");

  if (loginForm) {

    loginForm.addEventListener(
      "submit",
      async function (event) {

        event.preventDefault();

        hideAuthError();

        const email =
          el("login-email")
            ? el("login-email").value.trim()
            : "";

        const password =
          el("login-password")
            ? el("login-password").value
            : "";

        if (!email || !password) {

          showAuthError(
            "Email aur password enter karo."
          );

          return;
        }

        try {

          const result =
            await api(
              "/api/login",
              {
                method: "POST",

                body: JSON.stringify({
                  email: email,
                  password: password
                })
              }
            );

          localStorage.setItem(
            TOKEN_KEY,
            result.token
          );

          showDashboardView(
            result.user
          );

        } catch (error) {

          showAuthError(
            error.message
          );
        }
      }
    );
  }

  // =====================================================
  // REGISTER
  // =====================================================

  const registerForm =
    el("register-form");

  if (registerForm) {

    registerForm.addEventListener(
      "submit",
      async function (event) {

        event.preventDefault();

        hideAuthError();

        const name =
          el("register-name")
            ? el("register-name").value.trim()
            : "";

        const email =
          el("register-email")
            ? el("register-email").value.trim()
            : "";

        const password =
          el("register-password")
            ? el("register-password").value
            : "";

        if (!name) {

          showAuthError(
            "Full name enter karo."
          );

          return;
        }

        if (!email) {

          showAuthError(
            "Email enter karo."
          );

          return;
        }

        if (password.length < 6) {

          showAuthError(
            "Password kam se kam 6 characters ka hona chahiye."
          );

          return;
        }

        try {

          const result =
            await api(
              "/api/register",
              {
                method: "POST",

                body: JSON.stringify({
                  name: name,
                  email: email,
                  password: password
                })
              }
            );

          localStorage.setItem(
            TOKEN_KEY,
            result.token
          );

          showDashboardView(
            result.user
          );

        } catch (error) {

          showAuthError(
            error.message
          );
        }
      }
    );
  }

  // =====================================================
  // LOGOUT
  // =====================================================

  const logoutBtn =
    el("logout-btn");

  if (logoutBtn) {

    logoutBtn.addEventListener(
      "click",
      async function () {

        try {

          await api(
            "/api/logout",
            {
              method: "POST"
            }
          );

        } catch (error) {
          // Ignore.
        }

        localStorage.removeItem(
          TOKEN_KEY
        );

        showAuthView();
      }
    );
  }

  // =====================================================
  // FORMAT UPTIME
  // =====================================================

  function formatUptime(seconds) {

    if (
      seconds === null ||
      seconds === undefined ||
      isNaN(seconds)
    ) {

      return "—";
    }

    seconds =
      Number(seconds);

    const days =
      Math.floor(
        seconds / 86400
      );

    const hours =
      Math.floor(
        (seconds % 86400) / 3600
      );

    const minutes =
      Math.floor(
        (seconds % 3600) / 60
      );

    return (
      days +
      "d " +
      hours +
      "h " +
      minutes +
      "m"
    );
  }

  // =====================================================
  // BAR
  // =====================================================

  function updateBar(
    bar,
    percent
  ) {

    if (!bar) {
      return;
    }

    let value =
      Number(percent) || 0;

    value =
      Math.max(
        0,
        Math.min(
          100,
          value
        )
      );

    bar.style.width =
      value + "%";

    if (value > 85) {

      bar.style.background =
        "var(--danger)";

    } else if (value > 65) {

      bar.style.background =
        "var(--amber)";

    } else {

      bar.style.background =
        "var(--accent)";
    }
  }

  // =====================================================
  // UPDATE DASHBOARD
  // =====================================================

  function updateDashboard(metrics) {

    if (!metrics) {
      return;
    }

    const cpu =
      Number(
        metrics.cpuUsage
      ) || 0;

    const memory =
      metrics.memory
        ? Number(
            metrics.memory.percent
          ) || 0
        : 0;

    const disk =
      metrics.disk
        ? Number(
            metrics.disk.percent
          ) || 0
        : 0;

    // CPU

    if (el("cpu-value")) {

      el("cpu-value").textContent =
        cpu.toFixed(1) + "%";
    }

    updateBar(
      el("cpu-bar"),
      cpu
    );

    // MEMORY

    if (el("memory-value")) {

      el("memory-value").textContent =
        memory.toFixed(1) + "%";
    }

    updateBar(
      el("memory-bar"),
      memory
    );

    // DISK

    if (el("disk-value")) {

      el("disk-value").textContent =
        disk.toFixed(1) + "%";
    }

    updateBar(
      el("disk-bar"),
      disk
    );

    // UPTIME

    if (el("uptime-value")) {

      el("uptime-value").textContent =
        formatUptime(
          metrics.uptime
        );
    }

    // LAST UPDATED

    if (
      el("last-updated") &&
      metrics.timestamp
    ) {

      el("last-updated").textContent =
        new Date(
          metrics.timestamp
        ).toLocaleTimeString();
    }

    // HOST

    if (
      el("host-value") &&
      metrics.host
    ) {

      el("host-value").textContent =
        metrics.host;
    }

    // PLATFORM

    if (
      el("platform-value") &&
      metrics.platform
    ) {

      el("platform-value").textContent =
        metrics.platform;
    }

    // CPU CORES

    if (
      el("cores-value") &&
      metrics.cpuCores !== undefined
    ) {

      el("cores-value").textContent =
        metrics.cpuCores;
    }
  }

  // =====================================================
  // GET METRICS
  // =====================================================

  async function updateAllMetrics() {

    try {

      const result =
        await api(
          "/api/agent/metrics"
        );

      const metrics =
        result.metrics;

      updateDashboard(
        metrics
      );

      // Add graph point

      historyData.push({
        timestamp:
          metrics.timestamp,

        cpu:
          Number(
            metrics.cpuUsage
          ) || 0,

        memory:
          metrics.memory
            ? Number(
                metrics.memory.percent
              ) || 0
            : 0,

        disk:
          metrics.disk
            ? Number(
                metrics.disk.percent
              ) || 0
            : 0
      });

      // Keep last 60 points

      while (
        historyData.length > 60
      ) {

        historyData.shift();
      }

      drawGraph();

    } catch (error) {

      console.error(
        "Metrics error:",
        error
      );

      if (
        error.message.includes(
          "authenticated"
        )
      ) {

        localStorage.removeItem(
          TOKEN_KEY
        );

        showAuthView();
      }
    }
  }

  // =====================================================
  // GRAPH
  // =====================================================

  function drawGraph() {

    const canvas =
      el("history-chart");

    if (!canvas) {

      console.error(
        "history-chart canvas nahi mila."
      );

      return;
    }

    const rect =
      canvas.getBoundingClientRect();

    const width =
      Math.max(
        600,
        Math.floor(
          rect.width ||
          canvas.parentElement?.clientWidth ||
          900
        )
      );

    const height = 260;

    const ratio =
      window.devicePixelRatio || 1;

    canvas.width =
      width * ratio;

    canvas.height =
      height * ratio;

    canvas.style.width =
      width + "px";

    canvas.style.height =
      height + "px";

    const ctx =
      canvas.getContext(
        "2d"
      );

    ctx.setTransform(
      ratio,
      0,
      0,
      ratio,
      0,
      0
    );

    ctx.clearRect(
      0,
      0,
      width,
      height
    );

    const paddingLeft = 45;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 30;

    const plotWidth =
      width -
      paddingLeft -
      paddingRight;

    const plotHeight =
      height -
      paddingTop -
      paddingBottom;

    // Background

    ctx.fillStyle =
      "rgba(15, 23, 42, 0.25)";

    ctx.fillRect(
      0,
      0,
      width,
      height
    );

    // GRID

    ctx.font =
      "11px Arial";

    ctx.lineWidth = 1;

    for (
      let value = 0;
      value <= 100;
      value += 25
    ) {

      const y =
        paddingTop +
        plotHeight -
        (
          value / 100
        ) *
        plotHeight;

      ctx.strokeStyle =
        "rgba(148,163,184,0.22)";

      ctx.beginPath();

      ctx.moveTo(
        paddingLeft,
        y
      );

      ctx.lineTo(
        width -
        paddingRight,
        y
      );

      ctx.stroke();

      ctx.fillStyle =
        "#94a3b8";

      ctx.fillText(
        value + "%",
        8,
        y + 4
      );
    }

    // If not enough data

    if (
      historyData.length < 2
    ) {

      ctx.fillStyle =
        "#94a3b8";

      ctx.font =
        "14px Arial";

      ctx.fillText(
        "Collecting live performance data...",
        paddingLeft,
        height / 2
      );

      return;
    }

    // =================================================
    // DRAW SERIES
    // =================================================

    const series = [
      {
        key: "cpu",
        color: "#38bdf8"
      },
      {
        key: "memory",
        color: "#a855f7"
      },
      {
        key: "disk",
        color: "#f59e0b"
      }
    ];

    series.forEach(
      function (item) {

        ctx.strokeStyle =
          item.color;

        ctx.lineWidth = 3;

        ctx.lineJoin =
          "round";

        ctx.lineCap =
          "round";

        ctx.beginPath();

        historyData.forEach(
          function (
            point,
            index
          ) {

            const x =
              paddingLeft +
              (
                index /
                (
                  historyData.length -
                  1
                )
              ) *
              plotWidth;

            let value =
              Number(
                point[item.key]
              ) || 0;

            value =
              Math.max(
                0,
                Math.min(
                  100,
                  value
                )
              );

            const y =
              paddingTop +
              plotHeight -
              (
                value / 100
              ) *
              plotHeight;

            if (
              index === 0
            ) {

              ctx.moveTo(
                x,
                y
              );

            } else {

              ctx.lineTo(
                x,
                y
              );
            }
          }
        );

        ctx.stroke();

        // Draw current point

        const last =
          historyData[
            historyData.length - 1
          ];

        let lastValue =
          Number(
            last[item.key]
          ) || 0;

        lastValue =
          Math.max(
            0,
            Math.min(
              100,
              lastValue
            )
          );

        const lastX =
          width -
          paddingRight;

        const lastY =
          paddingTop +
          plotHeight -
          (
            lastValue / 100
          ) *
          plotHeight;

        ctx.fillStyle =
          item.color;

        ctx.beginPath();

        ctx.arc(
          lastX,
          lastY,
          4,
          0,
          Math.PI * 2
        );

        ctx.fill();
      }
    );

    // Bottom label

    ctx.fillStyle =
      "#64748b";

    ctx.font =
      "10px Arial";

    ctx.fillText(
      "Older",
      paddingLeft,
      height - 8
    );

    ctx.fillText(
      "Live",
      width - 45,
      height - 8
    );
  }

  // =====================================================
  // WINDOW RESIZE
  // =====================================================

  window.addEventListener(
    "resize",
    function () {

      setTimeout(
        drawGraph,
        100
      );
    }
  );

  // =====================================================
  // REMOTE DEVICES
  // =====================================================

  async function refreshRemoteTargets() {

    try {

      const result =
        await api(
          "/api/remote/targets"
        );

      if (
        result &&
        result.targets
      ) {

        renderRemoteTargets(
          result.targets
        );
      }

    } catch (error) {

      console.log(
        "Remote devices endpoint unavailable."
      );
    }
  }

  function renderRemoteTargets(
    targets
  ) {

    const tbody =
      el("remote-list");

    if (!tbody) {
      return;
    }

    tbody.innerHTML = "";

    if (
      !targets ||
      targets.length === 0
    ) {

      tbody.innerHTML =
        '<tr><td colspan="7" class="muted">No devices added yet.</td></tr>';

      return;
    }

    targets.forEach(
      function (target) {

        const row =
          document.createElement(
            "tr"
          );

        const metrics =
          target.lastMetrics;

        row.innerHTML = `
          <td>
            ${escapeHtml(
              target.name ||
              "Device"
            )}
          </td>

          <td>
            ${escapeHtml(
              target.status ||
              "Unknown"
            )}
          </td>

          <td>
            ${
              metrics
                ? metrics.cpuUsage + "%"
                : "—"
            }
          </td>

          <td>
            ${
              metrics &&
              metrics.memory
                ? metrics.memory.percent + "%"
                : "—"
            }
          </td>

          <td>
            ${
              metrics &&
              metrics.disk
                ? metrics.disk.percent + "%"
                : "—"
            }
          </td>

          <td>
            ${
              metrics &&
              metrics.uptime !== undefined
                ? formatUptime(
                    metrics.uptime
                  )
                : "—"
            }
          </td>

          <td>
            ${
              metrics &&
              metrics.timestamp
                ? new Date(
                    metrics.timestamp
                  ).toLocaleTimeString()
                : "—"
            }
          </td>
        `;

        tbody.appendChild(row);
      }
    );
  } 
    const remoteForm =
    el("remote-form");

  if (remoteForm) {

    remoteForm.addEventListener(
      "submit",
      async function (event) {

        event.preventDefault();

        const name =
          el("remote-name")
            ? el("remote-name").value.trim()
            : "";

        const url =
          el("remote-url")
            ? el("remote-url").value.trim()
            : "";

        const errorEl =
          el("remote-error");

        try {

          await api(
            "/api/remote/targets",
            {
              method: "POST",

              body: JSON.stringify({
                name: name,
                url: url
              })
            }
          );

          remoteForm.reset();

          refreshRemoteTargets();

        } catch (error) {

          if (errorEl) {

            errorEl.textContent =
              "Remote device feature server.js mein available nahi hai.";

            errorEl.classList.remove(
              "hidden"
            );
          }
        }
      }
    );
  }

  // =====================================================
  // REPORT GENERATOR
  // =====================================================

  function generateReport() {

    if (
      historyData.length === 0
    ) {

      alert(
        "Pehle thodi der dashboard ko chalne do taaki performance data collect ho sake."
      );

      return;
    }

    const latest =
      historyData[
        historyData.length - 1
      ];

    const avgCpu =
      historyData.reduce(
        function (sum, item) {
          return sum + item.cpu;
        },
        0
      ) /
      historyData.length;

    const avgMemory =
      historyData.reduce(
        function (sum, item) {
          return sum + item.memory;
        },
        0
      ) /
      historyData.length;

    const avgDisk =
      historyData.reduce(
        function (sum, item) {
          return sum + item.disk;
        },
        0
      ) /
      historyData.length;

    const reportTime =
      new Date().toLocaleString();

    const host =
      el("host-value")
        ? el("host-value").textContent
        : "Local Machine";

    const reportHtml = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">

<title>Cloud VM Monitoring Report</title>

<style>

body {
  font-family: Arial, sans-serif;
  background: #0f172a;
  color: #e2e8f0;
  padding: 40px;
}

.container {
  max-width: 1000px;
  margin: auto;
}

h1 {
  color: #38bdf8;
}

.subtitle {
  color: #94a3b8;
  margin-bottom: 30px;
}

.cards {
  display: grid;
  grid-template-columns:
    repeat(4, 1fr);

  gap: 15px;
}

.card {
  background: #1e293b;
  padding: 20px;
  border-radius: 12px;
}

.label {
  color: #94a3b8;
  font-size: 13px;
}

.value {
  font-size: 30px;
  margin-top: 10px;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 30px;
  background: #1e293b;
}

th,
td {
  padding: 12px;
  border-bottom:
    1px solid #334155;

  text-align: left;
}

th {
  color: #38bdf8;
}

.footer {
  margin-top: 30px;
  color: #64748b;
  font-size: 13px;
}

</style>

</head>

<body>

<div class="container">

<h1>
Cloud VM Monitoring System
</h1>

<div class="subtitle">
Performance Report
</div>

<p>
<strong>Host:</strong>
${escapeHtml(host)}
</p>

<p>
<strong>Generated:</strong>
${escapeHtml(reportTime)}
</p>

<div class="cards">

<div class="card">
<div class="label">
Latest CPU Usage
</div>

<div class="value">
${latest.cpu.toFixed(1)}%
</div>
</div>

<div class="card">
<div class="label">
Latest Memory Usage
</div>

<div class="value">
${latest.memory.toFixed(1)}%
</div>
</div>

<div class="card">
<div class="label">
Latest Disk Usage
</div>

<div class="value">
${latest.disk.toFixed(1)}%
</div>
</div>

<div class="card">
<div class="label">
Samples
</div>

<div class="value">
${historyData.length}
</div>
</div>

</div>

<h2>
Average Performance
</h2>

<table>

<tr>
<th>Metric</th>
<th>Average</th>
<th>Latest</th>
</tr>

<tr>
<td>CPU Usage</td>
<td>${avgCpu.toFixed(1)}%</td>
<td>${latest.cpu.toFixed(1)}%</td>
</tr>

<tr>
<td>Memory Usage</td>
<td>${avgMemory.toFixed(1)}%</td>
<td>${latest.memory.toFixed(1)}%</td>
</tr>

<tr>
<td>Disk Usage</td>
<td>${avgDisk.toFixed(1)}%</td>
<td>${latest.disk.toFixed(1)}%</td>
</tr>

</table>

<h2>
Performance History
</h2>

<table>

<tr>
<th>Time</th>
<th>CPU</th>
<th>Memory</th>
<th>Disk</th>
</tr>

${historyData
  .map(function (item) {

    return `
<tr>

<td>
${new Date(
  item.timestamp
).toLocaleTimeString()}
</td>

<td>
${item.cpu.toFixed(1)}%
</td>

<td>
${item.memory.toFixed(1)}%
</td>

<td>
${item.disk.toFixed(1)}%
</td>

</tr>
`;

  })
  .join("")}

</table>

<div class="footer">
Generated by Cloud VM Monitoring System
</div>

</div>

</body>
</html>
`;

    const blob =
      new Blob(
        [reportHtml],
        {
          type:
            "text/html;charset=utf-8"
        }
      );

    const url =
      URL.createObjectURL(
        blob
      );

    const link =
      document.createElement(
        "a"
      );

    link.href = url;

    link.download =
      "cloud-vm-monitoring-report-" +
      new Date()
        .toISOString()
        .slice(0, 10) +
      ".html";

    document.body.appendChild(
      link
    );

    link.click();

    link.remove();

    URL.revokeObjectURL(
      url
    );
  }

  // =====================================================
  // REPORT BUTTON
  // =====================================================

  const reportBtn =
    el("report-btn");

  if (reportBtn) {

    reportBtn.addEventListener(
      "click",
      function () {

        generateReport();
      }
    );
  }

  // =====================================================
  // INITIALIZE
  // =====================================================

  async function init() {

    const token =
      localStorage.getItem(
        TOKEN_KEY
      );

    if (!token) {

      showAuthView();

      return;
    }

    /*
     * Current server.js mein
     * /api/auth/me nahi hai.
     *
     * Isliye saved token hone par
     * dashboard directly open karenge.
     */

    showDashboardView({
      name: "User",
      email: "Logged in"
    });
  }

  // =====================================================
  // START
  // =====================================================

  init();

})();