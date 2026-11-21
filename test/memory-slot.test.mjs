import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { normalizePluginConfig } from "../node_modules/openclaw/dist/extensions/active-memory/config.js";

import { resolveMemoryDreamingConfig } from "openclaw/plugin-sdk/memory-core-host-status";
import { resolveMemoryDreamingPluginConfig } from "openclaw/plugin-sdk/memory-core-host-runtime-core";

test("the host keeps its default dreaming policy with a normal Penfield configuration", () => {
  const cfg = {
    plugins: {
      slots: { memory: "openclaw-penfield" },
      entries: {
        "openclaw-penfield": { enabled: true, config: { autoAwaken: false, autoOrient: false } },
      },
    },
  };
  const dreaming = resolveMemoryDreamingConfig({
    cfg,
    pluginConfig: resolveMemoryDreamingPluginConfig(cfg),
  });
  assert.equal(dreaming.enabled, true);
});

const names = ["penfield_recall", "penfield_fetch"];
const resolveTools = (owner, toolsAllow, recallTools) =>
  normalizePluginConfig({ toolsAllow }, { plugins: { slots: { memory: owner } } }, recallTools)
    .toolsAllow;

test("Active Memory uses an explicit usable allowlist before the selected provider", () => {
  assert.deepEqual(
    resolveTools(
      "openclaw-penfield",
      [" PENFIELD_FETCH ", "penfield_fetch", "group:memory"],
      names
    ),
    ["penfield_fetch"]
  );
});
test("Active Memory falls back to selected recall tools for an empty or unusable override", () => {
  for (const override of [undefined, [], ["group:memory"]])
    assert.deepEqual(resolveTools("openclaw-penfield", override, names), names);
});
test("Active Memory uses the legacy LanceDB fallback then the built-in tools when no owner contributes names", () => {
  assert.deepEqual(resolveTools("memory-lancedb", [], names), names);
  assert.deepEqual(resolveTools("memory-lancedb", undefined, []), ["memory_recall"]);
  for (const owner of ["memory-core", "openclaw-penfield", "none", undefined])
    assert.deepEqual(resolveTools(owner, undefined, []), ["memory_search", "memory_get"]);
});
test("the optional peer and both gateway compatibility declarations agree on a minimum", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
  const minimum = pkg.openclaw.compat.minGatewayVersion;
  assert.match(minimum, /^\d{4}\.\d+\.\d+$/);
  assert.equal(pkg.peerDependencies.openclaw, ">=" + minimum);
  assert.equal(pkg.openclaw.compat.pluginApi, ">=" + minimum);
  assert.equal(pkg.peerDependenciesMeta.openclaw.optional, true);
});
