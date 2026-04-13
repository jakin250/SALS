const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 3000);

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

main();

function main() {
  const buildResult = spawnSync("node", ["scripts/publish-root.js"], {
    cwd: ROOT,
    stdio: "inherit",
    shell: false
  });

  if (buildResult.status !== 0) {
    process.exit(buildResult.status || 1);
  }

  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host || `localhost:${PORT}`}`);
    const pathname = decodeURIComponent(requestUrl.pathname);
    const requestedPath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const filePath = ensureInsideRoot(path.join(ROOT, requestedPath));

    fs.stat(filePath, (statError, stats) => {
      if (statError || !stats.isFile()) {
        response.statusCode = 404;
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        response.end("Not found");
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      response.statusCode = 200;
      response.setHeader("Content-Type", CONTENT_TYPES[ext] || "application/octet-stream");

      const stream = fs.createReadStream(filePath);
      stream.on("error", () => {
        response.statusCode = 500;
        response.end("Server error");
      });
      stream.pipe(response);
    });
  });

  server.listen(PORT, () => {
    console.log(`Case notes site available at http://localhost:${PORT}`);
  });
}

function ensureInsideRoot(targetPath) {
  const resolvedRoot = path.resolve(ROOT);
  const resolvedTarget = path.resolve(targetPath);

  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Refusing to serve outside the workspace: ${resolvedTarget}`);
  }

  return resolvedTarget;
}
