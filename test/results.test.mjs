import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compactRecallResponse,
  compactReflectResponse,
  compactExploreResponse,
} from "../dist/src/response-compact.js";

test("recall filters weak matches and preserves document citation fields", () => {
  const entries = [
    { id: "weak", content: "weak", score: 0.01 },
    {
      id: "doc",
      content: "text",
      content_with_context: "chapter",
      source_type: "document_upload",
      chunk_index: 1,
      total_chunks: 3,
      created_at: "2026-11-01",
      score: 0.9,
      metadata: { filename: "notes.txt", document_title: "Notes", document_id: "source" },
    },
    {
      id: "fact",
      content: "text",
      created_at: "2026-11-02",
      score: 0.3,
      metadata: { memory_type: "fact" },
    },
  ];
  const recent = compactRecallResponse({ items: entries }, "search", { sort: "created_desc" });
  assert.deepEqual(
    recent.memories.map((m) => m.id),
    ["fact", "doc"]
  );
  const oldest = compactRecallResponse({ items: entries }, "search", { sort: "created_asc" })
    .memories[0];
  assert.equal(oldest.source_type, "document");
  assert.equal(oldest.document_id, "source");
  assert.equal(oldest.filename, "notes.txt");
  assert.equal(oldest.document_title, "Notes");
  assert.equal(oldest.total_chunks, 3);
});
test("reflection bounds the number of topics, memory previews and preview length", () => {
  const data = {
    active_topics: Array(18).fill("topic"),
    memories: Array(12).fill({ memory_type: "fact", content: "y".repeat(2000) }),
    statistics: { total_memories_analyzed: 12 },
  };
  const compact = compactReflectResponse(data, "week");
  assert.equal(compact.memories_analyzed, 12);
  assert.equal(compact.active_topics.length, 10);
  assert.equal(compact.top_memories.length, 5);
  assert.equal(compact.top_memories[0].content.length, 800);
});
test("graph traversal preserves edges when details are unavailable and handles missing data", () => {
  const graph = compactExploreResponse(
    { paths: [{ nodes: ["one", "two"], relationships: ["edge"] }], max_depth_reached: 1 },
    "one"
  );
  assert.deepEqual(graph.paths[0].nodes, [{ id: "one" }, { id: "two" }]);
  assert.deepEqual(graph.paths[0].relationships, [{ id: "edge" }]);
  const empty = compactExploreResponse({}, "one");
  assert.equal(empty.paths_found, 0);
  assert.ok(empty.message);
});

test("graph traversal enriches both ends and preserves a zero-strength edge", () => {
  const data = {
    paths: [{ nodes: ["from", "to"], relationships: ["edge"] }],
    node_details: {
      from: { preview: "x".repeat(1000), type: "fact", tags: ["example"] },
      to: { type: "task" },
    },
    relationship_details: { edge: { type: "supports", strength: 0 } },
  };
  const result = compactExploreResponse(data, "from", 0);
  assert.equal(result.paths[0].depth, 1);
  assert.equal(result.paths[0].nodes[0].preview.length, 240);
  assert.equal(result.paths[0].nodes[1].type, "task");
  assert.deepEqual(result.paths[0].relationships, [{ id: "edge", type: "supports", strength: 0 }]);
});
test("missing write receipts warn against replay and update can use its known id", async () => {
  const { memoryWriteResult } = await import("../dist/src/tools/result.js");
  assert.throws(() => memoryWriteResult({}), /before retrying/);
  assert.equal(memoryWriteResult({}, "known").details.id, "known");
});
