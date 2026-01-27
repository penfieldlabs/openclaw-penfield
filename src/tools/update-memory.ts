import {
  Type,
  MemoryTypeSchema,
  ImportanceScoreSchema,
  ConfidenceScoreSchema,
  TagsSchema,
} from "../types/typebox.js";
import type { PenfieldApiClient } from "../api-client.js";
import { validateUuid } from "../validation.js";

export const UpdateMemoryToolSchema = Type.Object({
  memory_id: Type.String({
    description: "Memory ID to update",
  }),
  content: Type.Optional(
    Type.String({
      description: "Updated memory content (max 10,000 chars)",
      minLength: 1,
      maxLength: 10000,
    })
  ),
  memory_type: Type.Optional(MemoryTypeSchema),
  importance: Type.Optional(ImportanceScoreSchema),
  confidence: Type.Optional(ConfidenceScoreSchema),
  tags: Type.Optional(
    Type.Array(Type.String(), {
      ...TagsSchema,
      description: "Tags (max 10)",
    })
  ),
}, { additionalProperties: false });

export async function executeUpdateMemoryTool(
  apiClient: PenfieldApiClient,
  params: any // eslint-disable-line @typescript-eslint/no-explicit-any -- validated by TypeBox schema
): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any -- validated return format
  const { memory_id, ...updateData } = params;
  validateUuid(memory_id, 'memory_id');
  const response = await apiClient.put(`/api/v2/memories/${memory_id}`, updateData);
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
