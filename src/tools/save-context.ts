import { Type } from "../types/typebox.js";
import type { PenfieldApiClient } from "../api-client.js";
import { validateUuid } from "../validation.js";

export const SaveContextToolSchema = Type.Object({
  memory_ids: Type.Array(Type.String(), {
    description: "Array of memory IDs to save in checkpoint",
    minItems: 1,
  }),
  session_id: Type.Optional(
    Type.String({
      description: "Optional session identifier",
    })
  ),
}, { additionalProperties: false });

export async function executeSaveContextTool(
  apiClient: PenfieldApiClient,
  params: unknown
): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any -- validated return format
  const { memory_ids, session_id } = params as { memory_ids: string[]; session_id?: string };
  memory_ids.forEach((id, index) => {
    validateUuid(id, `memory_ids[${index}]`);
  });

  const response = await apiClient.post("/api/v2/checkpoint/create", { memory_ids, session_id });
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
