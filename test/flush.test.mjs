import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import plugin from "../dist/index.js";
import { registerPenfieldTools } from "../dist/src/tools/index.js";
import { PenfieldError } from "../dist/src/http.js";

function capability(config) {
  let cap;
  plugin.register({
    logger: {},
    pluginConfig: config,
    on() {},
    registerCli() {},
    registerTool() {},
    registerMemoryCapability(value) {
      cap = value;
    },
  });
  return cap;
}
test("Penfield contributes a tools-only plan on explicit opt-in", () => {
  for (const cfg of [{}, { compactionFlush: false }])
    assert.equal(capability(cfg).providerFlushPlanResolver({}), null);
  const plan = capability({ compactionFlush: true }).providerFlushPlanResolver({});
  assert.deepEqual(plan.persistenceToolNames, ["penfield_store"]);
  assert.deepEqual(plan.lookupToolNames, ["penfield_recall"]);
  assert.equal(plan.relativePath, undefined);
  assert.match(plan.prompt, /one concise memory/);
});

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "penfield-flush-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const rows = [],
    writes = [];
  const client = {
    withSignal() {
      return this;
    },
    async get(endpoint, params) {
      if (endpoint !== "/api/v2/memories") {
        const row = rows.find((row) => endpoint === "/api/v2/memories/" + row.id);
        if (!row) throw new PenfieldError(404, "Memory not found");
        return row;
      }
      const { tags } = params;
      return { items: rows.filter((row) => row.tags.includes(tags)) };
    },
    async post(_endpoint, body) {
      writes.push(body);
      const row = { ...body, id: "fixture-" + writes.length };
      rows.push(row);
      return row;
    },
  };
  const writer = (id, origin = "https://api.example") => {
    let factory;
    registerPenfieldTools(
      {
        registerTool(tool, opts) {
          if (opts?.name === "penfield_store") factory = tool;
        },
        runtime: { state: { resolveStateDir: () => dir } },
      },
      client,
      origin
    );
    const tool = factory(id ? { memoryFlush: { flushId: id } } : {});
    return (content, tags = []) => tool.execute("call", { content, tags });
  };
  return { dir, rows, writes, writer, client };
}

test("a restarted flush with identical content gets the same receipt and a fresh cycle can write", async (t) => {
  const { dir, writer, writes } = await fixture(t);
  const first = await writer("cycle-one")("first", ["project"]);
  assert.equal((await writer("cycle-one")("first")).details.id, first.details.id);
  assert.equal(writes.length, 1);
  assert.match(writes[0].tags[1], /^openclaw-flush-[a-f0-9]{32}$/);
  const path = join(dir, "openclaw-penfield", "flush");
  assert.deepEqual(await readdir(path), ["attempts.sqlite"]);
  assert.equal((await stat(join(path, "attempts.sqlite"))).mode & 0o777, 0o600);
  assert.deepEqual(attempts(dir), []);
  assert.deepEqual(savedIds(dir), [first.details.id]);
  assert.equal((await stat(path)).mode & 0o777, 0o700);
  assert.ok((await writer("cycle-two")("next")).details.id);
  assert.ok((await writer("cycle-one", "https://other.example")("other")).details.id);
  assert.equal(writes.length, 3);
});

test("different content in the same flush cycle fails without another write or a success receipt", async (t) => {
  const { writer, writes } = await fixture(t);
  const first = await writer("same")("first fact");
  assert.ok(first.details.id);
  const second = await writer("same")("second fact");
  assert.equal(second.isError, true);
  assert.match(second.details.error, /different content.*not saved/i);
  assert.equal(second.details.id, undefined);
  assert.deepEqual(
    writes.map((w) => w.content),
    ["first fact"]
  );
  assert.equal((await writer("same")("first fact")).details.id, first.details.id);
});
test("a tagged result without content cannot confirm a flush retry", async (t) => {
  const { writer, rows, writes } = await fixture(t);
  await writer("same")("original");
  delete rows[0].content;
  const retry = await writer("same")("original");
  assert.equal(retry.isError, true);
  assert.match(retry.details.error, /verify.*content/i);
  assert.equal(writes.length, 1);
});

test("overlapping flushes and ambiguous writes never send a second POST", async (t) => {
  const { client, writer } = await fixture(t);
  const entered = Promise.withResolvers(),
    release = Promise.withResolvers();
  let posts = 0;
  client.post = async () => {
    posts++;
    entered.resolve();
    await release.promise;
    throw new TypeError("response lost");
  };
  const first = writer("same")("one");
  await entered.promise;
  assert.match((await writer("same")("two")).details.error, /already attempted/);
  release.resolve();
  assert.ok((await first).isError);
  assert.match((await writer("same")("three")).details.error, /already attempted/);
  assert.equal(posts, 1);
});

test("a definitive refusal permits retry and unmanaged stores keep all ten tags", async (t) => {
  const { client, writer, writes } = await fixture(t);
  const post = client.post;
  client.post = async () => {
    throw new PenfieldError(403, "permission denied");
  };
  assert.match((await writer("same")("one")).details.error, /permission/);
  client.post = post;
  const tags = Array.from({ length: 10 }, (_, i) => "tag-" + i);
  assert.match((await writer("same")("one", tags)).details.error, /9 user tags/);
  assert.ok((await writer("same")("one", tags.slice(1))).details.id);
  assert.ok((await writer()("one", tags)).details.id);
  assert.deepEqual(writes[1].tags, tags);
});

function attempts(dir) {
  const db = new DatabaseSync(join(dir, "openclaw-penfield", "flush", "attempts.sqlite"), {
    readOnly: true,
  });
  try {
    return db
      .prepare(
        "SELECT digest, reserved_at FROM reservations UNION ALL SELECT digest, NULL FROM uncertain ORDER BY digest"
      )
      .all()
      .map((row) => ({ ...row }));
  } finally {
    db.close();
  }
}
const digestFor = (id) =>
  createHash("sha256")
    .update(JSON.stringify(["https://api.example", id]))
    .digest("hex");

test("expired reservations retain only the uncertain digest until a receipt is recovered", async (t) => {
  const { dir, writer, client, rows, writes } = await fixture(t);
  const path = join(dir, "openclaw-penfield", "flush");
  await mkdir(path, { recursive: true, mode: 0o700 });
  const old = digestFor("lost");
  const originalPost = client.post;
  let hidden;
  client.post = async (...args) => {
    hidden = await originalPost(...args);
    rows.pop();
    throw new Error("lost response");
  };
  assert.ok((await writer("lost")("exact")).isError);
  assert.equal(attempts(dir)[0].digest, old);
  const db = new DatabaseSync(join(path, "attempts.sqlite"));
  const age = Date.now() - 8 * 86400000;
  try {
    db.prepare("UPDATE reservations SET reserved_at=? WHERE digest=?").run(age, old);
  } finally {
    db.close();
  }
  client.post = originalPost;
  assert.match((await writer("lost")("exact")).details.error, /already attempted/);
  assert.deepEqual(await readdir(path), ["attempts.sqlite"]);
  const entries = attempts(dir);
  assert.equal(entries.length, 1);
  assert.equal(entries.find((row) => row.digest === old).reserved_at, null);
  rows.push(hidden);
  assert.equal((await writer("lost")("exact")).details.id, hidden.id);
  assert.ok(!attempts(dir).some((row) => row.digest === old));
  assert.deepEqual(savedIds(dir), [hidden.id]);
  assert.equal(writes.length, 1);
});

test("a delayed empty lookup cannot send a second POST after another caller finishes", async (t) => {
  const { client, writer, writes } = await fixture(t);
  const entered = Promise.withResolvers(),
    release = Promise.withResolvers();
  const get = client.get;
  let first = true;
  client.get = async (...args) => {
    const snapshot = await get(...args);
    if (first) {
      first = false;
      entered.resolve();
      await release.promise;
    }
    return snapshot;
  };
  const slow = writer("race")("same");
  await entered.promise;
  const other = await writer("race")("same");
  release.resolve();
  const result = await slow;
  assert.equal(writes.length, 1);
  assert.ok(result.details.id || other.details.id);
});
test("a failed lookup before a POST leaves the cycle available for retry", async (t) => {
  const { client, writer, writes } = await fixture(t);
  const get = client.get;
  client.get = async () => {
    throw new Error("lookup failed");
  };
  assert.match((await writer("lookup")("sample")).details.error, /lookup failed/);
  client.get = get;
  assert.ok((await writer("lookup")("sample")).details.id);
  assert.equal(writes.length, 1);
});
test("flush retry compares every stored space and line ending", async (t) => {
  const { writer, writes } = await fixture(t);
  const content = " \t\r\n 東京  A\tB\r\nC\rD\nE\r\n\t ";
  const id = (await writer("space")(content)).details.id;
  assert.ok(id);
  assert.equal((await writer("space")(content)).details.id, id);
  for (const changed of [
    content.trimStart(),
    content.trimEnd(),
    content.replaceAll("\r\n", "\n"),
    content.replace("C\rD", "C\nD"),
    content.replace("  A", " A"),
  ]) {
    assert.match((await writer("space")(changed)).details.error, /different content/);
  }
  assert.equal(writes.length, 1);
});

test("an unconfirmed POST and a failed reconciliation lookup keep the reservation", async (t) => {
  const { client, writer, writes, rows, dir } = await fixture(t);
  const post = client.post;
  let hidden;
  client.post = async (...args) => {
    hidden = await post(...args);
    rows.pop();
    return {};
  };
  assert.match((await writer("receipt")("sample")).details.error, /without returning an ID/);
  const get = client.get;
  client.get = async () => {
    throw new Error("unavailable");
  };
  assert.match((await writer("receipt")("sample")).details.error, /unavailable/);
  client.get = get;
  assert.match((await writer("receipt")("sample")).details.error, /already attempted/);
  rows.push(hidden);
  assert.equal((await writer("receipt")("sample")).details.id, hidden.id);
  assert.deepEqual(attempts(dir), []);
  assert.deepEqual(savedIds(dir), [hidden.id]);
  assert.equal(writes.length, 1);
});

function savedIds(dir) {
  const db = new DatabaseSync(join(dir, "openclaw-penfield", "flush", "attempts.sqlite"), {
    readOnly: true,
  });
  try {
    return db
      .prepare("SELECT memory_id FROM saved ORDER BY memory_id")
      .all()
      .map((r) => r.memory_id);
  } finally {
    db.close();
  }
}
test("a stale tag lookup after a save cannot write again", async (t) => {
  const { writer, client, writes } = await fixture(t);
  const first = await writer("stale")("original");
  const get = client.get,
    lookups = [];
  client.get = async (path, params) => {
    lookups.push(path);
    return params?.tags ? { items: [] } : get(path, params);
  };
  assert.equal((await writer("stale")("original")).details.id, first.details.id);
  assert.match((await writer("stale")("changed")).details.error, /different content/);
  assert.deepEqual(lookups, Array(2).fill("/api/v2/memories/" + first.details.id));
  assert.equal(writes.length, 1);
});
test("a missing saved ID refuses retries without forgetting the receipt", async (t) => {
  const { writer, rows, writes, dir } = await fixture(t);
  const id = (await writer("missing")("original")).details.id;
  rows.pop();
  for (let i = 0; i < 2; i++)
    assert.match((await writer("missing")("original")).details.error, /not found.*no new memory/i);
  assert.deepEqual(savedIds(dir), [id]);
  assert.equal(writes.length, 1);
});
test("confirmed receipts expire after seven days independently of unresolved attempts", async (t) => {
  const { writer, dir, writes } = await fixture(t);
  const old = (await writer("old")("original")).details.id;
  const recent = (await writer("recent")("other")).details.id;
  const db = new DatabaseSync(join(dir, "openclaw-penfield", "flush", "attempts.sqlite"));
  try {
    db.prepare("UPDATE saved SET saved_at = ? WHERE memory_id = ?").run(
      Date.now() - 8 * 86400000,
      old
    );
  } finally {
    db.close();
  }
  await writer("recent")("other");
  assert.deepEqual(savedIds(dir), [recent]);
  assert.equal((await writer("old")("original")).details.id, old);
  assert.deepEqual(savedIds(dir), [old, recent]);
  assert.equal(writes.length, 2);
});
test("a failed journal confirmation preserves the remote receipt and reservation", async (t) => {
  const { writer, client, writes, dir } = await fixture(t);
  const post = client.post;
  client.post = async (...args) => {
    const receipt = await post(...args);
    const db = new DatabaseSync(join(dir, "openclaw-penfield", "flush", "attempts.sqlite"));
    try {
      db.exec(
        "CREATE TRIGGER break_confirm BEFORE INSERT ON saved BEGIN SELECT RAISE(ABORT,'write failed'); END"
      );
    } finally {
      db.close();
    }
    return receipt;
  };
  const r = await writer("disk")("original");
  assert.equal(r.details.id, "fixture-1");
  assert.deepEqual(savedIds(dir), []);
  assert.equal(attempts(dir)[0].digest, digestFor("disk"));
  assert.equal((await writer("disk")("original")).details.id, r.details.id);
  assert.equal(writes.length, 1);
});
