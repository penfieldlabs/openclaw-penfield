import { Type } from "../types/typebox.js";
import type { PenfieldApiClient } from "../api-client.js";
import { isUuid } from "../validation.js";

export const RestoreContextToolSchema = Type.Object({
  name: Type.String({
    description:
      'Name or ID of context to restore. Can be a context name (exact match), ' +
      'a context UUID, or "awakening" for personality briefing.',
    minLength: 1,
  }),
  limit: Type.Optional(
    Type.Integer({
      description: "Maximum number of memories to restore (default: 20)",
      minimum: 1,
      maximum: 100,
      default: 20,
    })
  ),
}, { additionalProperties: false });

interface CheckpointMemory {
  id: string;
  content: string;
  memory_type?: string;
  created_at?: string;
  metadata?: {
    checkpoint_name?: string;
    memory_count?: number;
  };
}

interface MemoriesResponse {
  items: CheckpointMemory[];
  pagination: {
    total: number;
    page: number;
    per_page: number;
    pages: number;
    has_next: boolean;
  };
}

interface RestoredMemory {
  id: string;
  content: string;
  memory_type?: string;
  created_at?: string;
}

export async function executeRestoreContextTool(
  apiClient: PenfieldApiClient,
  params: unknown
): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any -- validated return format
  const { name, limit = 20 } = params as { name: string; limit?: number };

  // Special case: "awakening" loads personality briefing
  if (name.toLowerCase() === "awakening") {
    return restoreAwakening(apiClient);
  }

  // Resolve the checkpoint: by UUID or by name
  let checkpoint: CheckpointMemory | null = null;

  if (isUuid(name)) {
    // Direct UUID lookup
    checkpoint = await resolveByUuid(apiClient, name);
  }

  if (!checkpoint) {
    // Name-based lookup: list checkpoints and match by metadata.checkpoint_name
    // or parsed content.checkpoint_name
    checkpoint = await resolveByName(apiClient, name);
  }

  if (!checkpoint) {
    const errorResult = {
      success: false,
      error: `No context found matching "${name}"`,
    };
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(errorResult, null, 2),
        },
      ],
      details: errorResult,
    };
  }

  // Parse checkpoint content to get referenced memory IDs
  let description: string | null = null;
  let memoryIds: string[] = [];

  try {
    const parsed = JSON.parse(checkpoint.content);
    description = parsed.description ?? null;
    memoryIds = parsed.memory_ids ?? [];
  } catch {
    // Content isn't JSON — use it as the description directly
    description = checkpoint.content;
  }

  // Fetch referenced memories concurrently (up to limit)
  const validIds = memoryIds.slice(0, limit).filter(isUuid);
  const settled = await Promise.allSettled(
    validIds.map((memId) =>
      apiClient.get<RestoredMemory>(`/api/v2/memories/${memId}`),
    ),
  );
  const memories: RestoredMemory[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") {
      const mem = result.value;
      memories.push({
        id: mem.id,
        content: mem.content,
        memory_type: mem.memory_type,
        created_at: mem.created_at,
      });
    }
    // Rejected = memory deleted or inaccessible — skip silently
  }

  const result = {
    success: true,
    context_id: checkpoint.id,
    description,
    memories,
    memories_restored: memories.length,
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

async function restoreAwakening(
  apiClient: PenfieldApiClient,
): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    const response = await apiClient.get<{ briefing: string }>(
      "/api/v2/personality/awakening",
    );

    const result = {
      success: true,
      context_id: "awakening",
      description: response.briefing || "",
      memories: [],
      memories_restored: 0,
    };

    return {
      content: [
        {
          type: "text",
          text: response.briefing || "",
        },
      ],
      details: result,
    };
  } catch {
    const errorResult = {
      success: false,
      error: "Failed to load awakening briefing",
    };
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(errorResult, null, 2),
        },
      ],
      details: errorResult,
    };
  }
}

async function resolveByUuid(
  apiClient: PenfieldApiClient,
  uuid: string,
): Promise<CheckpointMemory | null> {
  try {
    const mem = await apiClient.get<CheckpointMemory>(
      `/api/v2/memories/${uuid}`,
    );
    // Verify it's a checkpoint
    if (mem.memory_type !== "checkpoint") {
      return null;
    }
    return mem;
  } catch {
    return null;
  }
}

async function resolveByName(
  apiClient: PenfieldApiClient,
  name: string,
): Promise<CheckpointMemory | null> {
  try {
    const response = await apiClient.get<MemoriesResponse>(
      "/api/v2/memories",
      { memory_type: "checkpoint", per_page: "100" },
    );

    const items = response.items ?? [];

    // First pass: match by metadata.checkpoint_name (exact, case-sensitive)
    for (const mem of items) {
      if (mem.metadata?.checkpoint_name === name) {
        return mem;
      }
    }

    // Second pass: match by parsed content.checkpoint_name
    for (const mem of items) {
      try {
        const parsed = JSON.parse(mem.content);
        if (parsed.checkpoint_name === name) {
          return mem;
        }
      } catch {
        // Not JSON — skip
      }
    }

    return null;
  } catch {
    return null;
  }
}
