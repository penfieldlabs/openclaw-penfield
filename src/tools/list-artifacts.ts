import { Type } from "../types/typebox.js";
import type { PenfieldApiClient } from "../api-client.js";

export const ListArtifactsToolSchema = Type.Object({
  prefix: Type.Optional(
    Type.String({
      description: "Directory prefix to list (e.g., /project/)",
    })
  ),
  limit: Type.Optional(
    Type.Number({
      description: "Max results (default: 100)",
      minimum: 1,
      maximum: 1000,
      default: 100,
    })
  ),
}, { additionalProperties: false });

export async function executeListArtifactsTool(
  apiClient: PenfieldApiClient,
  params: any // eslint-disable-line @typescript-eslint/no-explicit-any -- validated by TypeBox schema
): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any -- validated return format
  const queryParams: Record<string, string> = {};
  if (params.prefix) {
    queryParams.prefix = params.prefix;
  }
  if (params.limit) {
    queryParams.limit = String(params.limit);
  }

  const response = await apiClient.get("/api/v2/artifacts/list", queryParams);
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
