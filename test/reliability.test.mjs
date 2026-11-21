import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { setTimeout as pause } from "node:timers/promises";
import { PenfieldApiClient } from "../dist/src/api-client.js";
import { requestJson } from "../dist/src/http.js";

test("a caller can cancel while a shared exchange is pending", async () => {
  let resolve;
  const pending = new Promise((r) => {
    resolve = r;
  });
  const stop = new AbortController();
  const api = new PenfieldApiClient(
    { getAccessToken: () => pending },
    "https://api.example"
  ).withSignal(stop.signal);
  const result = api.get("/read");
  stop.abort(new Error("turn cancelled"));
  try {
    await assert.rejects(result, /turn cancelled/);
  } finally {
    resolve("completed-for-other-callers");
  }
});
test("the request deadline remains active after HTTP headers arrive", async (t) => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.write('{"data":');
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const start = Date.now();
  await assert.rejects(
    requestJson("http://127.0.0.1:" + server.address().port, { signal: AbortSignal.timeout(150) }),
    (err) => err.name === "TimeoutError" || err.name === "AbortError"
  );
  assert.ok(Date.now() - start < 5000);
});
test("the client keeps the permission snapshot for the refused request", async (t) => {
  let grants = ["read"];
  const auth = { getAccessToken: async () => "fixture", getScopes: () => grants };
  t.mock.method(globalThis, "fetch", async () => {
    grants = ["read", "write", "delete"];
    await pause(1);
    return Response.json(
      { error: { code: "AUTH_INSUFFICIENT_PERMISSIONS", message: "Requires delete" } },
      { status: 403 }
    );
  });
  const api = new PenfieldApiClient(auth, "https://api.example");
  await assert.rejects(api.delete("/own-item"), (err) => /allowed to read\./.test(err.message));
});
test("GET respects Retry-After instead of waiting indefinitely", async (t) => {
  let sent = 0;
  t.mock.method(globalThis, "fetch", async () => {
    sent++;
    return new Response(null, { status: 429, headers: { "Retry-After": "120" } });
  });
  await assert.rejects(requestJson("https://api.example"), /120/);
  assert.equal(sent, 1);
});
test("safe reads retry short server rate limits", async (t) => {
  let sent = 0;
  t.mock.method(globalThis, "fetch", async () =>
    ++sent === 1
      ? new Response(null, { status: 429, headers: { "Retry-After": "0" } })
      : Response.json({ ok: true })
  );
  assert.deepEqual(await requestJson("https://api.example"), { ok: true });
  assert.equal(sent, 2);
});
test("an empty or non-JSON error response preserves the HTTP status", async (t) => {
  for (const data of [null, "non-JSON"]) {
    const f = t.mock.method(globalThis, "fetch", async () => new Response(data, { status: 502 }));
    await assert.rejects(
      requestJson("https://api.example", { method: "POST" }),
      (e) => e.status === 502
    );
    f.mock.restore();
  }
});
