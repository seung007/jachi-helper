import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("local preview never serves private chat exports", async () => {
  let port;
  const exportDir = join(process.cwd(), "data", "exports");
  const fileName = `preview-private-test-${process.pid}.json`;
  const fixturePath = join(exportDir, fileName);
  mkdirSync(exportDir, { recursive: true });
  writeFileSync(fixturePath, '{"private":true}\n', { flag: "wx" });
  const child = spawn(process.execPath, ["scripts/serve.mjs"], {
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await new Promise((resolve, reject) => {
      let output = "";
      let errors = "";
      const cleanup = () => {
        clearTimeout(timer);
        child.stdout.off("data", onData);
        child.stderr.off("data", onStderr);
        child.off("error", onError);
        child.off("exit", onExit);
      };
      const onData = (chunk) => {
        output += chunk.toString();
        const ready = output.match(/Local preview: http:\/\/localhost:(\d+)/);
        if (ready) {
          port = Number(ready[1]);
          cleanup();
          resolve();
        }
      };
      const onStderr = chunk => { errors += chunk.toString(); };
      const onError = (error) => { cleanup(); reject(error); };
      const onExit = (code) => { cleanup(); reject(new Error(`Preview exited before ready: ${code} ${errors}`)); };
      const timer = setTimeout(() => { cleanup(); reject(new Error("Preview start timed out")); }, 5000);
      child.stdout.on("data", onData);
      child.stderr.on("data", onStderr);
      child.once("error", onError);
      child.once("exit", onExit);
    });

    const home = await fetch(`http://127.0.0.1:${port}/`);
    const privateFile = await fetch(`http://127.0.0.1:${port}/data/exports/${fileName}`);
    const encodedPath = await fetch(`http://127.0.0.1:${port}/data/%65xports/${fileName}`);
    assert.equal(home.status, 200);
    assert.equal(privateFile.status, 404);
    assert.equal(encodedPath.status, 404);
  } finally {
    child.kill();
    if (child.exitCode === null) await once(child, "exit");
    unlinkSync(fixturePath);
  }
});
