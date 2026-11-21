import { toolResult } from "./result.js";
import type { Static } from "typebox";
import { Type } from "../types/typebox.js";
import type { PenfieldApiClient } from "../api-client.js";
import { validateArtifactPath } from "../validation.js";

export const RetrieveArtifactToolSchema = Type.Object(
  {
    path: Type.String({
      description: "Artifact path to retrieve",
    }),
  },
  { additionalProperties: false }
);

export async function executeRetrieveArtifactTool(
  apiClient: PenfieldApiClient,
  params: Static<typeof RetrieveArtifactToolSchema>
) {
  validateArtifactPath(params.path);
  const queryParams: Record<string, string> = {
    path: params.path,
  };

  const response = await apiClient.get("/api/v2/artifacts", queryParams);
  return toolResult(response);
}
