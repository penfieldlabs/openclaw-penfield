import assert from "node:assert/strict";
import { test } from "node:test";
import { PenfieldApiClient } from "../dist/src/api-client.js";
import { registerLoginCommand } from "../dist/src/cli.js";

async function runStatus(t, scopes, protectedResponse, entry = {}) {
  const commands = new Map();
  const output = [];
  const urls = [];
  let current;
  const program = {
    command(name) {
      current = name;
      return this;
    },
    description() {
      return this;
    },
    action(fn) {
      commands.set(current, fn);
      return this;
    },
  };
  const auth = {
    mode: "browser sign-in",
    getAccessToken: async () => "fixture",
    getScopes: () => scopes,
    discardRejectedKeyToken() {},
  };
  const client = new PenfieldApiClient(auth, "https://api.example");
  t.mock.method(globalThis, "fetch", async (url) => {
    urls.push(new URL(url));
    return urls.length === 1 ? Response.json({ data: { valid: true } }) : protectedResponse;
  });
  t.mock.method(console, "log", (message) => output.push(message));
  t.mock.method(console, "error", (message) => output.push(message));
  registerLoginCommand(
    {
      registerCli: (fn) =>
        fn({ program, config: { plugins: { entries: { "openclaw-penfield": entry } } } }),
    },
    { authService: auth, apiClient: client }
  );
  const previous = process.exitCode;
  try {
    process.exitCode = 0;
    await commands.get("status")();
    return { code: process.exitCode, text: output.join("\n"), urls };
  } finally {
    process.exitCode = previous;
  }
}
test("status rejects a token accepted by verification but refused for protected access", async (t) => {
  const observed = await runStatus(
    t,
    ["read"],
    Response.json({ error: { message: "Session revoked" } }, { status: 401 })
  );
  assert.equal(observed.code, 1);
  assert.match(observed.text, /401/);
});
test("status discards a successful protected response without parsing private memory data", async (t) => {
  const observed = await runStatus(t, ["read"], new Response("unparsed-private-fixture"));
  assert.deepEqual(
    observed.urls.map((u) => u.pathname),
    ["/api/v2/auth/verify", "/api/v2/memories"]
  );
  assert.equal(observed.urls[1].searchParams.get("per_page"), "1");
  assert.equal(observed.code, 0);
  assert.match(observed.text, /Verified browser sign-in/);
  assert.doesNotMatch(observed.text, /private-fixture/);
});
test("status explains a write-only login without exercising a write", async (t) => {
  const observed = await runStatus(
    t,
    ["write"],
    Response.json({ error: { code: "AUTH_INSUFFICIENT_PERMISSIONS" } }, { status: 403 })
  );
  assert.equal(observed.code, 0);
  assert.match(observed.text, /read access is restricted/i);
});
test("status propagates unrelated permission failures even for a write-only login", async (t) => {
  const observed = await runStatus(
    t,
    ["write"],
    Response.json({ error: { code: "ACCOUNT_DISABLED" } }, { status: 403 })
  );
  assert.equal(observed.code, 1);
  assert.match(observed.text, /403/);
});

for (const [name, entry, expected] of [
  [
    "unset",
    {},
    /prompt hook blocked.*openclaw config set plugins\.entries\.openclaw-penfield\.hooks\.allowConversationAccess true/i,
  ],
  ["false", { hooks: { allowConversationAccess: false } }, /prompt hook blocked/i],
  ["granted", { hooks: { allowConversationAccess: true } }, /conversation access granted/i],
  [
    "injection denied",
    { hooks: { allowConversationAccess: true, allowPromptInjection: false } },
    /prompt hook blocked.*allowPromptInjection/i,
  ],
  [
    "disabled",
    { config: { autoAwaken: false, autoOrient: false } },
    /autoAwaken and autoOrient are off/i,
  ],
]) {
  test("status reports prompt hook access when " + name, async (t) => {
    const observed = await runStatus(t, ["read"], new Response(""), entry);
    assert.equal(observed.code, 0);
    assert.match(observed.text, /Verified browser sign-in/);
    assert.match(observed.text, expected);
  });
}
