import { Type } from "../types/typebox.js";
import type { PenfieldApiClient } from "../api-client.js";

export const AwakenToolSchema = Type.Object({}, { additionalProperties: false });

export async function executeAwakenTool(
  apiClient: PenfieldApiClient,
  _params: any // eslint-disable-line @typescript-eslint/no-explicit-any -- validated by TypeBox schema
): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any -- validated return format
  // Awaken loads the user's personality briefing from the Penfield system
  const response = await apiClient.get<{ briefing: string }>("/api/v2/personality/awakening");

  const briefing = response.briefing || "";

  return {
    content: [
      {
        type: "text",
        text: briefing,
      },
    ],
    details: response,
  };
}
