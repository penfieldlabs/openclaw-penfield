import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as wait } from "node:timers/promises";
import { createAuthService } from "../../dist/src/auth-service.js";
import { PenfieldApiClient } from "../../dist/src/api-client.js";
import { PenfieldError } from "../../dist/src/http.js";
import { registerPenfieldTools } from "../../dist/src/tools/index.js";

const environment = process.env.PENFIELD_TEST_ENV ?? "dev";
if (!["dev", "prod"].includes(environment)) throw new Error("Select dev or prod explicitly.");
const prod = environment === "prod";
const key = prod ? process.env.PENFIELD_PROD_API_KEY : process.env.PENFIELD_DEV_API_KEY;
const apiUrl = prod ? "https://api.penfield.app" : "https://api-dev.penfield.app";
const skip = !key
  ? "No key for this environment"
  : prod && process.env.PENFIELD_TEST_ALLOW_PROD !== "1"
    ? "Production requires explicit opt-in"
    : false;

test("Penfield " + environment + " live contracts", { skip }, async (t) => {
  const host = {
    id: "openclaw-penfield",
    resolvePath() {
      throw new Error("Live key tests may not use saved sign-in");
    },
  };
  const auth = createAuthService(host, { apiUrl, apiKey: key });
  const client = new PenfieldApiClient(auth, apiUrl);
  const tools = new Map();
  registerPenfieldTools({ registerTool: (tool) => tools.set(tool.name, tool) }, client);
  async function call(name, params = {}) {
    const result = await tools.get("penfield_" + name).execute("codex-test", params);
    if (result.isError) throw new Error(name + " failed: " + result.details.error);
    return result.details;
  }
  const sourceTypes = [
    "direct_input",
    "conversation",
    "api_import",
    "checkpoint",
    "document_upload",
  ];
  const marker = "codex-test-" + randomUUID();
  t.diagnostic("Owned run marker: " + marker);
  const flushContent = " \t\r\n" + marker + "  A\tB\r\nC\rD\nE\r\n\t ";
  const pairTag = "pair-" + randomUUID();
  const file = "/" + marker + ".txt";
  const memories = new Set();
  let fileStarted = false;
  let uncertainMemory = false;
  let first, second, context;

  async function findOwnedRecords() {
    const ids = [];
    for (let page = 1; ; page++) {
      const records = await client.get("/api/v2/memories", {
        tags: "codex-test",
        per_page: "100",
        page: String(page),
      });
      for (const record of records.items) {
        if (!record.tags?.includes("codex-test")) continue;
        if (record.memory_type === "checkpoint") {
          let checkpoint;
          try {
            checkpoint = JSON.parse(record.content);
          } catch {
            continue;
          }
          if (checkpoint?.checkpoint_name === "codex-test" && checkpoint.description === marker)
            ids.push(record.id);
        } else if (
          record.memory_type === "fact" &&
          (record.content === flushContent ||
            ["first", "second", "edited", "flush retry", ...sourceTypes].some(
              (label) => record.content === marker + " " + label
            ))
        ) {
          ids.push(record.id);
        }
      }
      if (!records.pagination?.has_next) return ids;
    }
  }

  async function createRecord(name, params, idField) {
    try {
      const record = await call(name, params);
      assert.equal(typeof record[idField], "string");
      memories.add(record[idField]);
      return record[idField];
    } catch (err) {
      uncertainMemory = true;
      throw err;
    }
  }

  async function absentMemory(id) {
    await assert.rejects(
      client.get("/api/v2/memories/" + id),
      (e) => e instanceof PenfieldError && e.status === 404
    );
  }
  t.after(async () => {
    const failures = [];
    if (uncertainMemory) {
      try {
        for (const id of await findOwnedRecords()) memories.add(id);
      } catch (err) {
        failures.push(err);
      }
    }
    if (fileStarted) {
      try {
        const record = await client.get("/api/v2/artifacts", { path: file }).catch((err) => {
          if (err.status === 404) return undefined;
          throw err;
        });
        if (record) {
          assert.ok(
            record.content === marker,
            "Refusing to delete an artifact with different content."
          );
          await client.delete("/api/v2/artifacts", { path: file });
        }
        await assert.rejects(
          client.get("/api/v2/artifacts", { path: file }),
          (e) => e.status === 404
        );
      } catch (e) {
        failures.push(e);
      }
    }
    for (const id of memories) {
      try {
        await client.delete("/api/v2/memories/" + id);
        await absentMemory(id);
      } catch (e) {
        failures.push(e);
      }
    }
    if (failures.length) throw new AggregateError(failures, "Owned fixture cleanup failed.");
    t.diagnostic(
      "Verified removal of " + memories.size + " owned memory records, including checkpoints."
    );
  });
  const verified = await client.get("/api/v2/auth/verify");
  assert.equal(verified.valid, true);
  assert.ok(
    ["read", "write", "delete"].every((s) => auth.getScopes().includes(s)),
    "All three grants are needed for a self-cleaning run."
  );
  assert.equal(
    (await findOwnedRecords()).length,
    0,
    "The run marker must be unused before any writes."
  );
  await t.test("store and fetch owned fixtures", async () => {
    for (const label of ["first", "second"]) {
      const id = await createRecord(
        "store",
        {
          content: marker + " " + label,
          tags: ["codex-test", pairTag],
          memory_type: "fact",
        },
        "id"
      );
      if (label === "first") first = id;
      else second = id;
      assert.equal((await call("fetch", { memory_id: id })).content, marker + " " + label);
    }
  });
  if (!first || !second) throw new Error("Fixture creation failed.");
  await t.test("source filters return a known record with the requested provenance", async (t) => {
    const ids = new Map();
    for (const source of sourceTypes) {
      const id = await createRecord(
        "store",
        {
          content: marker + " " + source,
          source_type: source,
          tags: ["codex-test", marker],
        },
        "id"
      );
      assert.equal((await client.get("/api/v2/memories/" + id)).source_type, source);
      ids.set(source, id);
    }
    for (const [source, id] of ids) {
      await t.test(source, async () => {
        for (const name of ["recall", "search"]) {
          const options = { query: marker + " " + source, tags: marker, limit: 20 };
          const deadline = Date.now() + 30000;
          let results;
          do {
            results = (await call(name, { ...options, source_types: [source] })).memories;
            if (results.some((row) => row.id === id)) break;
            await wait(1000);
          } while (Date.now() < deadline);
          assert.ok(
            results.some((row) => row.id === id),
            name + " did not return the owned " + source + " fixture"
          );
          for (const [other, otherId] of ids)
            if (other !== source)
              assert.ok(
                !results.some((row) => row.id === otherId),
                name + " returned another source"
              );
        }
      });
    }
  });
  await t.test(
    "a compaction retry recovers identical content and rejects a different memory",
    async (t) => {
      const dir = await mkdtemp(join(tmpdir(), "penfield-live-flush-"));
      t.after(() => rm(dir, { recursive: true, force: true }));
      let writer;
      registerPenfieldTools(
        {
          runtime: { state: { resolveStateDir: () => dir } },
          registerTool(tool, options) {
            if (options?.name === "penfield_store")
              writer = tool({ memoryFlush: { flushId: marker } });
          },
        },
        client,
        apiUrl
      );
      const params = { content: flushContent, tags: ["codex-test"] };
      uncertainMemory = true;
      const first = await writer.execute("codex-test", params);
      assert.ok(
        !first.isError && first.details.id,
        first.details.error ?? "Missing flush receipt."
      );
      memories.add(first.details.id);
      const record = await client.get("/api/v2/memories/" + first.details.id);
      assert.ok(record.tags.includes("codex-test") && record.content === params.content);
      const retry = await writer.execute("codex-test", params);
      assert.ok(!retry.isError, retry.details.error);
      assert.equal(retry.details.id, first.details.id);
      await t.test("fetched whitespace and mixed line endings survive exactly", async () => {
        assert.equal(record.content, flushContent);
        for (const content of [flushContent.trim(), flushContent.replaceAll("\r\n", "\n")]) {
          const changed = await writer.execute("codex-test", { ...params, content });
          assert.match(changed.details.error, /different content.*not saved/i);
        }
      });
      const conflict = await writer.execute("codex-test", {
        ...params,
        content: marker + " flush retry",
      });
      assert.equal(conflict.isError, true);
      assert.match(conflict.details.error, /different content.*not saved/i);
    }
  );
  await t.test("update memory", async () => {
    await call("update_memory", {
      memory_id: first,
      content: marker + " edited",
      tags: ["codex-test", pairTag],
    });
    assert.equal((await call("fetch", { memory_id: first })).content, marker + " edited");
  });
  await t.test("connect, traverse and disconnect owned memories", async () => {
    const pair = { from_memory_id: first, to_memory_id: second };
    await call("connect", {
      ...pair,
      relationship_type: "supports",
      strength: 0.35,
      evidence: { tag: "codex-test" },
    });
    const graph = await call("explore", { start_memory_id: first, max_depth: 1 });
    assert.ok(graph.paths_found >= 1);
    const threshold = await call("explore", {
      start_memory_id: first,
      max_depth: 1,
      min_strength: 0.9,
    });
    assert.equal(threshold.paths_found, 0, "minimum strength must exclude weaker paths");
    await call("disconnect", pair);
    assert.equal((await call("explore", { start_memory_id: first, max_depth: 1 })).paths_found, 0);
  });
  for (const name of ["recall", "search"]) {
    await t.test(name + " finds an owned memory by id", async () => {
      const deadline = Date.now() + 30000;
      do {
        const result = await call(name, {
          query: marker + " edited",
          limit: 2,
          tags: pairTag,
        });
        assert.ok(Array.isArray(result.memories));
        assert.equal(result.found, result.memories.length);
        assert.ok(result.found <= 2);
        if (result.memories.some((m) => m.id === first || m.id === second)) return;
        await wait(1000);
      } while (Date.now() < deadline);
      assert.fail("Search did not return an owned fixture before the indexing deadline.");
    });
  }
  await t.test("save, list and restore a tagged checkpoint", async (t) => {
    context = await createRecord(
      "save_context",
      {
        name: "codex-test",
        description: marker,
        memory_ids: [first],
      },
      "context_id"
    );
    const list = await call("list_contexts", { limit: 20, name_pattern: "codex-test" });
    assert.ok(list.contexts.some((c) => c.id === context));
    await t.test("refuse a duplicate checkpoint name", async () => {
      await assert.rejects(
        createRecord(
          "save_context",
          { name: "codex-test", description: marker, memory_ids: [first] },
          "context_id"
        ),
        /Context name 'codex-test' already exists/
      );
    });
    const restored = await call("restore_context", { name: context, limit: 5 });
    assert.ok(restored.memories.some((m) => m.id === first));
  });
  await t.test("the plugin and Penfield both reject spaces in artifact paths", async (t) => {
    const name = marker + " space.txt";
    const path = "/" + name;
    const params = { path, content: marker };
    const local = await tools.get("penfield_save_artifact").execute("codex-test", params);
    assert.equal(local.isError, true);
    assert.match(local.details.error, /visible file and folder names/);
    const list = async () =>
      (await client.get("/api/v2/artifacts/list", { prefix: "/", name_pattern: marker })).files;
    assert.equal((await list()).length, 0);
    t.after(async () => {
      // Reconcile by the unique run name even if the service changes its path cleaning.
      for (const file of await list()) {
        assert.ok(file.name.startsWith(marker));
        const ownedPath = "/" + file.name;
        assert.equal((await client.get("/api/v2/artifacts", { path: ownedPath })).content, marker);
        await client.delete("/api/v2/artifacts", { path: ownedPath });
      }
      assert.equal((await list()).length, 0);
    });
    await assert.rejects(
      client.post("/api/v2/artifacts", params),
      (err) =>
        err instanceof PenfieldError &&
        err.status === 400 &&
        err.code === "VAL_VALIDATION_FAILED" &&
        /path/i.test(err.message)
    );
  });
  await t.test("artifact lifecycle", async () => {
    await assert.rejects(client.get("/api/v2/artifacts", { path: file }), (e) => e.status === 404);
    fileStarted = true;
    await call("save_artifact", { path: file, content: marker });
    assert.equal((await call("retrieve_artifact", { path: file })).content, marker);
    const list = await call("list_artifacts", { prefix: "/", name_pattern: marker, limit: 5 });
    assert.ok(list.files.some((f) => f.name === file.slice(1)));
    await call("delete_artifact", { path: file });
    await assert.rejects(client.get("/api/v2/artifacts", { path: file }), (e) => e.status === 404);
  });
  await t.test("reflect aliases and awaken", async () => {
    for (const window of ["1d", "7d", "30d", "90d"]) {
      assert.equal((await call("reflect", { time_window: window })).time_window, window);
    }
    assert.equal(typeof (await call("awaken")).briefing, "string");
  });
  await t.test("validation response includes its field", async () => {
    await assert.rejects(
      client.post("/api/v2/search/hybrid", { query: "", limit: 0 }),
      (e) => e.status === 422 && /query|limit/.test(e.message)
    );
  });
});
