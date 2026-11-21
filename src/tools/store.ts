import { createHash } from "node:crypto";
import { reserveFlush } from "../flush-reservations.js";
import { cleanTags } from "../validation.js";
import { PenfieldError } from "../http.js";
import { memoryWriteResult, type MemoryReceipt } from "./result.js";
import type { Static } from "typebox";
import {
  Type,
  WritableMemoryTypeSchema,
  StoreSourceTypeSchema,
  ImportanceScoreSchema,
  ConfidenceScoreSchema,
  TagsSchema,
} from "../types/typebox.js";
import type { PenfieldApiClient } from "../api-client.js";

export const StoreToolSchema = Type.Object(
  {
    content: Type.String({
      description: "Memory content to store (max 10,000 chars)",
      minLength: 1,
      maxLength: 10000,
    }),
    memory_type: Type.Optional(WritableMemoryTypeSchema),
    importance: Type.Optional(
      Type.Number({
        ...ImportanceScoreSchema,
        description: "Importance score 0-1 (default: 0.5)",
      })
    ),
    confidence: Type.Optional(
      Type.Number({
        ...ConfidenceScoreSchema,
        description: "Confidence score 0-1 (default: 0.8)",
      })
    ),
    source_type: Type.Optional(StoreSourceTypeSchema),
    tags: Type.Optional(TagsSchema),
  },
  { additionalProperties: false }
);

type FlushMemory = MemoryReceipt & { tags?: string[]; content?: string };

export interface FlushContext {
  id: string;
  origin: string;
  stateDir: string;
}

export async function executeStoreTool(
  apiClient: PenfieldApiClient,
  params: Static<typeof StoreToolSchema>,
  flush?: FlushContext
) {
  const endpoint = "/api/v2/memories";
  const tags = params.tags && cleanTags(params.tags);
  if (!flush)
    return memoryWriteResult(await apiClient.post<MemoryReceipt>(endpoint, { ...params, tags }));

  // OpenClaw supplies one ID for the whole cycle, including retries.
  const digest = createHash("sha256")
    .update(JSON.stringify([flush.origin, flush.id]))
    .digest("hex");
  const tag = "openclaw-flush-" + digest.slice(0, 32);
  const flushTags = [...new Set([...(tags ?? []), tag])];
  if (flushTags.length > 10)
    throw new Error("A compaction save accepts up to 9 user tags and adds one retry tag.");

  // Claim before reading so a delayed empty lookup cannot authorize another POST.
  const reservation = await reserveFlush(flush.stateDir, digest);
  try {
    let saved: FlushMemory | undefined;
    if (reservation.savedId) {
      try {
        saved = await apiClient.get<FlushMemory>(
          endpoint + "/" + encodeURIComponent(reservation.savedId)
        );
      } catch (err) {
        if (err instanceof PenfieldError && err.status === 404)
          throw new Error(
            "The memory previously saved for this compaction cycle was not found. No new memory was saved.",
            { cause: err }
          );
        throw err;
      }
      if (saved?.id !== reservation.savedId)
        throw new Error(
          "Could not verify the saved memory ID for this compaction cycle. No new memory was saved."
        );
    } else {
      const records = await apiClient
        .get<{ items: FlushMemory[] }>(endpoint, {
          tags: tag,
          per_page: "1",
          include_inactive: "true",
        })
        .catch((err: unknown) => {
          if (reservation.claimed) reservation.forget();
          throw err;
        });
      saved = records.items.find((record) => record.tags?.includes(tag));
    }
    if (saved) {
      const receipt = memoryWriteResult(saved);
      if (!reservation.savedId) reservation.confirm(receipt.details.id);
      if (typeof saved.content !== "string")
        throw new Error(
          "Could not verify the content of the existing compaction memory. No new memory was saved."
        );
      // Penfield preserves surrounding whitespace, CRLF, lone CR and LF.
      if (saved.content !== params.content)
        throw new Error(
          "This compaction cycle already saved different content. The requested content was not saved."
        );
      return receipt;
    }
    if (!reservation.claimed)
      throw new Error(
        "This compaction save was already attempted. Its receipt is not yet visible. Check Penfield before saving again."
      );
    const record = await apiClient
      .post<MemoryReceipt>(endpoint, { ...params, tags: flushTags })
      .catch((err: unknown) => {
        if (
          err instanceof PenfieldError &&
          [400, 401, 403, 404, 413, 422, 429].includes(err.status)
        )
          reservation.forget();
        throw err;
      });
    const receipt = memoryWriteResult(record);
    reservation.confirm(receipt.details.id);
    return receipt;
  } finally {
    reservation.close();
  }
}
