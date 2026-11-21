import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const cli = process.env.OPENCLAW_TEST_CLI ?? join(root, "node_modules/openclaw/openclaw.mjs");
async function availablePort() {
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((resolve, reject) => socket.close((err) => (err ? reject(err) : resolve())));
  return port;
}
async function run(bin, args, env, { failure = false } = {}) {
  const result = await promisify(execFile)(bin, args, {
    cwd: root,
    env,
    timeout: 120000,
    maxBuffer: 8_000_000,
  }).then(
    ({ stdout }) => ({ code: 0, out: stdout }),
    (err) => {
      const diagnostics = String(err.stderr ?? "");
      const reason = diagnostics.match(
        /Penfield HTTP \d{3}|request timed out|fetch failed|sign-in expired|device code expired/i
      )?.[0];
      const probeFrame = args[0]?.endsWith("/memory-host-probe.mjs")
        ? diagnostics.match(/memory-host-probe\.mjs:\d+(?::\d+)?/)?.[0]
        : undefined;
      return { code: err.code, out: failure ? diagnostics : "", reason: probeFrame ?? reason };
    }
  );
  if (result.code === (failure ? 1 : 0)) return result.out;
  throw new Error(
    `Host check failed at ${args.slice(bin === process.execPath ? 1 : 0, 3).join(" ")} (exit ${result.code ?? "unknown"}${result.reason ? ", " + result.reason : ""}).`
  );
}
test("packaged plugin in an isolated OpenClaw profile", { timeout: 420000 }, async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "penfield-host-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const state = join(dir, "state");
  await mkdir(state, { mode: 0o700 });
  const secret = randomBytes(32).toString("hex");
  const env = {
    ...process.env,
    OPENCLAW_HOME: dir,
    OPENCLAW_STATE_DIR: state,
    OPENCLAW_CONFIG_PATH: join(state, "openclaw.json"),
    OPENCLAW_GATEWAY_TOKEN: secret,
    OPENCLAW_SKIP_CHANNELS: "1",
    OPENCLAW_DISABLE_BONJOUR: "1",
    NPM_CONFIG_AUDIT: "false",
    NPM_CONFIG_FUND: "false",
  };
  for (const k of Object.keys(env)) if (k.startsWith("PENFIELD_")) delete env[k];
  const oc = (args, overrides = {}, opts) =>
    run(process.execPath, [cli, ...args], { ...env, ...overrides }, opts);
  const inspect = async (name) =>
    JSON.parse(await oc(["plugins", "inspect", name, "--runtime", "--json"]));
  const probe = (owner) =>
    run(process.execPath, [join(root, "test/memory-host-probe.mjs"), cli, owner], env);
  const penfield = "openclaw-penfield";
  const filename = (
    await run("npm", ["pack", "--ignore-scripts", "--silent", "--pack-destination", dir], env)
  ).trim();
  await oc(["plugins", "install", "--force", "--accept-capabilities", join(dir, filename)]);
  const config = JSON.parse(await readFile(env.OPENCLAW_CONFIG_PATH, "utf8"));
  assert.equal(config.plugins.slots.memory, penfield);
  const port = await availablePort();
  config.gateway = { mode: "local", bind: "loopback", port, auth: { mode: "token" } };
  config.plugins.entries[penfield].hooks = { allowConversationAccess: true };
  config.plugins.entries["active-memory"] = { enabled: true };
  const workspace = join(dir, "workspace");
  await mkdir(workspace, { mode: 0o700 });
  const sentinel = "codex-test isolated workspace memory";
  await writeFile(join(workspace, "MEMORY.md"), sentinel);
  await mkdir(join(workspace, "history"));
  await mkdir(join(workspace, "memory"));
  await writeFile(join(workspace, "history/openclaw-memory.md"), "codex-test archived history");
  await writeFile(join(workspace, "memory/2026-01-01.md"), "codex-test daily history");
  config.agents = { ...config.agents, defaults: { ...config.agents?.defaults, workspace } };
  config.tools = { ...config.tools, alsoAllow: ["penfield_awaken", "memory_search", "memory_get"] };
  await writeFile(env.OPENCLAW_CONFIG_PATH, JSON.stringify(config), { mode: 0o600 });

  await t.test(
    "install selects Penfield, validates its package and registers all seventeen tools",
    async () => {
      const manifest = JSON.parse(await readFile(join(root, "openclaw.plugin.json"), "utf8"));
      const inspected = await inspect(penfield);
      assert.equal(inspected.plugin.status, "loaded");
      const guide = await readFile(
        join(inspected.plugin.rootDir, "persona-templates/MEMORY.md"),
        "utf8"
      );
      assert.match(guide, /history\/openclaw-memory\.md/);
      assert.equal(inspected.plugin.memorySlotSelected, true);
      assert.deepEqual(inspected.plugin.toolNames.toSorted(), manifest.contracts.tools.toSorted());
      assert.ok(inspected.typedHooks.some((h) => h.name === "before_prompt_build"));
      assert.ok(inspected.cliCommands.includes("penfield"));
      assert.equal(
        await realpath(join(inspected.plugin.rootDir, "node_modules/openclaw")),
        await realpath(dirname(cli))
      );
      const validation = JSON.parse(
        await oc(["plugins", "validate", "--root", inspected.plugin.rootDir, "--json"])
      );
      assert.equal(validation.valid, true);
      assert.deepEqual(validation.errors, []);
      assert.ok(JSON.parse(await oc(["skills", "info", "penfield", "--json"])).eligible);
      const usage = await oc(["penfield", "--help"]);
      for (const command of ["awaken", "login", "logout", "status", "refresh"])
        assert.ok(usage.includes(command));
      assert.match(
        await oc(
          ["penfield", "status"],
          { PENFIELD_API_URL: "https://api-dev.penfield.app" },
          { failure: true }
        ),
        /sign in/i
      );
    }
  );
  await t.test(
    "the dreaming sidecar leaves the primary index to the selected slot and Active Memory resolves Penfield's read tools",
    async () => {
      await probe(penfield);
    }
  );

  const active = process.env.PENFIELD_DEV_API_KEY
    ? {
        PENFIELD_API_URL: "https://api-dev.penfield.app",
        PENFIELD_API_KEY: process.env.PENFIELD_DEV_API_KEY,
      }
    : undefined;
  const gateway = spawn(process.execPath, [cli, "gateway", "run"], {
    env: { ...env, ...active },
    stdio: "ignore",
    detached: process.platform !== "win32",
  });
  const exited = once(gateway, "exit");
  function stop(signal) {
    if (gateway.exitCode !== null || gateway.signalCode !== null) return;
    if (process.platform === "win32") gateway.kill(signal);
    else process.kill(-gateway.pid, signal);
  }
  try {
    const base = "http://127.0.0.1:" + port;
    let ready = false;
    for (let i = 0; i < 160 && gateway.exitCode === null; i++) {
      try {
        ready = (await fetch(base + "/readyz", { signal: AbortSignal.timeout(750) })).ok;
      } catch {
        /* Gateway is starting. */
      }
      if (ready) break;
      await delay(300);
    }
    assert.ok(ready, "loopback gateway became ready");
    await t.test(
      "deep status reaches the gateway and doctor completes with a healthy plugin registry",
      async () => {
        const status = JSON.parse(await oc(["status", "--deep", "--json"]));
        assert.ok(status.gateway.reachable);
        assert.equal(status.gateway.authWarning, null);
        assert.equal(status.memoryPlugin.slot, penfield);
        assert.ok(status.health.ok);
        assert.ok(status.health.plugins.loaded.includes(penfield));
        assert.deepEqual(status.health.plugins.errors, []);
        assert.deepEqual(status.degradedPlugins, []);
        assert.match(await oc(["doctor", "--non-interactive"]), /Doctor complete/);
      }
    );
    const invoke = (tool, args) =>
      fetch(base + "/tools/invoke", {
        method: "POST",
        headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" },
        body: JSON.stringify({ tool, args, sessionKey: "main" }),
        signal: AbortSignal.timeout(30000),
      });
    await t.test("workspace reads follow the host sidecar's advertised tools", async () => {
      const { plugin } = await inspect("memory-core");
      for (const [tool, args] of [
        ["memory_get", { path: "MEMORY.md" }],
        ["memory_search", { query: sentinel }],
      ]) {
        const response = await invoke(tool, args);
        const result = await response.json();
        if (plugin.toolNames.includes(tool)) {
          assert.equal(response.status, 200);
          assert.ok(result.ok);
          const details = result.result.details;
          if (tool === "memory_get") assert.equal(details.text.trim(), sentinel);
          else
            assert.ok(
              details.results.some(
                (row) => row.path === "MEMORY.md" && row.snippet.includes(sentinel)
              )
            );
        } else {
          assert.equal(response.status, 404);
          assert.equal(result.error.type, "not_found");
        }
      }
    });
    await t.test("dev CLI and loopback gateway tool invocation", { skip: !active }, async () => {
      assert.match(await oc(["penfield", "status"], active), /Verified API key/);
      assert.match(await oc(["penfield", "refresh"], active), /Renewed API key/);
      assert.match(await oc(["penfield", "logout"], active), /No saved browser sign-in/);
      const briefing = await oc(["penfield", "awaken"], active);
      const response = await invoke("penfield_awaken", {});
      assert.ok(response.ok, "gateway tool invocation returned HTTP " + response.status);
      const result = await response.json();
      assert.ok(result.ok && !result.result?.isError, "gateway executed the registered tool");
      assert.ok(
        result.result.content[0].text.trim() === briefing.trim(),
        "gateway and CLI returned the same briefing"
      );
    });
  } finally {
    stop("SIGTERM");
    const ended = await Promise.race([exited.then(() => true), delay(5000, false, { ref: false })]);
    if (!ended) {
      stop("SIGKILL");
      await exited;
    }
  }

  await t.test(
    "the host honors an explicit disable of the dreaming sidecar while Penfield holds the slot",
    async (t) => {
      const saved = await readFile(env.OPENCLAW_CONFIG_PATH);
      try {
        await oc(["config", "set", "plugins.entries.memory-core.enabled", "false"]);
        assert.equal((await inspect("memory-core")).plugin.status, "disabled");
        assert.equal((await inspect(penfield)).plugin.memorySlotSelected, true);
        await probe(penfield);
        await t.test("opt-in admits a Penfield tools flush with host timing", async () => {
          await oc([
            "config",
            "set",
            "plugins.entries.openclaw-penfield.config.compactionFlush",
            "true",
          ]);
          await probe(penfield);
        });
      } finally {
        await writeFile(env.OPENCLAW_CONFIG_PATH, saved);
      }
    }
  );
  await t.test(
    "selecting memory-core restores its index and removes Penfield from the runtime",
    async () => {
      await oc(["config", "set", "plugins.slots.memory", "memory-core"]);
      const inspected = await inspect(penfield);
      assert.equal(inspected.plugin.status, "disabled");
      assert.deepEqual(inspected.plugin.toolNames, []);
      assert.deepEqual(inspected.cliCommands, []);
      assert.match(
        await oc(["penfield", "status"], {}, { failure: true }),
        /does not know|unknown command|not found/i
      );
      await probe("memory-core");
    }
  );
});
