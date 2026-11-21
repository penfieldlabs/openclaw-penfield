import type { Static } from "typebox";
import { checkpointFields, checkpointPages, type Checkpoint } from "./checkpoints.js";
import { PenfieldError } from "../http.js";
import { Type, MaxContentLengthSchema } from "../types/typebox.js";
import type { PenfieldApiClient } from "../api-client.js";
import { isUuid } from "../validation.js";

export const RestoreContextToolSchema = Type.Object(
  {
    name: Type.String({
      description:
        "Name or ID of context to restore. Can be a context name (exact match), " +
        'a context UUID, or "awakening" for personality briefing.',
      minLength: 1,
    }),
    max_content_length: Type.Optional(MaxContentLengthSchema),
    limit: Type.Optional(
      Type.Integer({
        description: "Maximum number of memories to restore (default: 20)",
        minimum: 1,
        maximum: 100,
        default: 20,
      })
    ),
  },
  { additionalProperties: false }
);

export async function executeRestoreContextTool(
  apiClient: PenfieldApiClient,
  input: Static<typeof RestoreContextToolSchema>
) {
  const { name, limit = 20, max_content_length = 1000 } = input;
  if (name.toLowerCase() === "awakening") {
    const { briefing } = await apiClient.get<{ briefing: string }>("/api/v2/personality/awakening");
    const details = {
      success: true,
      context_id: "awakening",
      description: briefing,
      memories: [],
      memories_restored: 0,
    };
    return { content: [{ type: "text" as const, text: briefing }], details };
  }
  let checkpoint: Checkpoint | undefined;
  if (isUuid(name)) {
    try {
      const memory = await apiClient.get<Checkpoint>("/api/v2/memories/" + name);
      if (memory.memory_type === "checkpoint") checkpoint = memory;
    } catch (err) {
      if (!(err instanceof PenfieldError && err.status === 404)) throw err;
    }
  }
  if (!checkpoint) {
    for await (const page of checkpointPages(apiClient)) {
      checkpoint = page.items.find((m) => checkpointFields(m).name === name);
      if (checkpoint) break;
    }
  }
  if (!checkpoint) throw new Error('No context found matching "' + name + '"');
  const { description, ids } = checkpointFields(checkpoint);
  const validIds = ids.filter(isUuid).slice(0, limit);
  const memories = [];
  for (let i = 0; i < validIds.length; i += 6) {
    const batch = await Promise.all(
      validIds.slice(i, i + 6).map(async (id) => {
        try {
          const m = await apiClient.get<Checkpoint>("/api/v2/memories/" + id);
          return {
            id: m.id,
            content:
              m.content.length > max_content_length
                ? m.content.slice(0, max_content_length) + "... [use penfield_fetch]"
                : m.content,
            memory_type: m.memory_type,
            created_at: m.created_at,
          };
        } catch (err) {
          if (err instanceof PenfieldError && err.status === 404) return null;
          throw err;
        }
      })
    );
    memories.push(...batch.filter((m) => m !== null));
  }
  const details = {
    success: true,
    context_id: checkpoint.id,
    description,
    memories,
    memories_restored: memories.length,
  };
  return { content: [{ type: "text" as const, text: JSON.stringify(details) }], details };
}
