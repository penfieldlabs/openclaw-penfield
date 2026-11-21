import { toolResult } from "./result.js";
import type { Static } from "typebox";
import {
  Type,
  MemoryTypeSchema,
  SearchSourceTypesSchema,
  ImportanceScoreSchema,
  StartDateSchema,
  EndDateSchema,
  SortOrderSchema,
  MaxContentLengthSchema,
} from "../types/typebox.js";
import type { PenfieldApiClient } from "../api-client.js";
import { compactRecallResponse, type SearchResponse } from "../response-compact.js";

export const SearchToolSchema = Type.Object(
  {
    query: Type.String({
      description: "Search query (1-4,000 chars)",
      minLength: 1,
      maxLength: 4000,
    }),
    limit: Type.Optional(
      Type.Integer({
        description: "Max results (default: 20, max: 100)",
        minimum: 1,
        maximum: 100,
        default: 20,
      })
    ),
    tags: Type.Optional(
      Type.String({ description: "Comma-separated tags. Matches any listed tag." })
    ),
    source_types: Type.Optional(SearchSourceTypesSchema),
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
    start_date: Type.Optional(StartDateSchema),
    end_date: Type.Optional(EndDateSchema),
    sort: Type.Optional(SortOrderSchema),
    max_content_length: Type.Optional(MaxContentLengthSchema),
  },
  { additionalProperties: false }
);

export async function executeSearchTool(
  apiClient: PenfieldApiClient,
  params: Static<typeof SearchToolSchema>
) {
  // Separate plugin-only params from API params
  const { sort, max_content_length, ...userParams } = params;

  // Search is a variant of hybrid search with higher vector weight
  const searchParams = {
    ...userParams,
    vector_weight: 0.6,
    bm25_weight: 0.3,
    graph_weight: 0.1,
  };

  const response = await apiClient.post<SearchResponse>("/api/v2/search/hybrid", searchParams);
  const compact = compactRecallResponse(response, params.query, {
    sort,
    maxContentLength: max_content_length,
  });

  return toolResult(compact);
}
