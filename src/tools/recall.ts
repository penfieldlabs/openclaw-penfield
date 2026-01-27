import { Type, MemoryTypeSchema, ImportanceScoreSchema } from "../types/typebox.js";
import type { PenfieldApiClient } from "../api-client.js";

export const RecallToolSchema = Type.Object({
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
}, { additionalProperties: false });

export async function executeRecallTool(
  apiClient: PenfieldApiClient,
  params: any // eslint-disable-line @typescript-eslint/no-explicit-any -- validated by TypeBox schema
): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any -- validated return format
  // Validate weights sum to 1.0
  const bm25 = params.bm25_weight ?? 0.4;
  const vector = params.vector_weight ?? 0.4;
  const graph = params.graph_weight ?? 0.2;
  const sum = bm25 + vector + graph;

  if (Math.abs(sum - 1.0) > 0.01) {
    throw new Error(`Weights must sum to 1.0 (got ${sum})`);
  }

  const response = await apiClient.post("/api/v2/search/hybrid", params);
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
