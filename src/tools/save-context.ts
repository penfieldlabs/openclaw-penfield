import { PenfieldError } from "../http.js";
import { checkpointFields, checkpointPages } from "./checkpoints.js";
import { toolResult } from "./result.js";
import type { Static } from "typebox";
import { Type } from "../types/typebox.js";
import type { PenfieldApiClient } from "../api-client.js";
import { cleanTag, cleanTags, isUuid, validateUuid } from "../validation.js";

export const SaveContextToolSchema = Type.Object(
  {
    name: Type.String({
      description: "Unique checkpoint name, preserved for display and lookup",
      minLength: 1,
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
  },
  { additionalProperties: false }
);

// Matches memory_id: <uuid> patterns in description text (same as MCP server)
const MEMORY_ID_PATTERN =
  /memory_id:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

interface HybridSearchMemory {
  id: string;
  content?: string;
}

interface HybridSearchResult {
  items?: HybridSearchMemory[];
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
  params: Static<typeof SaveContextToolSchema>
) {
  const { name, description, memory_ids: explicitIds } = params;

  const nameTag = cleanTag(name);

  // Three sources of memory IDs (mirroring MCP server behavior):
  //   1. Explicit memory_ids parameter (plugin extension, not in MCP)
  //   2. memory_id: <uuid> patterns extracted from description text
  //   3. Hybrid search results using description as query

  const allIds = new Set<string>();

  // Source 1: Explicit memory_ids parameter
  if (explicitIds) {
    for (const id of explicitIds) {
      validateUuid(id, "memory_ids");
      allIds.add(id);
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

  function serializeCheckpoint() {
    const content = JSON.stringify({
      checkpoint_name: name,
      description: description ?? null,
      memory_count: allIds.size,
      memory_ids: [...allIds],
      referenced_memories: referencedMemories,
    });
    if ([...content].length > 10000)
      throw new Error(
        "Checkpoint exceeds the 10,000 character memory limit. Shorten the name or description, or include fewer references."
      );
    return content;
  }
  const initialCount = allIds.size;
  const initialContent = serializeCheckpoint();
  const warnings: string[] = [];
  try {
    for await (const page of checkpointPages(apiClient)) {
      if (page.items.some((memory) => checkpointFields(memory).name === name))
        throw new Error(`Context name '${name}' already exists. Use a unique name.`);
    }
  } catch (err) {
    const cannotRead =
      err instanceof PenfieldError &&
      err.status === 403 &&
      err.code === "AUTH_INSUFFICIENT_PERMISSIONS";
    if (!cannotRead) throw err;
    warnings.push(
      "The checkpoint name could not be checked because this login cannot read checkpoints."
    );
  }

  // Source 3: Hybrid search with description as query
  // Truncate to 4,000 chars to stay within API query limit
  if (description) {
    try {
      const searchQuery = description.length > 4000 ? description.slice(0, 4000) : description;
      const searchResponse = await apiClient.post<HybridSearchResult>("/api/v2/search/hybrid", {
        query: searchQuery,
        limit: 20,
      });

      const memories =
        searchResponse.items ?? searchResponse.memories ?? searchResponse.results ?? [];
      for (const mem of memories) {
        if (mem.id && isUuid(mem.id)) {
          allIds.add(mem.id);
        }
      }
    } catch (err) {
      warnings.push(
        "Saved explicit references only. " +
          (err instanceof Error ? err.message : "Related memory search failed.")
      );
    }
  }

  // Store as a checkpoint memory via POST /api/v2/memories
  const response = await apiClient.post<StoredMemory>("/api/v2/memories", {
    content: allIds.size === initialCount ? initialContent : serializeCheckpoint(),
    memory_type: "checkpoint",
    importance: 0.9,
    tags: cleanTags(nameTag ? ["context", "checkpoint", nameTag] : ["context", "checkpoint"]),
    metadata: {
      checkpoint_name: name,
      memory_count: allIds.size,
    },
  });

  const result = {
    success: true,
    context_id: response.id,
    warning: warnings.length ? warnings.join(" ") : undefined,
    name,
    memories_included: allIds.size,
  };

  return toolResult(result);
}
