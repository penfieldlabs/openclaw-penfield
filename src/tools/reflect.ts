import { Type } from "../types/typebox.js";
import type { PenfieldApiClient } from "../api-client.js";

export const ReflectToolSchema = Type.Object({
  time_window: Type.Optional(
    Type.Union(
      [
        Type.Literal("recent"),
        Type.Literal("today"),
        Type.Literal("week"),
        Type.Literal("month"),
        Type.Literal("1d"),
        Type.Literal("7d"),
        Type.Literal("30d"),
        Type.Literal("90d"),
      ],
      {
        description:
          'Time period to analyze: "recent" (default, no time cutoff), "today"/"1d", "week"/"7d", "month"/"30d", or "90d".',
        examples: ["recent", "week", "30d"],
      }
    )
  ),
  start_date: Type.Optional(
    Type.String({
      description:
        "Filter memories created on or after this date (ISO 8601, e.g. '2025-01-01'). Overrides time_window when set.",
      examples: ["2025-01-01"],
    })
  ),
  end_date: Type.Optional(
    Type.String({
      description:
        "Filter memories created on or before this date (ISO 8601, e.g. '2025-01-31'). Overrides time_window when set.",
      examples: ["2025-01-31"],
    })
  ),
  include_documents: Type.Optional(
    Type.Boolean({
      description:
        "Include document chunks in analysis. Default false (only user-created memories).",
    })
  ),
}, { additionalProperties: false });

/** Map shorthand aliases to API-native time_window values */
const TIME_WINDOW_ALIASES: Record<string, string> = {
  "1d": "today",
  "7d": "week",
  "30d": "month",
};

export async function executeReflectTool(
  apiClient: PenfieldApiClient,
  params: unknown
): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any -- validated return format
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- params validated by schema
  const p = { ...(params as any) };

  if (p.time_window === "90d") {
    // API has no 90d window — convert to explicit date range (matches MCP behavior)
    if (!p.start_date) {
      const d = new Date();
      d.setDate(d.getDate() - 90);
      p.start_date = d.toISOString().slice(0, 10);
    }
    p.time_window = "recent";
  } else if (p.time_window && p.time_window in TIME_WINDOW_ALIASES) {
    p.time_window = TIME_WINDOW_ALIASES[p.time_window];
  }

  const response = await apiClient.post("/api/v2/analysis/reflect", p);
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
