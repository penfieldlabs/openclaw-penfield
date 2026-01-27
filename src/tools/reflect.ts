import { Type, MemoryTypeSchema } from "../types/typebox.js";
import type { PenfieldApiClient } from "../api-client.js";

export const ReflectToolSchema = Type.Object({
  time_window: Type.Optional(
    Type.Union(
      [
        Type.Literal("1d"),
        Type.Literal("7d"),
        Type.Literal("30d"),
        Type.Literal("90d"),
      ],
      {
        description: "Time period to analyze. Defaults to last 7 days.",
        examples: ["7d", "30d"],
      }
    )
  ),
  focus_areas: Type.Optional(
    Type.Array(
      Type.Union([
        Type.Literal("memory_usage"),
        Type.Literal("relationships"),
        Type.Literal("importance"),
        Type.Literal("topics"),
        Type.Literal("patterns"),
      ]),
      {
        description: "Areas to focus analysis on. Omit for full analysis.",
        examples: [["memory_usage", "relationships"], ["topics"]],
      }
    )
  ),
  memory_types: Type.Optional(
    Type.Array(MemoryTypeSchema, {
      description: "Filter by memory types. Defaults to all types.",
      examples: [["fact", "insight"], ["identity_core", "personality_trait"]],
    })
  ),
}, { additionalProperties: false });

export async function executeReflectTool(
  apiClient: PenfieldApiClient,
  params: unknown
): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any -- validated return format
  const response = await apiClient.post("/api/v2/analysis/reflect", params);
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
