import { Type } from "../types/typebox.js";
import type { PenfieldApiClient } from "../api-client.js";

export const ListContextsToolSchema = Type.Object({
  session_id: Type.Optional(
    Type.String({
      description: "Filter by session ID",
    })
  ),
  limit: Type.Optional(
    Type.Number({
      description: "Max results (default: 20, max: 100)",
      minimum: 1,
      maximum: 100,
      default: 20,
    })
  ),
}, { additionalProperties: false });

export async function executeListContextsTool(
  apiClient: PenfieldApiClient,
  params: any // eslint-disable-line @typescript-eslint/no-explicit-any -- validated by TypeBox schema
): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any -- validated return format
  const queryParams: Record<string, string> = {};
  if (params.session_id) {
    queryParams.session_id = params.session_id;
  }
  if (params.limit) {
    queryParams.limit = String(params.limit);
  }

  const response = await apiClient.get("/api/v2/checkpoint", queryParams);
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
