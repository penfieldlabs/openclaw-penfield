import { toolResult } from "./result.js";
import type { Static } from "typebox";
import { Type, RelationshipTypeSchema } from "../types/typebox.js";
import type { PenfieldApiClient } from "../api-client.js";
import { validateUuid } from "../validation.js";
import { compactExploreResponse, type ExploreResponse } from "../response-compact.js";

export const ExploreToolSchema = Type.Object(
  {
    start_memory_id: Type.String({
      description: "Starting memory ID for graph traversal (UUID format)",
    }),
    max_depth: Type.Optional(
      Type.Integer({
        description: "Maximum traversal depth (default: 3, max: 10)",
        minimum: 1,
        maximum: 10,
        default: 3,
      })
    ),
    relationship_types: Type.Optional(
      Type.Array(RelationshipTypeSchema, {
        description: "Filter by relationship types",
      })
    ),
    max_paths: Type.Optional(
      Type.Integer({
        minimum: 1,
        maximum: 100,
        description: "Maximum paths to return. Default 25.",
      })
    ),
    min_strength: Type.Optional(
      Type.Number({
        description: "Minimum relationship strength (0-1)",
        minimum: 0,
        maximum: 1,
      })
    ),
  },
  { additionalProperties: false }
);

export async function executeExploreTool(
  apiClient: PenfieldApiClient,
  params: Static<typeof ExploreToolSchema>
) {
  const { min_strength, max_paths, ...request } = params;
  const { start_memory_id } = request;
  validateUuid(start_memory_id, "start_memory_id");

  const response = await apiClient.post<ExploreResponse>("/api/v2/relationships/traverse", request);
  const compact = compactExploreResponse(response, start_memory_id, min_strength, max_paths);

  return toolResult(compact);
}
