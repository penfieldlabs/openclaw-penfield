import { Type, RelationshipTypeSchema } from "../types/typebox.js";
import type { PenfieldApiClient } from "../api-client.js";
import { validateUuid } from "../validation.js";

export const ConnectToolSchema = Type.Object({
  from_memory_id: Type.String({
    description: "Source memory ID (UUID format)",
    examples: ["22618318-8d82-49c9-8bb8-1cf3a61b3c75"],
  }),
  to_memory_id: Type.String({
    description: "Target memory ID (UUID format)",
    examples: ["20413926-2446-4f88-bfd6-749b37969f34"],
  }),
  relationship_type: RelationshipTypeSchema,
  strength: Type.Optional(
    Type.Number({
      description: "Relationship strength 0-1 (default: 0.8)",
      minimum: 0,
      maximum: 1,
      default: 0.8,
    })
  ),
}, { additionalProperties: false });

export async function executeConnectTool(
  apiClient: PenfieldApiClient,
  params: any // eslint-disable-line @typescript-eslint/no-explicit-any -- validated by TypeBox schema
): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any -- validated return format
  validateUuid(params.from_memory_id, 'from_memory_id');
  validateUuid(params.to_memory_id, 'to_memory_id');

  // Map user-friendly field names to API field names
  const apiParams = {
    from_id: params.from_memory_id,
    to_id: params.to_memory_id,
    relationship_type: params.relationship_type,
    strength: params.strength,
  };

  const response = await apiClient.post("/api/v2/relationships", apiParams);
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
