export function toolResult<T>(details: T, text = JSON.stringify(details)) {
  return { content: [{ type: "text" as const, text }], details };
}

export interface MemoryReceipt {
  id: string;
  memory_type?: string;
  created_at?: string;
  updated_at?: string;
}
export function memoryWriteResult(record: MemoryReceipt, knownId?: string) {
  const id = record?.id ?? knownId;
  if (!id)
    throw new Error(
      "Penfield acknowledged the write without returning an ID. Check recent memories before retrying."
    );
  return toolResult({
    id,
    memory_type: record?.memory_type,
    created_at: record?.created_at,
    updated_at: record?.updated_at,
  });
}
