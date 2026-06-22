const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const ROOT_WITH_SEPARATOR = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8"
};

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
  serveStatic(request, response);
});

server.listen(PORT, () => {
  console.log(`Name 100 Quietus Muses is running at http://localhost:${PORT}`);
});
