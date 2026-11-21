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

export const RecallToolSchema = Type.Object(
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
    bm25_weight: Type.Optional(
      Type.Number({
        description: "BM25 keyword weight (default: 0.4)",
        minimum: 0,
        maximum: 1,
        default: 0.4,
      })
    ),
    vector_weight: Type.Optional(
      Type.Number({
        description: "Vector semantic weight (default: 0.4)",
        minimum: 0,
        maximum: 1,
        default: 0.4,
      })
    ),
    graph_weight: Type.Optional(
      Type.Number({
        description: "Graph relationship weight (default: 0.2)",
        minimum: 0,
        maximum: 1,
        default: 0.2,
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
    enable_graph_expansion: Type.Optional(
      Type.Boolean({
        description: "Enable graph traversal (default: true)",
        default: true,
      })
    ),
    start_date: Type.Optional(StartDateSchema),
    end_date: Type.Optional(EndDateSchema),
    sort: Type.Optional(SortOrderSchema),
    max_content_length: Type.Optional(MaxContentLengthSchema),
  },
  { additionalProperties: false }
);

export async function executeRecallTool(
  apiClient: PenfieldApiClient,
  params: Static<typeof RecallToolSchema>
) {
  // Validate weights sum to 1.0
  const bm25 = params.bm25_weight ?? 0.4;
  const vector = params.vector_weight ?? 0.4;
  const graph = params.graph_weight ?? 0.2;
  const sum = bm25 + vector + graph;

  if (Math.abs(sum - 1.0) > 0.01) {
    throw new Error(`Weights must sum to 1.0 (got ${sum})`);
  }

  // Separate plugin-only params from API params
  const { sort, max_content_length, ...apiParams } = params;

  const response = await apiClient.post<SearchResponse>("/api/v2/search/hybrid", apiParams);
  const compact = compactRecallResponse(response, params.query, {
    sort,
    maxContentLength: max_content_length,
  });

  return toolResult(compact);
}
