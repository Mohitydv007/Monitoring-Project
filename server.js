const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { execSync } = require("child_process");

const PORT = Number(process.env.PORT) || 5000;

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const DATA = path.join(ROOT, "data");
const REPORTS = path.join(ROOT, "reports");

const USERS_FILE = path.join(DATA, "users.json");
const REMOTE_FILE = path.join(DATA, "remote-targets.json");

const SESSIONS = new Map();
const HISTORY = [];
const MAX_HISTORY = 120;

let REMOTE_TARGETS = [];

// =====================================================
// FOLDERS / FILES
// =====================================================

for (const dir of [PUBLIC, DATA, REPORTS]) {
    fs.mkdirSync(dir, { recursive: true });
}

if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, "[]", "utf8");
}

if (!fs.existsSync(REMOTE_FILE)) {
    fs.writeFileSync(REMOTE_FILE, "[]", "utf8");
}

// =====================================================
// JSON RESPONSE
// =====================================================

function json(res, statusCode, data) {
    const output = JSON.stringify(data);

    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
    });

    res.end(output);
}

// =====================================================
// USERS
// =====================================================

function readUsers() {
    try {
        const data = fs.readFileSync(USERS_FILE, "utf8");
        const users = JSON.parse(data);

        return Array.isArray(users) ? users : [];
    } catch (error) {
        console.error("Users read error:", error.message);
        return [];
    }
}

function saveUsers(users) {
    fs.writeFileSync(
        USERS_FILE,
        JSON.stringify(users, null, 2),
        "utf8"
    );
}

// =====================================================
// REMOTE TARGETS
// =====================================================

function readRemoteTargets() {
    try {
        const data = fs.readFileSync(REMOTE_FILE, "utf8");
        const targets = JSON.parse(data);

        return Array.isArray(targets) ? targets : [];
    } catch (error) {
        return [];
    }
}

function saveRemoteTargets() {
    fs.writeFileSync(
        REMOTE_FILE,
        JSON.stringify(REMOTE_TARGETS, null, 2),
        "utf8"
    );
}

REMOTE_TARGETS = readRemoteTargets();

function normalizeUrl(url) {
    return String(url || "")
        .trim()
        .replace(/\/+$/, "");
}

// =====================================================
// PASSWORD HASHING
// =====================================================

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");

    const passwordHash = crypto
        .scryptSync(password, salt, 64)
        .toString("hex");

    return {
        salt,
        passwordHash
    };
}

function verifyPassword(password, user) {
    try {
        if (!user || !user.salt || !user.passwordHash) {
            return false;
        }

        const hash = crypto
            .scryptSync(password, user.salt, 64)
            .toString("hex");

        const a = Buffer.from(hash, "hex");
        const b = Buffer.from(user.passwordHash, "hex");

        if (a.length !== b.length) {
            return false;
        }

        return crypto.timingSafeEqual(a, b);
    } catch (error) {
        return false;
    }
}

// =====================================================
// SESSION
// =====================================================

function createToken() {
    return crypto.randomBytes(32).toString("hex");
}

function getUserFromRequest(req) {
    const authorization = req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
        return null;
    }

    const token = authorization.substring(7);

    return SESSIONS.get(token) || null;
}

// =====================================================
// REQUEST BODY
// =====================================================

function readBody(req) {
    return new Promise((resolve, reject) => {
        let raw = "";

        req.on("data", chunk => {
            raw += chunk.toString();

            if (raw.length > 1024 * 1024) {
                reject(new Error("Request body too large"));
                req.destroy();
            }
        });

        req.on("end", () => {
            if (!raw.trim()) {
                resolve({});
                return;
            }

            try {
                resolve(JSON.parse(raw));
            } catch (error) {
                reject(new Error("Invalid JSON"));
            }
        });

        req.on("error", reject);
    });
}

// =====================================================
// CPU
// =====================================================

let previousCpu = null;

function getCpuUsage() {
    const cpus = os.cpus();

    if (!cpus || cpus.length === 0) {
        return 0;
    }

    let idle = 0;
    let total = 0;

    for (const cpu of cpus) {
        const times = cpu.times;

        idle += times.idle;

        total +=
            times.user +
            times.nice +
            times.sys +
            times.irq +
            times.idle;
    }

    if (!previousCpu) {
        previousCpu = {
            idle,
            total
        };

        return 0;
    }

    const idleDelta =
        idle - previousCpu.idle;

    const totalDelta =
        total - previousCpu.total;

    previousCpu = {
        idle,
        total
    };

    if (totalDelta <= 0) {
        return 0;
    }

    const usage =
        ((totalDelta - idleDelta) / totalDelta) * 100;

    return Number(
        Math.min(100, Math.max(0, usage)).toFixed(1)
    );
}

// =====================================================
// DISK
// =====================================================

function getDiskMetrics() {
    try {
        // Windows
        if (process.platform === "win32") {
            const drive =
                (process.cwd().slice(0, 2) || "C:")
                    .replace(/\\/g, "");

            const command =
                `powershell -NoProfile -Command ` +
                `"Get-CimInstance Win32_LogicalDisk -Filter ` +
                `\\"DeviceID='${drive}'\\" | ` +
                `Select-Object Size,FreeSpace | ` +
                `ConvertTo-Json -Compress"`;

            const output = execSync(command, {
                encoding: "utf8",
                windowsHide: true
            });

            const data = JSON.parse(output);

            const total = Number(data.Size) || 0;
            const free = Number(data.FreeSpace) || 0;
            const used = Math.max(0, total - free);

            return {
                total,
                used,
                free,
                percent: total
                    ? Number((used / total * 100).toFixed(1))
                    : 0
            };
        }

        // Linux / macOS
        const output = execSync("df -kP /", {
            encoding: "utf8"
        });

        const lines = output.trim().split("\n");

        if (lines.length < 2) {
            return {
                total: 0,
                used: 0,
                free: 0,
                percent: 0
            };
        }

        const parts = lines[lines.length - 1]
            .trim()
            .split(/\s+/);

        const total = Number(parts[1]) * 1024;
        const used = Number(parts[2]) * 1024;
        const free = Number(parts[3]) * 1024;

        return {
            total,
            used,
            free,
            percent: total
                ? Number((used / total * 100).toFixed(1))
                : 0
        };
    } catch (error) {
        return {
            total: 0,
            used: 0,
            free: 0,
            percent: 0
        };
    }
}

// =====================================================
// SYSTEM METRICS
// =====================================================

function getMetrics() {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    const cpus = os.cpus() || [];

    const memoryPercent = totalMemory
        ? Number(
            (usedMemory / totalMemory * 100).toFixed(1)
        )
        : 0;

    return {
        timestamp: new Date().toISOString(),

        host: os.hostname(),

        platform: process.platform,

        release: os.release(),

        arch: os.arch(),

        cpuCores: cpus.length,

        cpuUsage: getCpuUsage(),

        memory: {
            total: totalMemory,
            used: usedMemory,
            free: freeMemory,
            percent: memoryPercent
        },

        disk: getDiskMetrics(),

        uptime: os.uptime(),

        nodeUptime: process.uptime()
    };
}

// =====================================================
// HISTORY
// =====================================================

function sampleHistory() {
    try {
        const m = getMetrics();

        HISTORY.push({
            timestamp: m.timestamp,
            cpuUsage: m.cpuUsage,
            memoryPercent: m.memory.percent,
            diskPercent: m.disk.percent
        });

        while (HISTORY.length > MAX_HISTORY) {
            HISTORY.shift();
        }
    } catch (error) {
        console.error(
            "History sampling error:",
            error.message
        );
    }
}

// =====================================================
// REMOTE METRICS
// =====================================================

function fetchRemoteMetrics(baseUrl) {
    return new Promise(resolve => {
        try {
            const normalized = normalizeUrl(baseUrl);

            if (!normalized) {
                resolve({
                    ok: false,
                    error: "Invalid remote address"
                });
                return;
            }

            const url = new URL(
                `${normalized}/api/agent/metrics`
            );

            const protocol =
                url.protocol === "https:"
                    ? require("https")
                    : require("http");

            const started = Date.now();

            const request = protocol.get(
                url,
                {
                    timeout: 4000
                },
                response => {
                    let data = "";

                    response.on("data", chunk => {
                        data += chunk.toString();
                    });

                    response.on("end", () => {
                        if (
                            response.statusCode < 200 ||
                            response.statusCode >= 300
                        ) {
                            resolve({
                                ok: false,
                                error:
                                    `Remote returned HTTP ${response.statusCode}`
                            });
                            return;
                        }

                        try {
                            const parsed = JSON.parse(data);

                            resolve({
                                ok: true,
                                metrics:
                                    parsed.metrics || parsed,
                                latencyMs:
                                    Date.now() - started
                            });
                        } catch (error) {
                            resolve({
                                ok: false,
                                error:
                                    "Remote returned invalid JSON"
                            });
                        }
                    });
                }
            );

            request.on("timeout", () => {
                request.destroy();

                resolve({
                    ok: false,
                    error: "Remote device timed out"
                });
            });

            request.on("error", () => {
                resolve({
                    ok: false,
                    error:
                        "Could not connect to remote device"
                });
            });
        } catch (error) {
            resolve({
                ok: false,
                error: "Invalid remote URL"
            });
        }
    });
}

// =====================================================
// STATIC FILES
// =====================================================

function getContentType(file) {
    const ext = path.extname(file).toLowerCase();

    const types = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon"
    };

    return types[ext] || "application/octet-stream";
}

function sendFile(res, file) {
    fs.readFile(file, (error, data) => {
        if (error) {
            json(res, 404, {
                error: "File not found"
            });
            return;
        }

        res.writeHead(200, {
            "Content-Type": getContentType(file)
        });

        res.end(data);
    });
}

// =====================================================
// SAFE PUBLIC FILE
// =====================================================

function getPublicFile(urlPath) {
    let decoded;

    try {
        decoded = decodeURIComponent(urlPath);
    } catch (error) {
        return null;
    }

    if (decoded === "/") {
        decoded = "/index.html";
    }

    const file = path.resolve(
        path.join(PUBLIC, decoded)
    );

    const publicRoot =
        path.resolve(PUBLIC) + path.sep;

    if (
        file !== path.resolve(PUBLIC) &&
        !file.startsWith(publicRoot)
    ) {
        return null;
    }

    return file;
}

// =====================================================
// SERVER
// =====================================================

const server = http.createServer(
    async (req, res) => {

        // -------------------------------------------------
        // CORS OPTIONS
        // -------------------------------------------------

        if (req.method === "OPTIONS") {
            res.writeHead(204, {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods":
                    "GET, POST, DELETE, OPTIONS",
                "Access-Control-Allow-Headers":
                    "Content-Type, Authorization"
            });

            res.end();
            return;
        }

        let parsedUrl;

        try {
            parsedUrl = new URL(
                req.url,
                `http://${req.headers.host || "localhost"}`
            );
        } catch (error) {
            return json(res, 400, {
                error: "Invalid request URL"
            });
        }

        const pathname = parsedUrl.pathname;

        // =================================================
        // REGISTER
        // =================================================

        if (
            req.method === "POST" &&
            pathname === "/api/register"
        ) {
            try {
                const data = await readBody(req);

                const name =
                    String(data.name || "").trim();

                const email =
                    String(data.email || "")
                        .trim()
                        .toLowerCase();

                const password =
                    String(data.password || "");

                if (!name) {
                    return json(res, 400, {
                        error:
                            "Full name is required"
                    });
                }

                if (!email) {
                    return json(res, 400, {
                        error:
                            "Email is required"
                    });
                }

                if (
                    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/
                        .test(email)
                ) {
                    return json(res, 400, {
                        error:
                            "Please enter a valid email"
                    });
                }

                if (password.length < 6) {
                    return json(res, 400, {
                        error:
                            "Password must be at least 6 characters"
                    });
                }

                const users = readUsers();

                const exists = users.some(
                    user =>
                        String(user.email)
                            .toLowerCase() === email
                );

                if (exists) {
                    return json(res, 409, {
                        error:
                            "An account with this email already exists"
                    });
                }

                const passwordData =
                    hashPassword(password);

                const user = {
                    id: crypto.randomUUID(),
                    name,
                    email,
                    salt: passwordData.salt,
                    passwordHash:
                        passwordData.passwordHash,
                    createdAt:
                        new Date().toISOString()
                };

                users.push(user);

                saveUsers(users);

                const token = createToken();

                const sessionUser = {
                    id: user.id,
                    name: user.name,
                    email: user.email
                };

                SESSIONS.set(
                    token,
                    sessionUser
                );

                return json(res, 201, {
                    ok: true,
                    token,
                    user: sessionUser
                });

            } catch (error) {
                console.error(
                    "REGISTER ERROR:",
                    error
                );

                return json(res, 500, {
                    error:
                        "Could not create account"
                });
            }
        }

        // =================================================
        // LOGIN
        // =================================================

        if (
            req.method === "POST" &&
            pathname === "/api/login"
        ) {
            try {
                const data = await readBody(req);

                const email =
                    String(data.email || "")
                        .trim()
                        .toLowerCase();

                const password =
                    String(data.password || "");

                const users = readUsers();

                const user = users.find(
                    item =>
                        String(item.email)
                            .toLowerCase() === email
                );

                if (
                    !user ||
                    !verifyPassword(
                        password,
                        user
                    )
                ) {
                    return json(res, 401, {
                        error:
                            "Invalid email or password"
                    });
                }

                const token = createToken();

                const sessionUser = {
                    id: user.id,
                    name: user.name,
                    email: user.email
                };

                SESSIONS.set(
                    token,
                    sessionUser
                );

                return json(res, 200, {
                    ok: true,
                    token,
                    user: sessionUser
                });

            } catch (error) {
                console.error(
                    "LOGIN ERROR:",
                    error
                );

                return json(res, 500, {
                    error:
                        "Could not login"
                });
            }
        }
      if (
            req.method === "POST" &&
            pathname === "/api/logout"
        ) {
            const authorization =
                req.headers.authorization || "";

            if (authorization.startsWith("Bearer ")) {
                const token =
                    authorization.substring(7);

                SESSIONS.delete(token);
            }

            return json(res, 200, {
                ok: true
            });
        }

        // =================================================
        // CURRENT USER
        // =================================================

        if (
            req.method === "GET" &&
            pathname === "/api/me"
        ) {
            const user =
                getUserFromRequest(req);

            if (!user) {
                return json(res, 401, {
                    error:
                        "Not authenticated"
                });
            }

            return json(res, 200, {
                ok: true,
                user
            });
        }

        // =================================================
        // AUTHENTICATED METRICS
        // =================================================

        if (
            req.method === "GET" &&
            (
                pathname === "/api/metrics" ||
                pathname === "/api/system/metrics"
            )
        ) {
            const user =
                getUserFromRequest(req);

            if (!user) {
                return json(res, 401, {
                    error:
                        "Not authenticated"
                });
            }

            return json(res, 200, {
                ok: true,
                metrics: getMetrics()
            });
        }

        // =================================================
        // REMOTE AGENT METRICS
        //
        // IMPORTANT:
        // This endpoint intentionally does NOT require login.
        // That allows another machine running this same server
        // to be monitored remotely.
        // =================================================

        if (
            req.method === "GET" &&
            pathname === "/api/agent/metrics"
        ) {
            try {
                const metrics = getMetrics();

                return json(res, 200, {
                    ok: true,
                    metrics
                });
            } catch (error) {
                return json(res, 500, {
                    error:
                        "Could not retrieve metrics"
                });
            }
        }

        // =================================================
        // HISTORY
        // =================================================

        if (
            req.method === "GET" &&
            pathname === "/api/history"
        ) {
            const user =
                getUserFromRequest(req);

            if (!user) {
                return json(res, 401, {
                    error:
                        "Not authenticated"
                });
            }

            return json(res, 200, {
                ok: true,
                history: HISTORY
            });
        }

        // =================================================
        // ADD REMOTE DEVICE
        // =================================================

        if (
            req.method === "POST" &&
            pathname === "/api/remotes"
        ) {
            const user =
                getUserFromRequest(req);

            if (!user) {
                return json(res, 401, {
                    error:
                        "Not authenticated"
                });
            }

            try {
                const data = await readBody(req);

                const name =
                    String(data.name || "")
                        .trim();

                const url =
                    normalizeUrl(data.url);

                if (!name) {
                    return json(res, 400, {
                        error:
                            "Device name is required"
                    });
                }

                if (!url) {
                    return json(res, 400, {
                        error:
                            "Device URL is required"
                    });
                }

                try {
                    new URL(url);
                } catch (error) {
                    return json(res, 400, {
                        error:
                            "Invalid device URL"
                    });
                }

                const target = {
                    id: crypto.randomUUID(),
                    name,
                    url,
                    status: "unknown",
                    lastChecked: null,
                    lastMetrics: null,
                    lastError: null
                };

                REMOTE_TARGETS.push(target);

                saveRemoteTargets();

                return json(res, 201, {
                    ok: true,
                    target
                });

            } catch (error) {
                return json(res, 500, {
                    error:
                        "Could not add remote device"
                });
            }
        }

        // =================================================
        // GET REMOTE DEVICES
        // =================================================

        if (
            req.method === "GET" &&
            pathname === "/api/remotes"
        ) {
            const user =
                getUserFromRequest(req);

            if (!user) {
                return json(res, 401, {
                    error:
                        "Not authenticated"
                });
            }

            return json(res, 200, {
                ok: true,
                targets: REMOTE_TARGETS
            });
        }

        // =================================================
        // CHECK REMOTE DEVICE
        // =================================================

        if (
            req.method === "POST" &&
            pathname.startsWith("/api/remotes/") &&
            pathname.endsWith("/check")
        ) {
            const user =
                getUserFromRequest(req);

            if (!user) {
                return json(res, 401, {
                    error:
                        "Not authenticated"
                });
            }

            const parts =
                pathname.split("/");

            const id =
                parts[3];

            const target =
                REMOTE_TARGETS.find(
                    item => item.id === id
                );

            if (!target) {
                return json(res, 404, {
                    error:
                        "Remote device not found"
                });
            }

            await refreshRemoteTarget(target);

            return json(res, 200, {
                ok: true,
                target
            });
        }

        // =================================================
        // DELETE REMOTE DEVICE
        // =================================================

        if (
            req.method === "DELETE" &&
            pathname.startsWith("/api/remotes/")
        ) {
            const user =
                getUserFromRequest(req);

            if (!user) {
                return json(res, 401, {
                    error:
                        "Not authenticated"
                });
            }

            const parts =
                pathname.split("/");

            const id =
                parts[3];

            const index =
                REMOTE_TARGETS.findIndex(
                    item => item.id === id
                );

            if (index === -1) {
                return json(res, 404, {
                    error:
                        "Remote device not found"
                });
            }

            REMOTE_TARGETS.splice(index, 1);

            saveRemoteTargets();

            return json(res, 200, {
                ok: true
            });
        }

        // =================================================
        // SIMPLE REPORT
        // =================================================

        if (
            req.method === "POST" &&
            pathname === "/api/report"
        ) {
            const user =
                getUserFromRequest(req);

            if (!user) {
                return json(res, 401, {
                    error:
                        "Not authenticated"
                });
            }

            try {
                const report = {
                    id: crypto.randomUUID(),
                    generatedAt:
                        new Date().toISOString(),
                    generatedBy: user.email,
                    system: getMetrics(),
                    history: HISTORY,
                    remoteDevices:
                        REMOTE_TARGETS
                };

                const fileName =
                    `VM-Report-${report.id}.json`;

                const filePath =
                    path.join(
                        REPORTS,
                        fileName
                    );

                fs.writeFileSync(
                    filePath,
                    JSON.stringify(
                        report,
                        null,
                        2
                    ),
                    "utf8"
                );

                return json(res, 200, {
                    ok: true,
                    report: {
                        id: report.id,
                        fileName
                    }
                });

            } catch (error) {
                console.error(
                    "REPORT ERROR:",
                    error
                );

                return json(res, 500, {
                    error:
                        "Could not generate report"
                });
            }
        }

        // =================================================
        // HEALTH CHECK
        // =================================================

        if (
            req.method === "GET" &&
            pathname === "/api/health"
        ) {
            return json(res, 200, {
                ok: true,
                status: "running",
                timestamp:
                    new Date().toISOString()
            });
        }

        // =================================================
        // STATIC FRONTEND
        // =================================================

        const file =
            getPublicFile(pathname);

        if (!file) {
            return json(res, 403, {
                error: "Forbidden"
            });
        }

        fs.stat(file, (error, stats) => {
            if (error || !stats.isFile()) {

                // If route does not exist,
                // open index.html for SPA-style frontend.
                const indexFile =
                    path.join(
                        PUBLIC,
                        "index.html"
                    );

                if (
                    fs.existsSync(indexFile)
                ) {
                    sendFile(
                        res,
                        indexFile
                    );
                } else {
                    json(res, 404, {
                        error:
                            "index.html not found"
                    });
                }

                return;
            }

            sendFile(res, file);
        });
    }
);

// =====================================================
// HISTORY SAMPLING
// =====================================================

sampleHistory();

setInterval(() => {
    sampleHistory();
}, 5000);

// =====================================================
// SERVER START
// =====================================================

server.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log("");
        console.log(
            "======================================"
        );
        console.log(
            " Cloud VM Monitoring System"
        );
        console.log(
            "======================================"
        );
        console.log(
            `Server running on port ${PORT}`
        );
        console.log(
            `Local: http://localhost:${PORT}`
        );
        console.log(
            "Health: /api/health"
        );
        console.log(
            "======================================"
        );
        console.log("");
    }
);

// =====================================================
// SERVER ERROR
// =====================================================

server.on("error", error => {
    console.error(
        "SERVER ERROR:",
        error.message
    );
});