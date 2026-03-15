/**
 * Response compaction utilities.
 *
 * Mirrors the MCP server's field-stripping patterns so models receive only
 * the fields they need, saving context tokens and reducing noise.
 */

/** Minimum relevance score — results below this are dropped (matches MCP) */
export const RELEVANCE_THRESHOLD = 0.05;

/** Maximum memories returned in reflect compaction */
const MAX_REFLECT_MEMORIES = 5;

/** Maximum active topics returned in reflect compaction */
const MAX_REFLECT_TOPICS = 10;

// ---------------------------------------------------------------------------
// Recall / Search
// ---------------------------------------------------------------------------

interface RawSearchResult {
  id?: string;
  content?: string;
  score?: number;
  created_at?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  source_type?: string;
  content_with_context?: string;
  chunk_index?: number;
  total_chunks?: number;
}

interface CompactMemory {
  id: string | undefined;
  content: string | undefined;
  type: string;
  relevance: number;
  created: string | undefined;
  tags: string[];
  source_type?: string;
  filename?: string;
  document_title?: string;
  document_id?: string;
  content_with_context?: string;
  chunk_index?: number;
  total_chunks?: number;
}

export interface CompactRecallResponse {
  query: string;
  found: number;
  memories: CompactMemory[];
}

/**
 * Compact a hybrid search response to essential fields.
 *
 * Strips: score_breakdown, search_metadata, knowledge_cloud, analyzed_query,
 * raw metadata objects. Filters results below RELEVANCE_THRESHOLD.
 *
 * Optionally sorts by created date and truncates content.
 */
export function compactRecallResponse(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw API shape
  response: any,
  query: string,
  options?: { sort?: string; maxContentLength?: number }
): CompactRecallResponse {
  const items: RawSearchResult[] = response?.items ?? [];

  const memories: CompactMemory[] = [];
  for (const result of items) {
    const score = result.score ?? 0;
    if (score < RELEVANCE_THRESHOLD) continue;

    const metadata = result.metadata ?? {};
    const memoryType = (metadata.memory_type as string) ?? "unknown";
    const sourceType = (result.source_type as string) ?? (metadata.source_type as string);

    const entry: CompactMemory = {
      id: result.id,
      content: result.content,
      type: memoryType,
      relevance: score,
      created: result.created_at,
      tags: result.tags ?? [],
    };

    // Include document metadata when applicable
    if (sourceType === "document_upload") {
      entry.source_type = "document";
      if (metadata.filename) entry.filename = metadata.filename as string;
      if (metadata.document_title) entry.document_title = metadata.document_title as string;
      if (metadata.document_id) entry.document_id = metadata.document_id as string;
    }

    // Include chunk context when present
    if (result.content_with_context) {
      entry.content_with_context = result.content_with_context;
      entry.chunk_index = result.chunk_index;
      entry.total_chunks = result.total_chunks;
    }

    memories.push(entry);
  }

  // Client-side sort
  if (options?.sort === "created_desc") {
    memories.sort((a, b) => (b.created ?? "").localeCompare(a.created ?? ""));
  } else if (options?.sort === "created_asc") {
    memories.sort((a, b) => (a.created ?? "").localeCompare(b.created ?? ""));
  }
  // default "relevance" — already sorted by API

  // Content truncation
  if (options?.maxContentLength != null && options.maxContentLength > 0) {
    const max = options.maxContentLength;
    for (const m of memories) {
      if (m.content && m.content.length > max) {
        m.content = m.content.slice(0, max) + "... [truncated, use penfield_fetch for full content]";
      }
    }
  }

  return { query, found: memories.length, memories };
}

// ---------------------------------------------------------------------------
// Reflect
// ---------------------------------------------------------------------------

interface CompactReflectMemory {
  content: string | undefined;
  type: string;
  importance: number | undefined;
  score: number | undefined;
}

export interface CompactReflectResponse {
  time_window: string;
  memories_analyzed: number;
  active_topics: unknown[];
  top_memories: CompactReflectMemory[];
  patterns: unknown[];
  insights: unknown[];
}

/**
 * Compact a reflect response to essential fields.
 *
 * Strips full statistics object. Slices memories to top 5, topics to top 10.
 */
export function compactReflectResponse(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw API shape
  response: any,
  timeWindow: string
): CompactReflectResponse {
  const rawMemories: Record<string, unknown>[] = response?.memories ?? [];
  const topMemories = rawMemories.slice(0, MAX_REFLECT_MEMORIES).map((m) => ({
    content: m.content as string | undefined,
    type: (m.memory_type as string) ?? "unknown",
    importance: m.importance as number | undefined,
    score: m.score as number | undefined,
  }));

  const activeTopics = (response?.active_topics ?? []).slice(0, MAX_REFLECT_TOPICS);

  return {
    time_window: timeWindow,
    memories_analyzed: response?.statistics?.total_memories_analyzed ?? 0,
    active_topics: activeTopics,
    top_memories: topMemories,
    patterns: response?.emerging_patterns ?? [],
    insights: response?.relationship_insights ?? [],
  };
}

// ---------------------------------------------------------------------------
// Explore
// ---------------------------------------------------------------------------

interface CompactNode {
  id: string;
  preview?: string;
  type?: string;
  tags?: string[];
}

interface CompactRelationship {
  id: string;
  type?: string;
  strength?: number;
}

interface CompactPath {
  nodes: CompactNode[];
  relationships: CompactRelationship[];
  depth: number;
}

export interface CompactExploreResponse {
  start_memory: string;
  paths_found: number;
  max_depth_reached: number;
  paths: CompactPath[];
  message?: string;
}

/**
 * Compact a graph traversal response.
 *
 * Enriches nodes/relationships with selective fields from detail lookups.
 */
export function compactExploreResponse(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw API shape
  response: any,
  startMemoryId: string
): CompactExploreResponse {
  const nodeDetails: Record<string, Record<string, unknown>> = response?.node_details ?? {};
  const relDetails: Record<string, Record<string, unknown>> = response?.relationship_details ?? {};
  const rawPaths: { nodes?: string[]; relationships?: string[] }[] = response?.paths ?? [];

  const paths: CompactPath[] = rawPaths.map((path) => {
    const rawNodes = path.nodes ?? [];
    const rawRels = path.relationships ?? [];

    const nodes: CompactNode[] = rawNodes.map((nid: string) => {
      const detail = nodeDetails[nid];
      if (detail) {
        return {
          id: nid,
          preview: detail.preview as string | undefined,
          type: detail.type as string | undefined,
          tags: (detail.tags as string[]) ?? [],
        };
      }
      return { id: nid };
    });

    const relationships: CompactRelationship[] = rawRels.map((rid: string) => {
      const detail = relDetails[rid];
      if (detail) {
        return {
          id: rid,
          type: detail.type as string | undefined,
          strength: detail.strength as number | undefined,
        };
      }
      return { id: rid };
    });

    return { nodes, relationships, depth: rawNodes.length - 1 };
  });

  const result: CompactExploreResponse = {
    start_memory: startMemoryId,
    paths_found: paths.length,
    max_depth_reached: response?.max_depth_reached ?? 0,
    paths,
  };

  if (paths.length === 0) {
    result.message = "No connections found from this memory";
  }

  return result;
}
