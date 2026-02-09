import { Type, RelationshipTypeSchema } from "../types/typebox.js";
import type { PenfieldApiClient } from "../api-client.js";
import { validateUuid } from "../validation.js";

export const ExploreToolSchema = Type.Object({
  start_memory_id: Type.String({
    description: "Starting memory ID for graph traversal (UUID format)",
  }),
  max_depth: Type.Optional(
    Type.Number({
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
  min_strength: Type.Optional(
    Type.Number({
      description: "Minimum relationship strength (0-1)",
      minimum: 0,
      maximum: 1,
    })
  ),
}, { additionalProperties: false });

export async function executeExploreTool(
  apiClient: PenfieldApiClient,
  params: unknown
): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any -- validated return format
  const { start_memory_id } = params as { start_memory_id: string };
  validateUuid(start_memory_id, 'start_memory_id');

  const response = await apiClient.post("/api/v2/relationships/traverse", params);
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
