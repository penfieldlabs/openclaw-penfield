import type { PenfieldApiClient } from "../api-client.js";

export interface Checkpoint {
  id: string;
  content: string;
  memory_type?: string;
  created_at?: string;
  metadata?: { checkpoint_name?: string; memory_count?: number };
}
interface Page {
  items: Checkpoint[];
  pagination?: { total?: number; has_next?: boolean };
}
export function checkpointFields(memory: Checkpoint) {
  let data: {
    checkpoint_name?: string;
    description?: string;
    memory_count?: number;
    memory_ids?: string[];
  };
  try {
    data = JSON.parse(memory.content) ?? {};
  } catch {
    data = { description: memory.content };
  }
  return {
    name: memory.metadata?.checkpoint_name ?? data.checkpoint_name,
    count: memory.metadata?.memory_count ?? data.memory_count ?? 0,
    description: data.description,
    ids: Array.isArray(data.memory_ids) ? data.memory_ids : [],
  };
}
export async function* checkpointPages(client: PenfieldApiClient, size = 100, first = 1) {
  for (let page = first; ; page++) {
    const data = await client.get<Page>("/api/v2/memories", {
      memory_type: "checkpoint",
      per_page: String(size),
      page: String(page),
    });
    yield data;
    if (!data.pagination?.has_next) break;
  }
}
