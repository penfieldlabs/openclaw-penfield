import { Type } from "../types/typebox.js";
import type { PenfieldApiClient } from "../api-client.js";
import { validateUuid } from "../validation.js";

export const DisconnectToolSchema = Type.Object({
  from_memory_id: Type.String({
    description: "Source memory ID (UUID format)",
    examples: ["22618318-8d82-49c9-8bb8-1cf3a61b3c75"],
  }),
  to_memory_id: Type.String({
    description: "Target memory ID (UUID format)",
    examples: ["20413926-2446-4f88-bfd6-749b37969f34"],
  }),
}, { additionalProperties: false });

export async function executeDisconnectTool(
  apiClient: PenfieldApiClient,
  params: any // eslint-disable-line @typescript-eslint/no-explicit-any -- validated by TypeBox schema
): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any -- validated return format
  validateUuid(params.from_memory_id, 'from_memory_id');
  validateUuid(params.to_memory_id, 'to_memory_id');

  // Map user-friendly field names to API field names
  const queryParams: Record<string, string> = {
    from_id: params.from_memory_id,
    to_id: params.to_memory_id,
  };

  await apiClient.delete("/api/v2/relationships/between", queryParams);

  const result = {
    success: true,
    from_id: params.from_memory_id,
    to_id: params.to_memory_id,
    message: "Relationship removed",
  };

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
    details: result,
  };
}
