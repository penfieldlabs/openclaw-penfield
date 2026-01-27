import { Type } from "../types/typebox.js";
import type { PenfieldApiClient } from "../api-client.js";
import { validateArtifactPath } from "../validation.js";

export const SaveArtifactToolSchema = Type.Object({
  path: Type.String({
    description: "Artifact path (e.g., /project/file.txt)",
  }),
  content: Type.String({
    description: "Artifact content",
  }),
  content_type: Type.Optional(
    Type.String({
      description: "MIME type (default: text/plain)",
    })
  ),
}, { additionalProperties: false });

export async function executeSaveArtifactTool(
  apiClient: PenfieldApiClient,
  params: any // eslint-disable-line @typescript-eslint/no-explicit-any -- validated by TypeBox schema
): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any -- validated return format
  validateArtifactPath(params.path);
  const response = await apiClient.post("/api/v2/artifacts", params);
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
