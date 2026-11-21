import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

// Load the same physical host as the CLI that installed the package. These
// internal imports belong to the integration test, outside the shipped plugin.
const [cli, expectedOwner] = process.argv.slice(2);
const fromHost = (path) => import(pathToFileURL(join(dirname(cli), "dist", path)));
const { captureRuntimeConfigAsyncReader } = await fromHost("plugin-sdk/runtime-config-snapshot.js");
const { loadOpenClawPlugins } = await fromHost("plugins/loader.js");
const { getMemoryCapabilityRegistration, buildActiveMemoryPromptSection } = await fromHost(
  "plugin-sdk/memory-host-core.js"
);
const config = await captureRuntimeConfigAsyncReader()();
const penfield = "openclaw-penfield";
const core = "memory-core";
const registry = loadOpenClawPlugins({
  config,
  onlyPluginIds: [penfield, core, "active-memory"],
  activate: true,
});
const plugin = registry.plugins.find((p) => p.id === penfield);
const builtin = registry.plugins.find((p) => p.id === core);
const registration = getMemoryCapabilityRegistration();
assert.equal(registration?.pluginId, expectedOwner);
const penfieldSelected = expectedOwner === penfield;
const expectedTools = penfieldSelected
  ? ["penfield_recall", "penfield_fetch"]
  : ["memory_search", "memory_get"];
assert.deepEqual(Array.from(registration.capability.recallToolNames), expectedTools);
if (penfieldSelected) {
  assert.equal(plugin.status, "loaded");
  assert.equal(plugin.memorySlotSelected, true);
  const contribution = registry.memoryCapabilities.find((row) => row.pluginId === penfield);
  assert.equal(typeof contribution.capability.providerFlushPlanResolver, "function");
  const flushModule = (await readdir(join(dirname(cli), "dist"))).filter((name) =>
    /^memory-flush-plan-.*\.mjs$/.test(name)
  );
  assert.equal(flushModule.length, 1);
  const { r: resolveRunPlan } = await fromHost(flushModule[0]);
  const actual = resolveRunPlan({ cfg: config, contextWindowTokens: 64000 });
  if (config.plugins.entries[penfield].config?.compactionFlush) {
    assert.equal(actual.pluginId, penfield);
    assert.equal(actual.selectedSlotOwner, true);
    assert.deepEqual(actual.plan.persistenceToolNames, ["penfield_store"]);
    assert.deepEqual(actual.plan.lookupToolNames, ["penfield_recall"]);
    assert.equal(actual.plan.relativePath, undefined);
    assert.ok(actual.plan.softThresholdTokens > 0);
    assert.match(actual.plan.prompt, /penfield_store/);
    assert.ok(actual.plan.systemPrompt);
    assert.equal(
      resolveRunPlan({
        cfg: { agents: { defaults: { compaction: { memoryFlush: { enabled: false } } } } },
      }),
      null
    );
  } else {
    assert.equal(actual, null);
  }
  const coreDisabled = config.plugins.entries[core]?.enabled === false;
  assert.equal(plugin.toolNames.length, 17);
  if (coreDisabled) {
    assert.equal(builtin.status, "disabled");
    assert.deepEqual(builtin.services, []);
    assert.deepEqual(builtin.toolNames, []);
    assert.ok(!registry.typedHooks.some((h) => h.pluginId === core));
    assert.ok(!registry.memoryCapabilities.some((row) => row.pluginId === core));
  } else {
    assert.equal(builtin.status, "loaded");
    assert.notEqual(builtin.memorySlotSelected, true);
    assert.match(builtin.activationReason, /dreaming sidecar/);
    assert.ok(builtin.services.includes("memory-core-dreaming"));
    assert.ok(builtin.services.includes("memory-core-standing-intents"));
    assert.ok(!builtin.services.includes("memory-core-index"));
  }
  // Compare the effective prompt and flush source, including sidecar contributions.
  const prompt = buildActiveMemoryPromptSection({
    availableTools: new Set([...plugin.toolNames, ...builtin.toolNames, "read", "write"]),
    agentId: "main",
    agentSessionKey: "agent:main:main",
    projectKey: "codex-test",
  });
  if (coreDisabled) {
    assert.deepEqual(prompt, []);
    assert.equal(registration.capability.promptBuilder, undefined);
    assert.equal(registration.capability.flushPlanResolver, undefined);
    const { createReadTool } = await fromHost("plugin-sdk/agent-sessions.js");
    const { createWorkspaceBootstrapFilePolicy } = await fromHost(
      "plugin-sdk/agent-workspace-runtime.js"
    );
    const workspace = config.agents.defaults.workspace;
    const policy = createWorkspaceBootstrapFilePolicy({ config, workspaceDir: workspace });
    const read = createReadTool(workspace);
    for (const [path, marker] of [
      ["MEMORY.md", "codex-test isolated workspace memory"],
      ["memory/2026-01-01.md", "codex-test daily history"],
      ["history/openclaw-memory.md", "codex-test archived history"],
    ]) {
      assert.equal(policy.canRead(path), path === "MEMORY.md");
      const result = await read.execute("codex-test", { path });
      assert.ok(result.content.some((item) => item.type === "text" && item.text.includes(marker)));
    }
  } else {
    assert.ok(prompt.length > 0);
    const plan = registration.capability.flushPlanResolver({
      cfg: config,
      nowMs: Date.UTC(2026, 0, 1, 12),
    });
    assert.match(plan.relativePath, /^memory\/\d{4}-\d{2}-\d{2}\.md$/);
    assert.ok(plan.prompt.includes(plan.relativePath));
  }
} else {
  assert.equal(plugin.status, "disabled");
  assert.equal(plugin.toolNames.length, 0);
  assert.ok(!registry.typedHooks.some((h) => h.pluginId === penfield));
  assert.ok(!registry.cliRegistrars.some((entry) => entry.pluginId === penfield));
  assert.ok(!registry.memoryCapabilities.some((row) => row.pluginId === penfield));
  assert.ok(builtin.memorySlotSelected);
  assert.ok(builtin.services.includes("memory-core-index"));
}

const hook = registry.typedHooks.find(
  (h) => h.pluginId === "active-memory" && h.hookName === "before_prompt_build"
);
assert.ok(hook);
const seen = [];
await hook.handler(
  { prompt: "", currentUserMessage: "", messages: [] },
  {
    agentId: "main",
    sessionKey: "agent:main:main",
    toolAuthority: {
      assertActive() {},
      allows(name) {
        seen.push(name);
        return false;
      },
    },
  }
);
assert.deepEqual(seen, expectedTools);
