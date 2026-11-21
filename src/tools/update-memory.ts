import { memoryWriteResult, type MemoryReceipt } from "./result.js";
import type { Static } from "typebox";
import {
  Type,
  WritableMemoryTypeSchema,
  ImportanceScoreSchema,
  ConfidenceScoreSchema,
  TagsSchema,
} from "../types/typebox.js";
import type { PenfieldApiClient } from "../api-client.js";
import { cleanTags, validateUuid } from "../validation.js";

export const UpdateMemoryToolSchema = Type.Object(
  {
    memory_id: Type.String({
      description: "Memory ID to update (UUID format)",
    }),
    content: Type.Optional(
      Type.String({
        description: "Updated memory content (max 10,000 chars)",
        minLength: 1,
        maxLength: 10000,
      })
    ),
    memory_type: Type.Optional(WritableMemoryTypeSchema),
    importance: Type.Optional(ImportanceScoreSchema),
    confidence: Type.Optional(ConfidenceScoreSchema),
    tags: Type.Optional(TagsSchema),
  },
  { additionalProperties: false }
);

export async function executeUpdateMemoryTool(
  apiClient: PenfieldApiClient,
  params: Static<typeof UpdateMemoryToolSchema>
) {
  const { memory_id, ...updateData } = params;
  validateUuid(memory_id, "memory_id");
  if (updateData.tags) updateData.tags = cleanTags(updateData.tags);
  const response = await apiClient.put<MemoryReceipt>(`/api/v2/memories/${memory_id}`, updateData);
  return memoryWriteResult(response, memory_id);
}
