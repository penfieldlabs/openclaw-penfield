import assert from "node:assert/strict";
import { test } from "node:test";
import { PenfieldApiClient } from "../dist/src/api-client.js";
import { registerPenfieldTools } from "../dist/src/tools/index.js";

const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
const memory = { id: first, content: "sample", memory_type: "fact", score: 1 };
const graph = { from_memory_id: first, to_memory_id: second };
const path = "/samples/notes.txt";
function setup(t, replies, scopes = ["read"]) {
  const queue = [...replies],
    requests = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const request = {
      url: new URL(url),
      method: init.method,
      body: init.body ? JSON.parse(init.body) : undefined,
    };
    requests.push(request);
    assert.ok(queue.length, "unexpected HTTP request");
    const next = queue.shift();
    return next instanceof Response ? next : Response.json({ status: "success", data: next });
  });
  const tools = {};
  const client = new PenfieldApiClient(
    { getAccessToken: async () => "unit", getScopes: () => scopes, discardRejectedKeyToken() {} },
    "https://api.example"
  );
  registerPenfieldTools(
    {
      registerTool: (tool) => {
        tools[tool.name] = tool;
      },
    },
    client
  );
  return {
    tools,
    requests,
    call: (name, params) => tools["penfield_" + name].execute("test", params),
  };
}
const routes = [
  ["store", { content: "sample" }, "POST", "/memories", memory],
  ["recall", { query: "sample" }, "POST", "/search/hybrid", { items: [memory] }],
  ["search", { query: "sample" }, "POST", "/search/hybrid", { items: [memory] }],
  ["fetch", { memory_id: first }, "GET", "/memories/" + first, memory],
  ["update_memory", { memory_id: first, content: "edited" }, "PUT", "/memories/" + first, memory],
  [
    "connect",
    { ...graph, relationship_type: "supports" },
    "POST",
    "/relationships",
    { id: second },
  ],
  ["disconnect", graph, "DELETE", "/relationships/between", {}],
  ["explore", { start_memory_id: first }, "POST", "/relationships/traverse", { paths: [] }],
  ["save_context", { name: "example" }, "POST", "/memories", { id: first }],
  [
    "restore_context",
    { name: first },
    "GET",
    "/memories/" + first,
    { id: first, memory_type: "checkpoint", content: '{"memory_ids":[]}' },
  ],
  ["list_contexts", {}, "GET", "/memories", { items: [], pagination: { total: 0 } }],
  ["reflect", { time_window: "recent" }, "POST", "/analysis/reflect", { memories: [] }],
  ["save_artifact", { path, content: "sample" }, "POST", "/artifacts", { path }],
  ["retrieve_artifact", { path }, "GET", "/artifacts", { path, content: "sample" }],
  ["list_artifacts", { prefix: "/samples/" }, "GET", "/artifacts/list", { files: [] }],
  ["delete_artifact", { path }, "DELETE", "/artifacts", {}],
  ["awaken", {}, "GET", "/personality/awakening", { briefing: "hello" }],
];
for (const [name, input, method, route, data] of routes) {
  test(name + " uses its REST contract", async (t) => {
    const { call, requests } = setup(t, name === "save_context" ? [{ items: [] }, data] : [data]);
    const result = await call(name, input);
    assert.equal(result.details?.error, undefined);
    assert.equal(requests.length, name === "save_context" ? 2 : 1);
    assert.equal(requests.at(-1).method, method);
    assert.equal(requests.at(-1).url.pathname, "/api/v2" + route);
    assert.equal(typeof result.content[0].text, "string");
  });
}
for (const window of ["1d", "7d", "30d", "90d"]) {
  test("reflect converts " + window + " to a UTC start date", async (t) => {
    const { call, requests } = setup(t, [{}]);
    await call("reflect", { time_window: window });
    const start = new Date(Date.now() - parseInt(window) * 86400000).toISOString().slice(0, 10);
    assert.equal(requests[0].body.start_date, start);
  });
}
test("save context includes matched search items", async (t) => {
  const { call, requests } = setup(t, [{ items: [] }, { items: [memory] }, { id: second }]);
  await call("save_context", { name: "checkpoint", description: "sample" });
  assert.deepEqual(JSON.parse(requests.at(-1).body.content).memory_ids, [first]);
});
test("list contexts returns a full misaligned page", async (t) => {
  const rows = ["a", "b", "c", "d"].map((name) => ({
    id: name,
    content: "{}",
    metadata: { checkpoint_name: name },
  }));
  const { call } = setup(t, [
    { items: rows.slice(0, 2), pagination: { total: 4, has_next: true } },
    { items: rows.slice(2), pagination: { total: 4, has_next: false } },
  ]);
  const result = await call("list_contexts", { offset: 1, limit: 2 });
  assert.deepEqual(
    result.details.contexts.map((x) => x.name),
    ["b", "c"]
  );
});
test("restore by name scans later pages", async (t) => {
  const { call } = setup(t, [
    { items: [], pagination: { has_next: true } },
    {
      items: [{ id: first, content: "{}", metadata: { checkpoint_name: "late" } }],
      pagination: { has_next: false },
    },
  ]);
  assert.equal((await call("restore_context", { name: "late" })).details.context_id, first);
});
test("restore reports a scope denial instead of a missing checkpoint", async (t) => {
  const { call } = setup(t, [
    Response.json(
      { error: { code: "AUTH_INSUFFICIENT_PERMISSIONS", message: "Requires read" } },
      { status: 403 }
    ),
  ]);
  const r = await call("restore_context", { name: "missing" });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /403/);
});
test("compact search bounds both text fields and details", async (t) => {
  const { call } = setup(t, [
    { items: [{ ...memory, content: "a".repeat(4000), content_with_context: "b".repeat(5000) }] },
  ]);
  const r = await call("recall", { query: "a", max_content_length: 80 });
  assert.ok(JSON.stringify(r).length < 1500);
});
for (const [name, opts] of [
  ["store", { content: "x".repeat(10001) }],
  ["update_memory", { memory_id: first, tags: Array.from({ length: 11 }, (_, i) => "tag-" + i) }],
  ["retrieve_artifact", { path: "relative" }],
]) {
  test(name + " rejects invalid input without sending it", async (t) => {
    const { call, requests } = setup(t, []);
    assert.equal((await call(name, opts)).isError, true);
    assert.equal(requests.length, 0);
  });
}

test("explore applies minimum strength to every edge, then limits the returned paths", async (t) => {
  const paths = [
    { nodes: [first, second], relationships: ["weak"] },
    { nodes: [first, second], relationships: ["strong"] },
    { nodes: [first, second], relationships: ["strong"] },
  ];
  const { call, requests } = setup(t, [
    { paths, relationship_details: { weak: { strength: 0.2 }, strong: { strength: 0.9 } } },
  ]);
  const result = await call("explore", { start_memory_id: first, min_strength: 0.8, max_paths: 1 });
  assert.equal(result.details.paths_found, 2);
  assert.equal(result.details.paths.length, 1);
  assert.equal(result.details.paths[0].relationships[0].id, "strong");
  assert.equal(requests[0].body.min_strength, undefined);
});
test("restore provides bounded previews and ids for full fetch", async (t) => {
  const { call } = setup(t, [
    { id: first, memory_type: "checkpoint", content: JSON.stringify({ memory_ids: [second] }) },
    { id: second, content: "x".repeat(10000) },
  ]);
  const result = await call("restore_context", { name: first, max_content_length: 150 });
  assert.equal(result.details.memories[0].id, second);
  assert.ok(result.details.memories[0].content.length < 220);
});
test("a cancelled tool never sends a request", async (t) => {
  const { tools, requests } = setup(t, []);
  const abort = new AbortController();
  abort.abort();
  const result = await tools.penfield_fetch.execute("test", { memory_id: first }, abort.signal);
  assert.equal(result.isError, true);
  assert.equal(requests.length, 0);
});
test("artifact limit is enforced across folders and files", async (t) => {
  const { call, requests } = setup(t, [
    { folders: ["one"], files: [{ name: "two" }, { name: "three" }] },
  ]);
  const result = await call("list_artifacts", { prefix: "/", limit: 2 });
  assert.equal(result.details.files.length, 1);
  assert.equal(requests[0].url.searchParams.has("limit"), false);
});

test("artifact MIME is detected by the server; unsupported overrides fail locally", async (t) => {
  const { call, requests } = setup(t, []);
  const result = await call("save_artifact", {
    path: "/file.txt",
    content: "hello",
    content_type: "application/octet-stream",
  });
  assert.equal(result.isError, true);
  assert.equal(requests.length, 0);
});
for (const path of [
  "/.hidden",
  "/a//b",
  "/dir/",
  "/bad name",
  "/" + Array(12).fill("a").join("/"),
]) {
  test("invalid artifact path " + path + " fails before HTTP", async (t) => {
    const { call, requests } = setup(t, []);
    assert.equal((await call("save_artifact", { path, content: "sample" })).isError, true);
    assert.equal(requests.length, 0);
  });
}
test("a write-only login can save a checkpoint and gets both warnings", async (t) => {
  const denied = () =>
    Response.json(
      { error: { code: "AUTH_INSUFFICIENT_PERMISSIONS", message: "read required" } },
      { status: 403 }
    );
  const { call, requests } = setup(t, [denied(), denied(), { id: second }], ["write"]);
  const result = await call("save_context", {
    name: "sample",
    description: "handoff",
    memory_ids: [first],
  });
  assert.equal(result.details.context_id, second);
  assert.match(result.details.warning, /name.*could not be checked.*cannot read/i);
  assert.match(result.details.warning, /explicit references only.*403/i);
  assert.deepEqual(
    requests.map((r) => r.method),
    ["GET", "POST", "POST"]
  );
  assert.deepEqual(JSON.parse(requests.at(-1).body.content).memory_ids, [first]);
});

test("save refuses an exact checkpoint name on a later page before enrichment", async (t) => {
  const { call, requests } = setup(t, [
    { items: [{ metadata: { checkpoint_name: "東京!" } }], pagination: { has_next: true } },
    {
      items: [{ content: JSON.stringify({ checkpoint_name: "東京" }) }],
      pagination: { has_next: true },
    },
  ]);
  const result = await call("save_context", { name: "東京", description: "handoff" });
  assert.equal(result.details.error, "Context name '東京' already exists. Use a unique name.");
  assert.deepEqual(
    requests.map((r) => [r.method, r.url.searchParams.get("page")]),
    [
      ["GET", "1"],
      ["GET", "2"],
    ]
  );
});
for (const [status, code] of [
  [500, "INTERNAL_ERROR"],
  [403, "ACCOUNT_DISABLED"],
  [401, "AUTH_INSUFFICIENT_PERMISSIONS"],
]) {
  test("checkpoint lookup refuses the save on HTTP " + status + " " + code, async (t) => {
    const { call, requests } = setup(t, [
      Response.json({ error: { code, message: "lookup failed" } }, { status }),
    ]);
    const r = await call("save_context", { name: "review", description: "search me" });
    assert.equal(r.isError, true);
    assert.match(r.details.error, new RegExp("HTTP " + status));
    assert.deepEqual(
      requests.map((r) => r.method),
      ["GET"]
    );
  });
}
test("a write-only login without enrichment receives the name warning alone", async (t) => {
  const { call, requests } = setup(
    t,
    [
      Response.json({ error: { code: "AUTH_INSUFFICIENT_PERMISSIONS" } }, { status: 403 }),
      { id: second },
    ],
    ["write"]
  );
  const r = await call("save_context", { name: "review" });
  assert.equal(r.details.context_id, second);
  assert.match(r.details.warning, /name.*could not be checked.*cannot read/i);
  assert.doesNotMatch(r.details.warning, /explicit references/);
  assert.deepEqual(
    requests.map((r) => r.method),
    ["GET", "POST"]
  );
});
test("memory length and tag boundaries use Unicode characters", async (t) => {
  const { call, requests } = setup(t, [{ id: first }]);
  const tags = Array.from({ length: 10 }, (_, i) => "tag" + i);
  assert.equal((await call("store", { content: "🦊".repeat(10000), tags })).details.id, first);
  assert.ok((await call("store", { content: "🦊".repeat(10001), tags })).isError);
  assert.equal(requests.length, 1);
});
test("reflect preserves an explicit start date when a numeric alias is present", async (t) => {
  const { call, requests } = setup(t, [{}]);
  await call("reflect", { time_window: "30d", start_date: "2026-01-01", end_date: "2026-01-15" });
  assert.equal(requests[0].body.start_date, "2026-01-01");
  assert.equal(requests[0].body.end_date, "2026-01-15");
  assert.equal(requests[0].body.time_window, undefined);
});
test("unsupported inactive-search flag cannot silently change result meaning", async (t) => {
  const { call, requests } = setup(t, []);
  assert.ok((await call("recall", { query: "term", include_inactive: true })).isError);
  assert.equal(requests.length, 0);
});
test("invalid search weights and malformed IDs produce local tool errors", async (t) => {
  const { call, requests } = setup(t, []);
  assert.ok((await call("recall", { query: "term", bm25_weight: 0.9 })).isError);
  assert.ok(
    (
      await call("connect", {
        from_memory_id: "bad",
        to_memory_id: first,
        relationship_type: "supports",
      })
    ).isError
  );
  assert.equal(requests.length, 0);
});
test("write receipts preserve the memory id without echoing the submitted content", async (t) => {
  const body = {
    ...memory,
    content: "x".repeat(10000),
    tags: ["example"],
    updated_at: "2026-11-20",
  };
  const { call } = setup(t, [body, body]);
  for (const [name, input] of [
    ["store", { content: body.content }],
    ["update_memory", { memory_id: first, content: body.content }],
  ]) {
    const result = await call(name, input);
    assert.equal(result.details.id, first);
    assert.ok(result.content[0].text.length < 500);
  }
});

test("an invalid explicit checkpoint reference stops the write before enrichment", async (t) => {
  const { call, requests } = setup(t, [{ items: [] }, { id: first }]);
  const result = await call("save_context", {
    name: "handoff",
    description: "review",
    memory_ids: [first, "mistyped"],
  });
  assert.equal(result.isError, true);
  assert.match(result.details.error, /memory_ids.*UUID/);
  assert.equal(requests.length, 0);
});
test("checkpoint references from prose and explicit IDs are deduplicated", async (t) => {
  const { call, requests } = setup(t, [{ items: [] }, { items: [{ id: first }] }, { id: second }]);
  await call("save_context", {
    name: "review",
    description: "memory_id: " + first,
    memory_ids: [first],
  });
  const record = JSON.parse(requests.at(-1).body.content);
  assert.deepEqual(record.memory_ids, [first]);
  assert.deepEqual(record.referenced_memories, [first]);
});
test("a legacy plain-text checkpoint restores its description when the metadata names it", async (t) => {
  const { call } = setup(t, [
    { items: [{ id: first, content: "old handoff", metadata: { checkpoint_name: "legacy" } }] },
  ]);
  const result = await call("restore_context", { name: "legacy" });
  assert.equal(result.details.description, "old handoff");
  assert.equal(result.details.memories_restored, 0);
});
test("a missing checkpoint UUID can resolve by name and only missing references are skipped", async (t) => {
  const gone = () => Response.json({ error: { message: "missing" } }, { status: 404 });
  const { call } = setup(t, [
    gone(),
    {
      items: [
        {
          id: second,
          metadata: { checkpoint_name: first },
          content: JSON.stringify({ memory_ids: [first] }),
        },
      ],
    },
    gone(),
  ]);
  const result = await call("restore_context", { name: first });
  assert.equal(result.details.context_id, second);
  assert.equal(result.details.memories_restored, 0);
});
test("the awakening checkpoint returns the briefing as tool text", async (t) => {
  const { call } = setup(t, [{ briefing: "review briefing" }]);
  const result = await call("restore_context", { name: "Awakening" });
  assert.equal(result.content[0].text, "review briefing");
});

test("a refused referenced memory fails restoration with the granted permissions", async (t) => {
  const { call } = setup(t, [
    { id: first, memory_type: "checkpoint", content: JSON.stringify({ memory_ids: [second] }) },
    Response.json(
      { error: { code: "AUTH_INSUFFICIENT_PERMISSIONS", message: "Requires read" } },
      { status: 403 }
    ),
  ]);
  const result = await call("restore_context", { name: first });
  assert.equal(result.isError, true);
  assert.match(result.details.error, /403.*Requires read.*allowed to read/i);
});

test("all tag writers reject an oversized tag before HTTP and identify its position", async (t) => {
  const { call, requests } = setup(t, []);
  const long = "a".repeat(51);
  for (const [tool, params, position] of [
    ["store", { content: "fact", tags: ["one", long] }, 2],
    ["update_memory", { memory_id: first, tags: [long] }, 1],
  ]) {
    const r = await call(tool, params);
    assert.equal(r.isError, true);
    assert.match(r.details.error, new RegExp("tag " + position + "\\b", "i"));
    assert.match(r.details.error, /50/);
  }
  assert.equal(requests.length, 0);
});
test("all tag writers check the minimum after cleaning before any HTTP request", async (t) => {
  const { call, requests } = setup(t, []);
  for (const bad of ["x", "c++", "東京", "😀".repeat(50), "---", " _ "]) {
    for (const [name, params, position] of [
      ["store", { content: "sample", tags: ["valid", bad] }, 2],
      ["update_memory", { memory_id: first, tags: [bad] }, 1],
    ]) {
      const result = await call(name, params);
      assert.equal(result.isError, true);
      assert.match(result.details.error, new RegExp("tag " + position + "\\b", "i"));
      assert.match(result.details.error, /2 to 50.*after cleaning/i);
    }
  }
  assert.equal(requests.length, 0);
});
test("tag writers send cleaned tags at both boundaries and preserve checkpoint display names", async (t) => {
  const { call, requests } = setup(
    t,
    Array.from({ length: 4 }, () => [memory, memory, { items: [] }, memory]).flat()
  );
  for (const [raw, cleaned] of [
    ["Go++", "go"],
    ["Best practices_V2", "best-practices-v2"],
    ["project:alpha", "projectalpha"],
    ["A".repeat(50) + "++", "a".repeat(50)],
  ]) {
    for (const [name, params] of [
      ["store", { content: "sample", tags: [raw] }],
      ["update_memory", { memory_id: first, tags: [raw] }],
      ["save_context", { name: raw }],
    ]) {
      const result = await call(name, params);
      assert.ok(!result.isError);
      const sent = requests.at(-1).body;
      assert.equal(sent.tags.at(-1), cleaned);
      if (name === "save_context") {
        assert.equal(sent.metadata.checkpoint_name, raw);
        assert.equal(JSON.parse(sent.content).checkpoint_name, raw);
      }
    }
  }
});
test("store and update deduplicate cleaned tags in first-seen order before counting ten", async (t) => {
  const { call, requests } = setup(t, Array(4).fill(memory));
  const distinct = ["ok", ...Array.from({ length: 9 }, (_, i) => "tag-" + i)];
  for (const [tool, params] of [
    ["store", { content: "test" }],
    ["update_memory", { memory_id: first }],
  ]) {
    for (const [tags, expected] of [
      [["OK", "ok", "o.k"], ["ok"]],
      [["OK", "ok", "o.k", ...distinct.slice(1)], distinct],
    ]) {
      assert.ok(!(await call(tool, { ...params, tags })).isError);
      assert.deepEqual(requests.at(-1).body.tags, expected);
    }
    const before = requests.length;
    assert.match(
      (await call(tool, { ...params, tags: [...distinct, "extra"] })).details.error,
      /10 distinct/
    );
    assert.equal(requests.length, before);
  }
});
for (const [name, tags] of [
  ["東京", ["context", "checkpoint"]],
  ["x".repeat(67), ["context", "checkpoint"]],
  ["Review notes", ["context", "checkpoint", "review-notes"]],
  ["Check.Point", ["context", "checkpoint"]],
  ["Context", ["context", "checkpoint"]],
]) {
  test("checkpoint saves and restores its original name: " + name, async (t) => {
    const page = { items: [] };
    const { call, requests } = setup(t, [page, { id: first }, page]);
    const saved = await call("save_context", { name });
    assert.equal(saved.details.context_id, first);
    const body = requests.at(-1).body;
    assert.equal(body.metadata.checkpoint_name, name);
    assert.equal(JSON.parse(body.content).checkpoint_name, name);
    assert.deepEqual(body.tags, tags);
    page.items.push({ id: first, ...body });
    assert.equal((await call("restore_context", { name })).details.context_id, first);
  });
}
test("checkpoint names sharing one cleaned tag restore independently", async (t) => {
  const names = ["OK", "ok", "o.k"];
  const ids = [first, second, "33333333-3333-4333-8333-333333333333"];
  const page = { items: [] };
  const { call, requests } = setup(t, [...ids.flatMap((id) => [page, { id }]), page, page, page]);
  for (const [i, name] of names.entries()) {
    const saved = await call("save_context", { name });
    assert.equal(saved.details.context_id, ids[i]);
    const body = requests.at(-1).body;
    assert.deepEqual(body.tags, ["context", "checkpoint", "ok"]);
    page.items.push({ id: ids[i], ...body });
  }
  for (const [i, name] of names.entries())
    assert.equal((await call("restore_context", { name })).details.context_id, ids[i]);
});
test("checkpoint names must be non-empty and fit the serialized memory", async (t) => {
  const { call, requests } = setup(t, []);
  assert.ok((await call("save_context", { name: "" })).isError);
  assert.match((await call("save_context", { name: "界".repeat(10000) })).details.error, /10,000/);
  assert.equal(requests.length, 0);
});
test("personality types are searchable and can only be managed in the portal", async (t) => {
  const { call, requests } = setup(t, Array(4).fill({ items: [] }));
  for (const type of ["identity_core", "personality_trait"]) {
    const count = requests.length;
    for (const [name, params] of [
      ["store", { content: "fact" }],
      ["update_memory", { memory_id: first }],
    ]) {
      assert.match((await call(name, { ...params, memory_type: type })).details.error, /portal/i);
    }
    assert.equal(requests.length, count);
    for (const name of ["recall", "search"]) {
      assert.ok(!(await call(name, { query: "fact", memory_types: [type] })).isError);
      assert.deepEqual(requests.at(-1).body.memory_types, [type]);
    }
  }
});
test("store accepts only documented sources and search tools enforce their measured subset", async (t) => {
  const filters = ["direct_input", "conversation", "api_import", "checkpoint", "document_upload"];
  const writeOnly = ["checkpoint_recall", "web_scrape", "reflection"];
  const { call, requests } = setup(t, [...Array(8).fill(memory), ...Array(2).fill({ items: [] })]);
  for (const source of [...filters, ...writeOnly]) {
    assert.ok(!(await call("store", { content: "fact", source_type: source })).isError);
    assert.equal(requests.at(-1).body.source_type, source);
  }
  for (const source of ["artifact_index", "made_up"]) {
    assert.match(
      (await call("store", { content: "fact", source_type: source })).details.error,
      /source_type.*direct_input/i
    );
  }
  for (const name of ["search", "recall"]) {
    for (const source of [...writeOnly, "artifact_index", "made_up"])
      assert.match(
        (await call(name, { query: "fact", source_types: ["conversation", source] })).details.error,
        /source_types.*direct_input/i
      );
    assert.ok(!(await call(name, { query: "fact", source_types: filters })).isError);
    assert.deepEqual(requests.at(-1).body.source_types, filters);
  }
  assert.equal(requests.length, 10);
});
