import {
  Type,
  MemoryTypeSchema,
  ImportanceScoreSchema,
  ConfidenceScoreSchema,
  TagsSchema,
} from "../types/typebox.js";
import type { PenfieldApiClient } from "../api-client.js";

export const StoreToolSchema = Type.Object({
  content: Type.String({
    description: "Memory content to store (max 10,000 chars)",
    minLength: 1,
    maxLength: 10000,
  }),
  memory_type: Type.Optional(MemoryTypeSchema),
  importance: Type.Optional(
    Type.Number({
      ...ImportanceScoreSchema,
      description: "Importance score 0-1 (default: 0.5)",
    })
  ),
  confidence: Type.Optional(
    Type.Number({
      ...ConfidenceScoreSchema,
      description: "Confidence score 0-1 (default: 0.8)",
    })
  ),
  source_type: Type.Optional(
    Type.String({
      description: "Source type (e.g., direct_input, conversation)",
    })
  ),
  tags: Type.Optional(
    Type.Array(Type.String(), {
      ...TagsSchema,
      description: "Tags (max 10)",
    })
  ),
}, { additionalProperties: false });

export async function executeStoreTool(
  apiClient: PenfieldApiClient,
  params: unknown
): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any -- validated return format
  const response = await apiClient.post("/api/v2/memories", params);
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
