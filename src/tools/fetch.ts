import { toolResult } from "./result.js";
import type { Static } from "typebox";
import { Type } from "../types/typebox.js";
import type { PenfieldApiClient } from "../api-client.js";
import { validateUuid } from "../validation.js";

export const FetchToolSchema = Type.Object(
  {
    memory_id: Type.String({
      description: "Memory ID to fetch (UUID format)",
    }),
  },
  { additionalProperties: false }
);

export async function executeFetchTool(
  apiClient: PenfieldApiClient,
  params: Static<typeof FetchToolSchema>
) {
  validateUuid(params.memory_id, "memory_id");
  const response = await apiClient.get(`/api/v2/memories/${params.memory_id}`);
  return toolResult(response);
}
