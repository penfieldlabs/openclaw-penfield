import { toolResult } from "./result.js";
import type { Static } from "typebox";
import { checkpointFields, checkpointPages } from "./checkpoints.js";
import { Type } from "../types/typebox.js";
import type { PenfieldApiClient } from "../api-client.js";

export const ListContextsToolSchema = Type.Object(
  {
    limit: Type.Optional(
      Type.Integer({
        description: "Max results to return (default: 20, max: 100)",
        minimum: 1,
        maximum: 100,
        default: 20,
      })
    ),
    offset: Type.Optional(
      Type.Integer({
        description: "Number of results to skip for pagination (default: 0)",
        minimum: 0,
        default: 0,
      })
    ),
    name_pattern: Type.Optional(
      Type.String({
        description: "Filter contexts by name (case-insensitive substring match)",
      })
    ),
    include_descriptions: Type.Optional(
      Type.Boolean({
        description: "Include full descriptions in output (default: false for compact listing)",
      })
    ),
  },
  { additionalProperties: false }
);

export async function executeListContextsTool(
  apiClient: PenfieldApiClient,
  input: Static<typeof ListContextsToolSchema>
) {
  const { limit = 20, offset = 0, name_pattern, include_descriptions } = input;
  const filter = name_pattern?.toLowerCase();
  const size = filter ? 100 : limit;
  const startPage = filter ? 1 : Math.floor(offset / size) + 1;
  let seen = (startPage - 1) * size;
  let total = 0;
  const contexts = [];
  for await (const page of checkpointPages(apiClient, size, startPage)) {
    for (const memory of page.items) {
      const fields = checkpointFields(memory);
      if (filter && !fields.name?.toLowerCase().includes(filter)) continue;
      if (seen++ < offset || contexts.length >= limit) continue;
      contexts.push({
        id: memory.id,
        name: fields.name ?? "(unnamed)",
        memory_count: fields.count,
        created: memory.created_at,
        description: include_descriptions ? fields.description : undefined,
      });
    }
    total = filter ? seen : (page.pagination?.total ?? seen);
    if (!filter && contexts.length >= limit) break;
  }
  const result = {
    success: true,
    contexts,
    total,
    limit,
    offset,
    has_more: offset + contexts.length < total,
  };
  return toolResult(result);
}
