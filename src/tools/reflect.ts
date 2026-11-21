import { toolResult } from "./result.js";
import type { Static } from "typebox";
import { Type } from "../types/typebox.js";
import type { PenfieldApiClient } from "../api-client.js";
import { compactReflectResponse, type ReflectResponse } from "../response-compact.js";

export const ReflectToolSchema = Type.Object(
  {
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
  },
  { additionalProperties: false }
);

export async function executeReflectTool(
  apiClient: PenfieldApiClient,
  params: Static<typeof ReflectToolSchema>
) {
  const p = { ...params };

  const originalTimeWindow = p.time_window ?? "recent";

  if (p.time_window && ["1d", "7d", "30d", "90d"].includes(p.time_window)) {
    const days = Number.parseInt(p.time_window, 10);
    p.start_date ??= new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    delete p.time_window;
  }

  const response = await apiClient.post<ReflectResponse>("/api/v2/analysis/reflect", p);
  const compact = compactReflectResponse(response, originalTimeWindow);

  return toolResult(compact);
}
