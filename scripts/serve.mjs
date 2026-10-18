import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, relative, sep } from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function resolvePath(url) {
  const pathname = decodeURIComponent(new URL(url, `http://localhost:${port}`).pathname);
  const clean = pathname === "/" ? "/index.html" : pathname;
  const withHtml = extname(clean) ? clean : `${clean}.html`;
  const candidate = normalize(join(root, withHtml));
  return candidate.startsWith(root) ? candidate : join(root, "index.html");
}

const server = createServer(async (req, res) => {
  let url, file;
  try {
    url = new URL(req.url || "/", "http://localhost");
    file = resolvePath(req.url || "/");
  } catch {
    res.writeHead(400); res.end("Invalid URL"); return;
  }
  if (url.pathname === "/api/life/places") {
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    if (req.method !== "GET") {
      res.writeHead(405, { allow: "GET" }); res.end(JSON.stringify({ error: "GET required" })); return;
    }
    try {
      const allowed = new Set(["district", "dong", "dongType", "category", "q", "page", "pageSize"]);
      const params = {};
      for (const [key, value] of url.searchParams) {
        if (!allowed.has(key) || key in params) throw Object.assign(Error("Invalid parameters"), { status: 400 });
        params[key] = value;
      }
      const { searchLifePlaces } = await import("./life-place-index.mjs");
      res.end(JSON.stringify(searchLifePlaces(params)));
    } catch (error) {
      const status = error.status === 400 ? 400 : 503;
      res.writeHead(status);
      res.end(JSON.stringify({ error: status === 400 ? "Invalid search parameters" : "Place data unavailable" }));
    }
    return;
  }
  const relativeFile = relative(root, file).split(sep).join("/").toLowerCase();
  if (relativeFile.startsWith("data/exports/") || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  res.writeHead(200, {
    "cache-control": "no-store",
    "content-type": types[extname(file)] || "application/octet-stream"
  });
  createReadStream(file).pipe(res);
}).listen(port, () => {
  console.log(`Local preview: http://localhost:${server.address().port}`);
});
