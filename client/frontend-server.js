
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 3000;

// Docker's internal service name and port.
const API_HOST = "mock-api";
const API_PORT = 8001;

const currentFolder = path.dirname(fileURLToPath(import.meta.url));
const distFolder = path.join(currentFolder, "dist");

const mimeTypes = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

// Create the HTTP server.
const server = http.createServer((req, res) => {
  // 1. Forward API requests to the mock API.
  if (req.url.startsWith("/api/") || req.url === "/api") {
    const apiPath = req.url.replace(/^\/api/, "") || "/";

    const proxy = http.request(
      {
        hostname: API_HOST,
        port: API_PORT,
        path: apiPath,
        method: req.method,
        headers: {
          ...req.headers,
          host: `${API_HOST}:${API_PORT}`,
        },
      },
      (apiResponse) => {
        res.writeHead(apiResponse.statusCode, apiResponse.headers);
        apiResponse.pipe(res);
      }
    );

    proxy.on("error", () => {
      if (!res.headersSent) {
        res.writeHead(502, {
          "Content-Type": "application/json",
        });
      }

      res.end(JSON.stringify({
        error: "Unable to connect to mock API",
      }));
    });

    req.pipe(proxy);
    return;
  }

  // 2. Serve React's production files.
  let requestedPath;

  try {
    const url = new URL(req.url, "http://localhost");
    const decodedPath = decodeURIComponent(url.pathname);

    requestedPath = path.resolve(
      distFolder,
      `.${decodedPath}`
    );
  } catch {
    res.writeHead(400);
    res.end("Invalid URL");
    return;
  }

  // Prevent access to files outside the dist folder.
  if (
    requestedPath !== distFolder &&
    !requestedPath.startsWith(distFolder + path.sep)
  ) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  let filePath = requestedPath;

  // React handles frontend routes, so unknown paths return index.html.
  if (
    !fs.existsSync(filePath) ||
    !fs.statSync(filePath).isFile()
  ) {
    filePath = path.join(distFolder, "index.html");
  }

  const extension = path.extname(filePath);
  const contentType =
    mimeTypes[extension] || "application/octet-stream";

  res.writeHead(200, {
    "Content-Type": contentType,
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  fs.createReadStream(filePath).pipe(res);
});

// Start the server.
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Frontend running on port ${PORT}`);
});
