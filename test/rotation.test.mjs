import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { execFile, fork } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { saveCredential, loadCredential, withCredentialLock } from "../dist/src/store.js";

test("two independent processes share one rotating refresh grant", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "penfield-rotate-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const host = { id: "penfield", resolvePath: (p) => join(directory, p.replace(/^~\//, "")) };
  const apiUrl = "https://api.example";
  saveCredential(
    host,
    { clientId: "client", access: "expired", refresh: "once", expires: 1 },
    apiUrl
  );
  let grants = 0;
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.method === "GET")
      return res.end(
        JSON.stringify({
          issuer: "https://login.example",
          token_endpoint: "https://login.example/token",
        })
      );
    let body = "";
    for await (const chunk of req) body += chunk;
    if (++grants !== 1 || new URLSearchParams(body).get("refresh_token") !== "once") {
      res.statusCode = 400;
      return res.end('{"error":"invalid_grant"}');
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
    res.end(
      JSON.stringify({
        access_token: "rotated-access",
        refresh_token: "next",
        expires_in: 86400,
        scope: "read",
      })
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const args = [
    fileURLToPath(new URL("./refresh-worker.mjs", import.meta.url)),
    directory,
    "http://127.0.0.1:" + server.address().port,
  ];
  await Promise.all([
    promisify(execFile)(process.execPath, args),
    promisify(execFile)(process.execPath, args),
  ]);
  assert.equal(grants, 1);
  assert.equal(loadCredential(host, apiUrl).refresh, "next");
});

test(
  "an abruptly terminated process releases its credential lock",
  { timeout: 10000 },
  async (t) => {
    const directory = mkdtempSync(join(tmpdir(), "penfield-lock-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const host = { id: "penfield", resolvePath: () => directory };
    const apiUrl = "https://api.example";
    const child = fork(new URL("./refresh-worker.mjs", import.meta.url), [directory, "hold-lock"], {
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    const exited = once(child, "exit");
    t.after(() => {
      if (child.exitCode === null && !child.signalCode) child.kill("SIGKILL");
    });
    await Promise.race([
      once(child, "message").then(([s]) => assert.equal(s, "locked")),
      exited.then(() => {
        throw Error("Lock holder exited before acquiring lock");
      }),
    ]);
    child.kill("SIGKILL");
    await exited;
    assert.equal(await withCredentialLock(host, apiUrl, async () => "acquired"), "acquired");
  }
);
