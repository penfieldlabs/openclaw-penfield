import { Type } from "../types/typebox.js";
import type { PenfieldApiClient } from "../api-client.js";
import { isUuid } from "../validation.js";

export const SaveContextToolSchema = Type.Object({
  name: Type.String({
    description: "Name for this context checkpoint",
    minLength: 1,
    maxLength: 200,
  }),
  description: Type.Optional(
    Type.String({
      description:
        "Detailed cognitive handoff description with memory references. " +
        "Include what was investigated, key discoveries, current hypotheses, " +
        "open questions, and suggested next steps. " +
        "Reference memories with 'memory_id: <uuid>' for reliable linking.",
      maxLength: 10000,
    })
  ),
  memory_ids: Type.Optional(
    Type.Array(Type.String(), {
      description: "Explicit array of memory IDs to include in the checkpoint (UUID format)",
    })
  ),
}, { additionalProperties: false });

// Matches memory_id: <uuid> patterns in description text (same as MCP server)
const MEMORY_ID_PATTERN = /memory_id:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

interface HybridSearchMemory {
  id: string;
  content?: string;
}

interface HybridSearchResult {
  memories?: HybridSearchMemory[];
  results?: HybridSearchMemory[];
}

interface StoredMemory {
  id: string;
  memory_type: string;
  metadata?: Record<string, unknown>;
}

export async function executeSaveContextTool(
  apiClient: PenfieldApiClient,
  params: unknown
): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any -- validated return format
  const { name, description, memory_ids: explicitIds } = params as {
    name: string;
    description?: string;
    memory_ids?: string[];
  };

  // Three sources of memory IDs (mirroring MCP server behavior):
  //   1. Explicit memory_ids parameter (plugin extension, not in MCP)
  //   2. memory_id: <uuid> patterns extracted from description text
  //   3. Hybrid search results using description as query

  const allIds = new Set<string>();

  // Source 1: Explicit memory_ids parameter
  if (explicitIds) {
    for (const id of explicitIds) {
      if (isUuid(id)) allIds.add(id);
    }
  }

  // Source 2: Extract memory_id: <uuid> references from description
  // These go into referenced_memories (matches MCP server format)
  const referencedMemories: string[] = [];

  if (description) {
    for (const match of description.matchAll(MEMORY_ID_PATTERN)) {
      const uuid = match[1];
      referencedMemories.push(uuid);
      allIds.add(uuid);
    }
  }

  // Source 3: Hybrid search with description as query
  // Truncate to 4,000 chars to stay within API query limit
  if (description) {
    try {
      const searchQuery = description.length > 4000
        ? description.slice(0, 4000)
        : description;
      const searchResponse = await apiClient.post<HybridSearchResult>(
        "/api/v2/search/hybrid",
        { query: searchQuery, limit: 20 },
      );

      const memories = searchResponse.memories ?? searchResponse.results ?? [];
      for (const mem of memories) {
        if (mem.id && isUuid(mem.id)) {
          allIds.add(mem.id);
        }
      }
    } catch {
      // Search failed — continue with whatever IDs we already have
    }
  }

  const memoryIds = [...allIds];

  // Build checkpoint content as JSON (matches MCP server format exactly)
  const checkpointContent = JSON.stringify({
    checkpoint_name: name,
    description: description ?? null,
    memory_count: memoryIds.length,
    memory_ids: memoryIds,
    referenced_memories: referencedMemories,
  });

  // Store as a checkpoint memory via POST /api/v2/memories
  const response = await apiClient.post<StoredMemory>("/api/v2/memories", {
    content: checkpointContent,
    memory_type: "checkpoint",
    importance: 0.9,
    tags: ["context", "checkpoint", name],
    metadata: {
      checkpoint_name: name,
      memory_count: memoryIds.length,
    },
  });

  const result = {
    success: true,
    context_id: response.id,
    name,
    memories_included: memoryIds.length,
  };

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
    details: result,
  };
}
