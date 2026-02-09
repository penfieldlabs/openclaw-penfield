import { Type } from "../types/typebox.js";
import type { PenfieldApiClient } from "../api-client.js";

export const ListContextsToolSchema = Type.Object({
  limit: Type.Optional(
    Type.Number({
      description: "Max results to return (default: 20, max: 100)",
      minimum: 1,
      maximum: 100,
      default: 20,
    })
  ),
  offset: Type.Optional(
    Type.Number({
      description: "Number of results to skip for pagination (default: 0)",
      minimum: 0,
      default: 0,
    })
  ),
  name_pattern: Type.Optional(
    Type.String({
      description:
        "Filter contexts by name (case-insensitive substring match)",
    })
  ),
  include_descriptions: Type.Optional(
    Type.Boolean({
      description:
        "Include full descriptions in output (default: false for compact listing)",
    })
  ),
}, { additionalProperties: false });

interface CheckpointMemory {
  id: string;
  content: string;
  created_at: string;
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

interface ContextEntry {
  id: string;
  name: string;
  memory_count: number;
  created: string;
  description?: string;
}

export async function executeListContextsTool(
  apiClient: PenfieldApiClient,
  params: any // eslint-disable-line @typescript-eslint/no-explicit-any -- validated by TypeBox schema
): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any -- validated return format
  const limit = (params.limit as number) || 20;
  const offset = (params.offset as number) || 0;
  const namePattern = params.name_pattern as string | undefined;
  const lowerPattern = namePattern?.toLowerCase();
  const includeDescriptions = params.include_descriptions as boolean | undefined;

  // Without name_pattern: use API-side pagination directly (no cap)
  // With name_pattern: fetch in bulk for client-side filtering
  const queryParams: Record<string, string> = { memory_type: "checkpoint" };

  if (!namePattern) {
    // Translate offset/limit to page/per_page
    const page = Math.floor(offset / limit) + 1;
    queryParams.per_page = String(limit);
    queryParams.page = String(page);
  } else {
    // Fetch enough to cover filtering + pagination headroom
    queryParams.per_page = String(Math.min(limit + offset + 50, 250));
  }

  const response = await apiClient.get<MemoriesResponse>(
    "/api/v2/memories",
    queryParams,
  );

  const items = response.items ?? [];
  const contexts: ContextEntry[] = [];

  for (const mem of items) {
    // Extract checkpoint name from metadata (preferred) or content JSON (legacy)
    let name: string | undefined = mem.metadata?.checkpoint_name;
    let memoryCount: number = mem.metadata?.memory_count ?? 0;
    let description: string | undefined;

    if (!name) {
      try {
        const parsed = JSON.parse(mem.content);
        name = parsed.checkpoint_name;
        memoryCount = parsed.memory_count ?? memoryCount;
        description = parsed.description;
      } catch {
        // Legacy format without JSON — use content as-is
        name = undefined;
      }
    } else if (includeDescriptions) {
      try {
        const parsed = JSON.parse(mem.content);
        description = parsed.description;
      } catch {
        // Content not JSON — no description available
      }
    }

    // Apply name_pattern filter (case-insensitive substring)
    if (lowerPattern) {
      const haystack = (name ?? "").toLowerCase();
      if (!haystack.includes(lowerPattern)) {
        continue;
      }
    }

    const entry: ContextEntry = {
      id: mem.id,
      name: name ?? "(unnamed)",
      memory_count: memoryCount,
      created: mem.created_at,
    };

    if (includeDescriptions && description) {
      entry.description = description;
    }

    contexts.push(entry);
  }

  // Pagination: API-side when no filter, client-side when filtering
  const apiTotal = response.pagination?.total ?? 0;
  let paged: ContextEntry[];
  let total: number;

  if (!namePattern) {
    // API already paginated — trim misaligned leading items
    const skip = offset % limit;
    paged = skip > 0 ? contexts.slice(skip) : contexts;
    total = apiTotal;
  } else {
    // Client-side pagination on filtered results
    total = contexts.length;
    paged = contexts.slice(offset, offset + limit);
  }

  const result = {
    success: true,
    contexts: paged,
    total,
    limit,
    offset,
    has_more: total > offset + paged.length,
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
