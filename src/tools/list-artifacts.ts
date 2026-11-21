import { validateArtifactPath } from "../validation.js";
import { toolResult } from "./result.js";
import type { Static } from "typebox";
import { Type } from "../types/typebox.js";
import type { PenfieldApiClient } from "../api-client.js";

export const ListArtifactsToolSchema = Type.Object(
  {
    prefix: Type.Optional(
      Type.String({
        description: "Directory prefix to list (e.g., /project/)",
      })
    ),
    name_pattern: Type.Optional(Type.String({ description: "Filter file and folder names" })),
    limit: Type.Optional(
      Type.Integer({
        description: "Max results (default: 100)",
        minimum: 1,
        maximum: 1000,
        default: 100,
      })
    ),
  },
  { additionalProperties: false }
);

export async function executeListArtifactsTool(
  apiClient: PenfieldApiClient,
  params: Static<typeof ListArtifactsToolSchema>
) {
  const queryParams: Record<string, string> = {};
  if (params.prefix !== undefined) {
    validateArtifactPath(params.prefix, true);
    queryParams.prefix = params.prefix;
  }
  if (params.name_pattern) queryParams.name_pattern = params.name_pattern;
  const listing = await apiClient.get<{ files?: unknown[]; folders?: string[] }>(
    "/api/v2/artifacts/list",
    queryParams
  );
  const limit = params.limit ?? 100;
  const folders = (listing.folders ?? []).slice(0, limit);
  const response = {
    ...listing,
    folders,
    files: (listing.files ?? []).slice(0, limit - folders.length),
  };
  return toolResult(response);
}
