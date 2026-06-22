const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const ROOT_WITH_SEPARATOR = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
const LEADERBOARD_FILE = path.join(ROOT, "leaderboard.json");
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8"
};

function readLeaderboard() {
  try {
    const records = JSON.parse(fs.readFileSync(LEADERBOARD_FILE, "utf8"));
    return Array.isArray(records) ? cleanRecords(records) : [];
  } catch (error) {
    return [];
  }
}

function writeLeaderboard(records) {
  const clean = cleanRecords(records);
  fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(clean, null, 2) + "\n");
  return clean;
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 32);
}

function cleanRecords(records) {
  const uniqueRecords = new Map();

  records.forEach((record) => {
    const name = normalizeName(record.name);
    const timeSeconds = Number(record.timeSeconds);

    if (!name || !Number.isFinite(timeSeconds) || timeSeconds < 0) {
      return;
    }

    const completedAt = record.completedAt || new Date().toISOString();
    const id = record.id || `${name}-${Math.floor(timeSeconds)}-${completedAt}`;

    uniqueRecords.set(id, {
      id,
      name,
      museCount: 100,
      timeSeconds: Math.floor(timeSeconds),
      completedAt
    });
  });

  return Array.from(uniqueRecords.values()).sort((a, b) => {
    if (a.timeSeconds !== b.timeSeconds) {
      return a.timeSeconds - b.timeSeconds;
    }

    return new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime();
  });
}

function cleanIncomingRecord(record) {
  const records = cleanRecords([record]);

  if (Number(record?.museCount) !== 100 || !records.length) {
    return null;
  }

  return records[0];
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(body));
}

function handleLeaderboard(request, response) {
  if (request.method === "GET") {
    sendJson(response, 200, { records: readLeaderboard() });
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  let body = "";

  request.on("data", (chunk) => {
    body += chunk;

    if (body.length > 4096) {
      request.destroy();
    }
  });

  request.on("end", () => {
    try {
      const record = cleanIncomingRecord(JSON.parse(body));

      if (!record) {
        throw new Error("Incomplete leaderboard entry");
      }

      const records = writeLeaderboard(readLeaderboard().concat(record));
      sendJson(response, 200, { records });
    } catch (error) {
      sendJson(response, 400, { error: "Invalid leaderboard entry" });
    }
  });
}

function serveStatic(request, response) {
  const requestPath = new URL(request.url, `http://${request.headers.host}`).pathname;
  const filePath = requestPath === "/" ? path.join(ROOT, "index.html") : path.join(ROOT, requestPath);
  const resolvedPath = path.resolve(filePath);

  if (resolvedPath !== ROOT && !resolvedPath.startsWith(ROOT_WITH_SEPARATOR)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(resolvedPath, (error, content) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(resolvedPath)] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    response.end(content);
  });
}

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

  if (pathname === "/leaderboard") {
    handleLeaderboard(request, response);
    return;
  }

  serveStatic(request, response);
});

server.listen(PORT, () => {
  console.log(`Name 100 Quietus Muses is running at http://localhost:${PORT}`);
});
