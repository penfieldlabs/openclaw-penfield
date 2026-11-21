import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { registerPenfieldHooks } from "../dist/src/hooks.js";
import { registerLoginCommand } from "../dist/src/cli.js";
import { connectionOptions, parseConfig, configSchema } from "../dist/src/config.js";

const logger = { warn() {}, info() {}, error() {} };
function hookFixture(autoAwaken = true, autoOrient = true) {
  const state = { session: "first", reads: 0, reflects: 0, down: false };
  let hook;
  const runtime = {
    authService: {
      getAccessToken: async () => {
        if (!state.session) throw Error("sign in");
        return state.session;
      },
    },
    apiClient: {
      withSignal() {
        return this;
      },
      get: async () => {
        state.reads++;
        return { briefing: state.session + " personality" };
      },
      post: async () => {
        state.reflects++;
        if (state.down) throw Error("unavailable");
        return { memories: [{ content: state.session + " memory" }] };
      },
    },
  };
  registerPenfieldHooks({
    api: {
      logger,
      on(name, fn) {
        assert.equal(name, "before_prompt_build");
        hook = fn;
      },
    },
    config: { autoAwaken, autoOrient },
    runtime,
  });
  const authority = { allows: () => true, assertActive() {}, fingerprint: "unit-policy" };
  return {
    state,
    runtime,
    hook: hook ? (a = authority) => hook({}, { toolAuthority: a }) : undefined,
  };
}
test("manifest declares the exclusive memory slot and all seventeen tools", async () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../openclaw.plugin.json", import.meta.url), "utf8")
  );
  const { registerPenfieldTools } = await import("../dist/src/tools/index.js");
  const names = [];
  registerPenfieldTools({ registerTool: (t) => names.push(t.name) }, async () => {
    throw Error("unexpected init");
  });
  assert.deepEqual(manifest.configSchema, JSON.parse(JSON.stringify(configSchema)));
  assert.deepEqual(names.sort(), [...manifest.contracts.tools].sort());
  assert.equal(manifest.kind, "memory");
  assert.equal(manifest.cliCommands[0].name, "penfield");
});
test("optional hook is absent when both settings are off", () => {
  assert.equal(hookFixture(false, false).hook, undefined);
});
test("hook caches by session and invalidates on sign-out and account change", async () => {
  const { state, hook } = hookFixture();
  assert.match((await hook()).prependContext, /first memory/);
  await hook();
  assert.equal(state.reads, 1);
  assert.equal(state.reflects, 1);
  state.session = "";
  assert.doesNotMatch((await hook()).prependContext, /first memory/);
  state.session = "second";
  assert.match((await hook()).prependContext, /second memory/);
  assert.equal(state.reads, 2);
});
test("one failed hook input leaves the other available", async () => {
  const { state, hook } = hookFixture();
  state.down = true;
  assert.match((await hook()).prependContext, /personality/);
});
test("dev discovery follows the legacy auth origin; custom auth alone requires an API origin", () => {
  assert.equal(
    connectionOptions(parseConfig({ authUrl: "https://auth-dev.penfield.app" }), {}).apiUrl,
    "https://api-dev.penfield.app"
  );
  assert.throws(
    () => connectionOptions(parseConfig({ authUrl: "https://custom.example" }), {}),
    /apiUrl/
  );
});
test("configuration rejects non-HTTPS origins and unrecognized fields", () => {
  assert.throws(() => parseConfig({ apiUrl: "http://api.example" }));
  assert.throws(() => connectionOptions(parseConfig({ apiUrl: "https://api.example/path" })));
  assert.throws(() => parseConfig({ unknown: true }));
});
test("status verifies the active credential and exits unsuccessfully if the server rejects it", async (t) => {
  const cmds = new Map();
  let name;
  const program = {
    command(n) {
      name = n;
      return this;
    },
    description() {
      return this;
    },
    action(fn) {
      cmds.set(name, fn);
      return this;
    },
  };
  let checked = false;
  registerLoginCommand(
    { registerCli: (fn) => fn({ program }) },
    {
      authService: { getScopes: () => ["read"], mode: "API key" },
      apiClient: {
        get: async (path) => {
          assert.equal(path, "/api/v2/auth/verify");
          checked = true;
          return { valid: false };
        },
      },
    }
  );
  const logs = [];
  t.mock.method(console, "error", (s) => logs.push(s));
  const previous = process.exitCode;
  try {
    await cmds.get("status")();
    assert.ok(checked);
    assert.equal(process.exitCode, 1);
    assert.match(logs[0], /did not verify/);
  } finally {
    process.exitCode = previous;
  }
});

test("the prompt hook checks permissions before each read, including cached data", async () => {
  const { state, hook } = hookFixture();
  await hook();
  const denied = await hook({
    fingerprint: "another-policy",
    allows: () => false,
    assertActive() {},
  });
  assert.equal(denied, undefined);
  assert.equal(state.reads, 1);
  const allowed = await hook({
    fingerprint: "one-tool",
    allows: (name) => name === "penfield_reflect",
    assertActive() {},
  });
  assert.doesNotMatch(allowed.prependContext, /personality/);
  assert.match(allowed.prependContext, /memory/);
});
test("expired hook authority cannot contribute fetched memory", async () => {
  const { hook } = hookFixture();
  await assert.rejects(
    hook({
      fingerprint: "stale",
      allows: () => true,
      assertActive() {
        throw Error("turn ended");
      },
    }),
    /turn ended/
  );
});

test("incognito sessions perform no automatic Penfield reads", async () => {
  let callback;
  let reads = 0;
  registerPenfieldHooks({
    api: {
      logger,
      on(_name, fn) {
        callback = fn;
      },
    },
    config: { autoAwaken: true, autoOrient: true },
    runtime: {
      authService: {
        getAccessToken: async () => {
          reads++;
          return "active";
        },
      },
      apiClient: {
        get() {
          reads++;
        },
        post() {
          reads++;
        },
      },
    },
  });
  const result = await callback(
    {},
    {
      sessionKey: "agent:main:dashboard:incognito-test",
      toolAuthority: { allows: () => true, assertActive() {} },
    }
  );
  assert.equal(result, undefined);
  assert.equal(reads, 0);
});

test("an explicitly blank environment key cannot silently select a saved broader sign-in", () => {
  const previous = process.env.PENFIELD_API_KEY;
  try {
    process.env.PENFIELD_API_KEY = "   ";
    assert.throws(() => connectionOptions(parseConfig({})), /key.*empty/i);
  } finally {
    if (previous === undefined) delete process.env.PENFIELD_API_KEY;
    else process.env.PENFIELD_API_KEY = previous;
  }
});
test("the actual plugin entry registers from defaults without making an HTTP request", async (t) => {
  const { default: plugin } = await import("../dist/index.js");
  const found = { tools: [], hooks: [], capabilities: [], cli: 0 };
  const network = t.mock.method(globalThis, "fetch", async () => {
    throw Error("unexpected network request at startup");
  });
  plugin.register({
    id: "openclaw-penfield",
    pluginConfig: {},
    logger,
    registerMemoryCapability(capability) {
      found.capabilities.push(capability);
    },
    registerTool(tool) {
      found.tools.push(tool.name);
    },
    registerCli() {
      found.cli++;
    },
    on(name) {
      found.hooks.push(name);
    },
  });
  assert.equal(plugin.kind, "memory");
  assert.equal(found.capabilities.length, 1);
  assert.deepEqual(found.capabilities[0].recallToolNames, ["penfield_recall", "penfield_fetch"]);
  assert.equal(found.capabilities[0].providerFlushPlanResolver({}), null);
  assert.ok(found.capabilities[0].recallToolNames.every((name) => found.tools.includes(name)));
  assert.equal(found.tools.length, 17);
  assert.equal(found.cli, 1);
  assert.deepEqual(found.hooks, ["before_prompt_build"]);
  assert.equal(network.mock.callCount(), 0);
});

test("signing out during asynchronous hook reads drops the old account context", async () => {
  const { runtime, state, hook } = hookFixture(true, false);
  runtime.apiClient.get = async () => {
    state.session = "";
    return { briefing: "old account" };
  };
  assert.equal(await hook(), undefined);
});

test("all five CLI actions use the active credential and report outcomes without printing it", async (t) => {
  const commands = new Map(),
    output = [];
  let name;
  const program = {
    command(value) {
      name = value;
      return this;
    },
    description() {
      return this;
    },
    action(fn) {
      commands.set(name, fn);
      return this;
    },
  };
  let revoked = true;
  const auth = {
    mode: "API key",
    getScopes: () => ["read"],
    login: async (prompt) => {
      prompt("verification prompt");
      return ["read", "write"];
    },
    getAccessToken: async (force) => {
      assert.equal(force, true);
      return "private-fixture";
    },
    logout: async () => {
      const previous = revoked;
      revoked = false;
      return previous;
    },
  };
  registerLoginCommand(
    { registerCli: (fn) => fn({ program }) },
    {
      authService: auth,
      apiClient: {
        checkReadAccess: async () => "allowed",
        get: async (path) =>
          path.endsWith("/verify") ? { valid: true } : { briefing: "owned briefing" },
      },
    }
  );
  t.mock.method(console, "log", (line) => output.push(line));
  for (const command of ["login", "status", "refresh", "awaken", "logout", "logout"])
    await commands.get(command)();
  assert.match(output.join("\n"), /verification prompt/);
  assert.match(output.join("\n"), /Granted permissions: read, write/);
  assert.match(output.join("\n"), /Verified API key/);
  assert.ok(output.includes("Renewed API key."));
  assert.ok(output.includes("owned briefing"));
  assert.match(output.at(-2), /Revoked the saved/);
  assert.match(output.at(-1), /No saved browser sign-in/);
  assert.doesNotMatch(output.join("\n"), /private-fixture/);
});

test("the SDK authoring metadata describes the same tools as the running memory plugin", async () => {
  const { getToolPluginMetadata } = await import("openclaw/plugin-sdk/tool-plugin");
  const { default: plugin } = await import("../dist/index.js");
  const { registerPenfieldTools } = await import("../dist/src/tools/index.js");
  const installed = [];
  registerPenfieldTools(
    {
      registerTool: ({ name, label, description, parameters }) =>
        installed.push({ name, label, description, parameters }),
    },
    {}
  );
  const metadata = getToolPluginMetadata(plugin);
  assert.ok(metadata);
  assert.deepEqual(metadata.tools, installed);
  assert.deepEqual(metadata.configSchema, configSchema);
  const manifest = JSON.parse(
    readFileSync(new URL("../openclaw.plugin.json", import.meta.url), "utf8")
  );
  for (const key of ["id", "name", "description", "activation"])
    assert.deepEqual(metadata[key], manifest[key]);
});

function onlyTool(tool) {
  return { fingerprint: tool, allows: (name) => name === tool, assertActive() {} };
}

test("overlapping turns receive context for their own tool policy", async () => {
  const { runtime, hook } = hookFixture();
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  runtime.apiClient.get = async () => {
    entered.resolve();
    await release.promise;
    return { briefing: "identity only" };
  };
  const first = hook(onlyTool("penfield_awaken"));
  await entered.promise;
  const second = await hook(onlyTool("penfield_reflect"));
  release.resolve();
  assert.equal(second?.prependContext, "Recent Penfield memories:\n- first memory");
  assert.equal((await first)?.prependContext, "Penfield identity:\nidentity only");
});

test("alternating tool policies reuse each policy's cached context", async () => {
  const { hook, state } = hookFixture();
  for (let i = 0; i < 3; i++) {
    assert.match((await hook(onlyTool("penfield_awaken"))).prependContext, /personality/);
    assert.match((await hook(onlyTool("penfield_reflect"))).prependContext, /memory/);
  }
  assert.deepEqual([state.reads, state.reflects], [1, 1]);
});
