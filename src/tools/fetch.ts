import { Type } from "../types/typebox.js";
import type { PenfieldApiClient } from "../api-client.js";
import { validateUuid } from "../validation.js";

export const FetchToolSchema = Type.Object({
  memory_id: Type.String({
    description: "Memory ID to fetch (UUID format)",
  }),
}, { additionalProperties: false });

export async function executeFetchTool(
  apiClient: PenfieldApiClient,
  params: any // eslint-disable-line @typescript-eslint/no-explicit-any -- validated by TypeBox schema
): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any -- validated return format
  validateUuid(params.memory_id, 'memory_id');
  const response = await apiClient.get(`/api/v2/memories/${params.memory_id}`);
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
