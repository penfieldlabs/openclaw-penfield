import { Type, MemoryTypeSchema, ImportanceScoreSchema } from "../types/typebox.js";
import type { PenfieldApiClient } from "../api-client.js";

export const SearchToolSchema = Type.Object({
  query: Type.String({
    description: "Search query (1-4,000 chars)",
    minLength: 1,
    maxLength: 4000,
  }),
  limit: Type.Optional(
    Type.Number({
      description: "Max results (default: 20, max: 100)",
      minimum: 1,
      maximum: 100,
      default: 20,
    })
  ),
  memory_types: Type.Optional(
    Type.Array(MemoryTypeSchema, {
      description: "Filter by memory types",
    })
  ),
  importance_threshold: Type.Optional(
    Type.Number({
      ...ImportanceScoreSchema,
      description: "Minimum importance (0-1)",
    })
  ),
}, { additionalProperties: false });

export async function executeSearchTool(
  apiClient: PenfieldApiClient,
  params: any // eslint-disable-line @typescript-eslint/no-explicit-any -- validated by TypeBox schema
): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any -- validated return format
  // Search is a variant of hybrid search with higher vector weight
  const searchParams = {
    ...params,
    vector_weight: 0.6,
    bm25_weight: 0.3,
    graph_weight: 0.1,
  };

  const response = await apiClient.post("/api/v2/search/hybrid", searchParams);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(response, null, 2),
      },
    ],
    details: response,
  };
}
