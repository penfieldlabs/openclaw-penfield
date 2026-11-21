import { toolResult } from "./result.js";
import type { Static } from "typebox";
import { Type } from "../types/typebox.js";
import type { PenfieldApiClient } from "../api-client.js";
import { validateArtifactPath } from "../validation.js";

export const DeleteArtifactToolSchema = Type.Object(
  {
    path: Type.String({
      description: "Artifact path to delete",
    }),
  },
  { additionalProperties: false }
);

export async function executeDeleteArtifactTool(
  apiClient: PenfieldApiClient,
  params: Static<typeof DeleteArtifactToolSchema>
) {
  validateArtifactPath(params.path);
  const queryParams: Record<string, string> = {
    path: params.path,
  };

  const response = await apiClient.delete("/api/v2/artifacts", queryParams);
  return toolResult(response);
}
