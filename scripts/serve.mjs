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

const server = createServer((req, res) => {
  const file = resolvePath(req.url || "/");
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
