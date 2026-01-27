import { Type } from "../types/typebox.js";
import type { PenfieldApiClient } from "../api-client.js";
import { validateUuid } from "../validation.js";

export const RestoreContextToolSchema = Type.Object({
  checkpoint_id: Type.String({
    description: "Checkpoint ID to restore (e.g., cp-550e8400-e29b-41d4-a716-446655440000)",
  }),
  full_restore: Type.Optional(
    Type.Boolean({
      description: "Create new copies of memories instead of referencing existing (default: false)",
      default: false,
    })
  ),
  merge_mode: Type.Optional(
    Type.Union(
      [
        Type.Literal("append"),
        Type.Literal("replace"),
        Type.Literal("smart_merge"),
      ],
      {
        description: "How to handle conflicts: append (add to existing), replace (use only checkpoint), smart_merge (newer versions preferred)",
        default: "append",
      }
    )
  ),
}, { additionalProperties: false });

export async function executeRestoreContextTool(
  apiClient: PenfieldApiClient,
  params: any // eslint-disable-line @typescript-eslint/no-explicit-any -- validated by TypeBox schema
): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any -- validated return format
  const { checkpoint_id, ...restoreParams } = params;
  validateUuid(checkpoint_id, 'checkpoint_id');
  const response = await apiClient.post(
    `/api/v2/checkpoint/${checkpoint_id}/recall`,
    restoreParams
  );
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
