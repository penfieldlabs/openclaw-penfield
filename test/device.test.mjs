import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beginDeviceFlow, pollDeviceFlow } from "../dist/src/device-flow.js";
import { createAuthService } from "../dist/src/auth-service.js";
import { credentialPath, loadCredential, saveCredential } from "../dist/src/store.js";

const apiUrl = "https://api.example",
  origin = "https://login.example";
const discovery = {
  issuer: origin,
  registration_endpoint: origin + "/register",
  device_authorization_endpoint: origin + "/device",
  token_endpoint: origin + "/token",
  revocation_endpoint: origin + "/revoke",
};
const device = {
  user_code: "user",
  device_code: "device",
  verification_uri: origin + "/confirm",
  interval: 0.001,
  expires_in: 30,
};
const response = (data, status = 200) => Response.json(data, { status });
const token = {
  access_token: "session",
  refresh_token: "renew",
  scope: "read write delete",
  expires_in: 86400,
};
function mock(t, queue) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url: String(url), ...init });
    assert.ok(queue.length, "unexpected request");
    return queue.shift();
  });
  return calls;
}
function host(t) {
  const root = mkdtempSync(join(tmpdir(), "penfield-device-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return {
    id: "penfield",
    runtime: { state: { resolveStateDir: () => root } },
    resolvePath: () => root,
  };
}
function pending() {
  return {
    clientId: "client",
    device,
    tokenEndpoint: discovery.token_endpoint,
    expiresAt: Date.now() + 15000,
  };
}
test("login discovers once on the API host and stores only the granted permissions", async (t) => {
  const h = host(t);
  const calls = mock(t, [
    response(discovery),
    response({ client_id: "client" }),
    response(device),
    response({ error: "authorization_pending" }, 400),
    response(token),
  ]);
  const auth = createAuthService(h, { apiUrl });
  assert.deepEqual(await auth.login(() => {}), ["read", "write", "delete"]);
  assert.equal(calls[0].url, apiUrl + "/.well-known/oauth-authorization-server");
  assert.equal(calls[1].url, discovery.registration_endpoint);
  assert.equal(calls[2].url, discovery.device_authorization_endpoint);
  assert.equal(calls[3].url, discovery.token_endpoint);
  const file = credentialPath(h, apiUrl);
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(loadCredential(h, apiUrl).scope, token.scope);
  assert.equal(loadCredential(h, "https://other.example"), null);
});
for (const [error, reason] of [
  ["access_denied", /denied/],
  ["invalid_grant", /expired/],
  ["expired_token", /expired/],
  ["server_error", /server_error/],
]) {
  test("poll handles " + error, async (t) => {
    mock(t, [response({ error }, 400)]);
    await assert.rejects(pollDeviceFlow(pending()), reason);
  });
}
test("slow_down increases the polling interval", async (t) => {
  const calls = mock(t, [response({ error: "slow_down" }, 400), response(token)]);
  const start = Date.now();
  assert.equal((await pollDeviceFlow(pending())).access_token, token.access_token);
  assert.ok(Date.now() - start >= 5000);
  assert.equal(calls.length, 2);
});
test("client registration requires a discovery endpoint", async (t) => {
  mock(t, [response({ ...discovery, registration_endpoint: undefined })]);
  await assert.rejects(beginDeviceFlow(apiUrl, host(t)), /advertise/);
});
test("revocation covers both tokens before clearing the local login", async (t) => {
  const h = host(t);
  saveCredential(
    h,
    { access: "old", refresh: "rotated", clientId: "client", expires: Date.now() + 99999 },
    apiUrl
  );
  const calls = mock(t, [response(discovery), new Response(""), new Response("")]);
  assert.equal(await createAuthService(h, { apiUrl }).logout(), true);
  assert.deepEqual(
    calls.slice(1).map((c) => c.body.get("token_type_hint")),
    ["refresh_token", "access_token"]
  );
  assert.equal(loadCredential(h, apiUrl), null);
});
test("failed revocation preserves local credentials to permit retry", async (t) => {
  const h = host(t);
  saveCredential(h, { access: "old", clientId: "client", expires: Date.now() }, apiUrl);
  mock(t, [response(discovery), response({ error: "temporarily_unavailable" }, 503)]);
  await assert.rejects(createAuthService(h, { apiUrl }).logout(), /503/);
  assert.ok(loadCredential(h, apiUrl));
});
test("an expired code triggers no new poll", async (t) => {
  const calls = mock(t, []);
  await assert.rejects(pollDeviceFlow({ ...pending(), expiresAt: Date.now() - 1 }), /expired/);
  assert.equal(calls.length, 0);
});

test("logout waits for in-flight rotation and revokes the newly saved pair", async (t) => {
  const h = host(t);
  saveCredential(
    h,
    { clientId: "client", access: "previous", refresh: "once", expires: 1 },
    apiUrl
  );
  let started, finish;
  const rotating = new Promise((resolve) => {
    started = resolve;
  });
  const gate = new Promise((resolve) => {
    finish = resolve;
  });
  const revoked = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    if (String(url).includes(".well-known")) return response(discovery);
    if (String(url) === discovery.token_endpoint) {
      started();
      await gate;
      return response({
        access_token: "new-session",
        refresh_token: "new-renewal",
        expires_in: 86400,
      });
    }
    revoked.push(init.body.get("token"));
    return new Response(null, { status: 200 });
  });
  const one = createAuthService(h, { apiUrl }),
    two = createAuthService(h, { apiUrl });
  const rotation = one.getAccessToken();
  await rotating;
  const logout = two.logout();
  finish();
  await Promise.all([rotation, logout]);
  assert.deepEqual(revoked, ["new-renewal", "new-session"]);
  assert.equal(loadCredential(h, apiUrl), null);
});
test("an invalid refresh grant is never replayed and preserves the old record", async (t) => {
  const h = host(t);
  saveCredential(h, { clientId: "client", access: "old", refresh: "once", expires: 1 }, apiUrl);
  const calls = mock(t, [response(discovery), response({ error: "invalid_grant" }, 400)]);
  await assert.rejects(createAuthService(h, { apiUrl }).getAccessToken(), /invalid_grant/);
  assert.equal(calls.length, 2);
  assert.equal(loadCredential(h, apiUrl).refresh, "once");
});
test("device registration and device request refusals do not start polling", async (t) => {
  for (const stage of ["registration", "device"]) {
    const queue = [response(discovery)];
    if (stage === "device") queue.push(response({ client_id: "client" }));
    queue.push(response({ error: "access_denied" }, 403));
    const calls = mock(t, queue);
    await assert.rejects(beginDeviceFlow(apiUrl, host(t)), /403/);
    assert.ok(calls.every((c) => c.url !== discovery.token_endpoint));
    t.mock.restoreAll();
  }
});
test("missing revocation metadata does not erase a saved login", async (t) => {
  const h = host(t);
  saveCredential(h, { clientId: "client", access: "old", expires: 1 }, apiUrl);
  mock(t, [response({ ...discovery, revocation_endpoint: undefined })]);
  await assert.rejects(createAuthService(h, { apiUrl }).logout(), /advertise/);
  assert.ok(loadCredential(h, apiUrl));
});
test("discovery rejects non-HTTPS credential endpoints", async (t) => {
  const calls = mock(t, [response({ ...discovery, token_endpoint: "http://auth.example/token" })]);
  await assert.rejects(beginDeviceFlow(apiUrl, host(t)), /metadata/);
  assert.equal(calls.length, 1);
});

test("logout revokes both a saved origin login and a matching legacy login before removing either", async (t) => {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  const h = host(t),
    prod = "https://api.penfield.app";
  const oldAccess =
    "unit." +
    Buffer.from(JSON.stringify({ iss: "https://auth.penfield.app" })).toString("base64url") +
    ".old";
  const oldPath = join(h.runtime.state.resolveStateDir(), "extensions", h.id, "credentials.json");
  mkdirSync(dirname(oldPath), { recursive: true });
  writeFileSync(
    oldPath,
    JSON.stringify({
      version: 1,
      clientId: "old-client",
      access: oldAccess,
      refresh: "old-renewal",
      expires: 1,
    }),
    { mode: 0o600 }
  );
  saveCredential(
    h,
    { clientId: "new-client", access: "new-access", refresh: "new-renewal", expires: 1 },
    prod
  );
  const revoked = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    if (String(url).includes(".well-known")) return response(discovery);
    revoked.push(init.body.get("token"));
    return new Response(null, { status: 200 });
  });
  await createAuthService(h, { apiUrl: prod }).logout();
  assert.equal(revoked.length, 4);
  assert.ok(revoked.includes(oldAccess) && revoked.includes("old-renewal"));
  assert.equal(loadCredential(h, prod), null);
});

test("a registered device client survives cancellation, logout and a new service, scoped to its origin", async (t) => {
  const h = host(t);
  const queue = [
    response(discovery),
    response({ client_id: "dev-client" }),
    response(device),
    response(discovery),
    response(device),
    response(token),
    response(discovery),
    new Response(null, { status: 200 }),
    new Response(null, { status: 200 }),
    response(discovery),
    response(device),
    response(discovery),
    response({ client_id: "other-client" }),
    response(device),
  ];
  const calls = mock(t, queue);
  await beginDeviceFlow(apiUrl, h);
  await createAuthService(h, { apiUrl }).login(() => {});
  await createAuthService(h, { apiUrl }).logout();
  assert.equal((await beginDeviceFlow(apiUrl, h)).clientId, "dev-client");
  assert.equal((await beginDeviceFlow("https://other.example", h)).clientId, "other-client");
  const registrations = calls.filter((c) => c.url === discovery.registration_endpoint);
  assert.equal(registrations.length, 2);
  assert.equal(JSON.parse(registrations[0].body).client_name, "OpenClaw (Penfield plugin)");
  assert.equal(loadCredential(h, apiUrl), null);
  const path = credentialPath(h, apiUrl) + ".client";
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(statSync(join(path, "..")).mode & 0o777, 0o700);
});
test("an invalid cached client is replaced once before the device request is retried", async (t) => {
  const h = host(t);
  saveCredential(h, { clientId: "retired", access: "session", expires: 100 }, apiUrl);
  const calls = mock(t, [
    response(discovery),
    response({ error: "invalid_client" }, 401),
    response({ client_id: "replacement" }),
    response(device),
    response(discovery),
    response(device),
  ]);
  assert.equal((await beginDeviceFlow(apiUrl, h)).clientId, "replacement");
  assert.equal((await beginDeviceFlow(apiUrl, h)).clientId, "replacement");
  assert.deepEqual(
    calls
      .filter((c) => c.url === discovery.device_authorization_endpoint)
      .map((c) => c.body.get("client_id")),
    ["retired", "replacement", "replacement"]
  );
  assert.equal(calls.filter((c) => c.url === discovery.registration_endpoint).length, 1);
});

test("a temporary device failure preserves a cached client and does not re-register", async (t) => {
  const h = host(t);
  const calls = mock(t, [
    response(discovery),
    response({ client_id: "registered" }),
    response(device),
    response(discovery),
    response({ error: "temporarily_unavailable" }, 503),
    response({ ...discovery, registration_endpoint: undefined }),
    response(device),
  ]);
  await beginDeviceFlow(apiUrl, h);
  await assert.rejects(beginDeviceFlow(apiUrl, h), /503/);
  assert.equal((await beginDeviceFlow(apiUrl, h)).clientId, "registered");
  assert.equal(calls.filter((c) => c.url === discovery.registration_endpoint).length, 1);
});
test("concurrent sign-ins share registration but receive separate device authorizations", async (t) => {
  const h = host(t);
  let registrations = 0,
    devices = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).includes(".well-known")) return response(discovery);
    if (String(url) === discovery.registration_endpoint)
      return response({ client_id: "id-" + ++registrations });
    if (String(url) === discovery.device_authorization_endpoint)
      return response({ ...device, device_code: "code-" + ++devices });
    assert.fail("unexpected request");
  });
  const [a, b] = await Promise.all([beginDeviceFlow(apiUrl, h), beginDeviceFlow(apiUrl, h)]);
  assert.equal(registrations, 1);
  assert.equal(a.clientId, b.clientId);
  assert.notEqual(a.device.device_code, b.device.device_code);
});
test("invalid_client during polling offers a new code once without silently transferring approval", async (t) => {
  const h = host(t),
    rejected = response({ error: "invalid_client" }, 400);
  const calls = mock(t, [
    response(discovery),
    response({ client_id: "first" }),
    response(device),
    rejected,
    response(discovery),
    response({ client_id: "next" }),
    response({ ...device, user_code: "second-code" }),
    response(token),
  ]);
  const prompts = [];
  await createAuthService(h, { apiUrl }).login((text) => prompts.push(text));
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /second-code/);
  assert.equal(loadCredential(h, apiUrl).clientId, "next");
  assert.equal(calls.filter((c) => c.url === discovery.registration_endpoint).length, 2);
});

test("an unreadable client cache cannot prevent server logout of a valid saved session", async (t) => {
  const h = host(t);
  const { writeFileSync } = await import("node:fs");
  saveCredential(
    h,
    { access: "logged-in", refresh: "active-refresh", clientId: "valid-client", expires: 1000 },
    apiUrl
  );
  writeFileSync(credentialPath(h, apiUrl) + ".client", "damaged", { mode: 0o600 });
  const calls = mock(t, [
    response(discovery),
    new Response(null, { status: 200 }),
    new Response(null, { status: 200 }),
  ]);
  assert.equal(await createAuthService(h, { apiUrl }).logout(), true);
  assert.equal(calls.filter((c) => c.url === discovery.revocation_endpoint).length, 2);
  assert.equal(loadCredential(h, apiUrl), null);
});
