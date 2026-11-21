import { toolResult } from "./result.js";
import type { Static } from "typebox";
import { Type } from "../types/typebox.js";
import type { PenfieldApiClient } from "../api-client.js";
import { validateArtifactPath } from "../validation.js";

export const SaveArtifactToolSchema = Type.Object(
  {
    path: Type.String({
      description: "Artifact path (e.g., /project/file.txt)",
    }),
    content: Type.String({
      description: "Artifact content",
    }),
  },
  { additionalProperties: false }
);

export async function executeSaveArtifactTool(
  apiClient: PenfieldApiClient,
  params: Static<typeof SaveArtifactToolSchema>
) {
  validateArtifactPath(params.path);
  if (Buffer.byteLength(params.content, "utf8") > 1024 * 1024)
    throw new Error("Artifact content exceeds 1 MiB.");
  const response = await apiClient.post("/api/v2/artifacts", params);
  return toolResult(response);
}
