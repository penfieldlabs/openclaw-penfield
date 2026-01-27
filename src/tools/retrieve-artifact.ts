import { Type } from "../types/typebox.js";
import type { PenfieldApiClient } from "../api-client.js";
import { validateArtifactPath } from "../validation.js";

export const RetrieveArtifactToolSchema = Type.Object({
  path: Type.String({
    description: "Artifact path to retrieve",
  }),
}, { additionalProperties: false });

export async function executeRetrieveArtifactTool(
  apiClient: PenfieldApiClient,
  params: any // eslint-disable-line @typescript-eslint/no-explicit-any -- validated by TypeBox schema
): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any -- validated return format
  validateArtifactPath(params.path);
  const queryParams: Record<string, string> = {
    path: params.path,
  };

  const response = await apiClient.get("/api/v2/artifacts", queryParams);
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
