import { toolResult } from "./result.js";
import type { Static } from "typebox";
import { Type } from "../types/typebox.js";
import type { PenfieldApiClient } from "../api-client.js";

export const AwakenToolSchema = Type.Object({}, { additionalProperties: false });

export async function executeAwakenTool(
  apiClient: PenfieldApiClient,
  _params: Static<typeof AwakenToolSchema>
) {
  // Awaken loads the user's personality briefing from the Penfield system
  const response = await apiClient.get<{ briefing: string }>("/api/v2/personality/awakening");

  const briefing = response.briefing || "";

  return toolResult(response, briefing);
}
