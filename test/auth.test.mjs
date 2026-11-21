import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAuthService } from "../dist/src/auth-service.js";
import { saveCredential } from "../dist/src/store.js";

const apiUrl = "https://api.example";
const logger = { info() {}, warn() {}, error() {} };
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "penfield-test-"));
  t.after(() => rmSync(dir, { force: true, recursive: true }));
  return {
    id: "openclaw-penfield",
    resolvePath: (path) => join(dir, path.replace(/^~\//, "")),
    logger,
  };
}

test("a configured key overrides a saved sign-in and exchanges once for simultaneous calls", async (t) => {
  const api = fixture(t);
  saveCredential(
    api,
    { clientId: "browser", access: "browser-session", expires: Date.now() + 86400000 },
    apiUrl
  );
  const service = createAuthService(api, { apiUrl, apiKey: "limited-key" });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(String(url), apiUrl + "/api/v2/auth/token");
    assert.equal(new Headers(init.headers).get("authorization"), "Bearer limited-key");
    assert.ok(!init.body);
    calls++;
    return Response.json({
      data: { access_token: "key-session", expires_in: 86400, refresh_token: null },
    });
  });
  assert.deepEqual(await Promise.all([service.getAccessToken(), service.getAccessToken()]), [
    "key-session",
    "key-session",
  ]);
  assert.equal(calls, 1);
});

test("a refused key cannot fall back to a more powerful login", async (t) => {
  const api = fixture(t);
  saveCredential(
    api,
    { clientId: "browser", access: "browser-session", expires: Date.now() + 86400000 },
    apiUrl
  );
  t.mock.method(globalThis, "fetch", async () => Response.json({}, { status: 401 }));
  await assert.rejects(
    createAuthService(api, { apiUrl, apiKey: "limited-key" }).getAccessToken(),
    /401/
  );
});

test("a saved token with no refresh remains valid until its actual expiry", async (t) => {
  const api = fixture(t);
  saveCredential(
    api,
    { clientId: "browser", access: "still-live", expires: Date.now() + 60000 },
    apiUrl
  );
  assert.equal(await createAuthService(api, { apiUrl }).getAccessToken(), "still-live");
});

test("a rejected cached key token is discarded for the next call, without replaying the operation", async (t) => {
  const { PenfieldApiClient } = await import("../dist/src/api-client.js");
  const auth = createAuthService(fixture(t), { apiUrl, apiKey: "restricted-fixture" });
  const client = new PenfieldApiClient(auth, apiUrl);
  let exchanges = 0,
    operations = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    if (new URL(url).pathname === "/api/v2/auth/token") {
      exchanges++;
      return Response.json({ data: { access_token: "session-" + exchanges, expires_in: 86400 } });
    }
    operations++;
    return operations === 1
      ? Response.json({}, { status: 401 })
      : Response.json({ data: { ok: true } });
  });
  await assert.rejects(client.post("/write", {}), /401/);
  assert.equal(operations, 1);
  assert.deepEqual(await client.get("/read"), { ok: true });
  assert.equal(exchanges, 2);
});
test("refresh uses the new token's permissions when the response omits scope", async (t) => {
  const api = fixture(t);
  saveCredential(
    api,
    {
      clientId: "browser",
      access: "old",
      refresh: "renew",
      expires: 0,
      scope: "read write delete",
    },
    apiUrl
  );
  const updated =
    "unit." + Buffer.from(JSON.stringify({ scopes: ["read"] })).toString("base64url") + ".sample";
  t.mock.method(globalThis, "fetch", async (url) =>
    String(url).includes(".well-known")
      ? Response.json({
          issuer: "https://auth.example",
          token_endpoint: "https://auth.example/token",
        })
      : Response.json({ access_token: updated, expires_in: 86400 })
  );
  const service = createAuthService(api, { apiUrl });
  await service.getAccessToken();
  assert.deepEqual(service.getScopes(), ["read"]);
});
