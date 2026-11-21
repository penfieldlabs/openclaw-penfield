import { parseSchema } from "../schema.js";
import type { TSchema, Static } from "typebox";
import { toolResult } from "./result.js";
import type { OpenClawPluginApi } from "../types.js";
import type { PenfieldApiClient } from "../api-client.js";

import { StoreToolSchema, executeStoreTool, type FlushContext } from "./store.js";
import { RecallToolSchema, executeRecallTool } from "./recall.js";
import { SearchToolSchema, executeSearchTool } from "./search.js";
import { FetchToolSchema, executeFetchTool } from "./fetch.js";
import { UpdateMemoryToolSchema, executeUpdateMemoryTool } from "./update-memory.js";
import { ConnectToolSchema, executeConnectTool } from "./connect.js";
import { DisconnectToolSchema, executeDisconnectTool } from "./disconnect.js";
import { ExploreToolSchema, executeExploreTool } from "./explore.js";
import { SaveContextToolSchema, executeSaveContextTool } from "./save-context.js";
import { RestoreContextToolSchema, executeRestoreContextTool } from "./restore-context.js";
import { ListContextsToolSchema, executeListContextsTool } from "./list-contexts.js";
import { ReflectToolSchema, executeReflectTool } from "./reflect.js";
import { SaveArtifactToolSchema, executeSaveArtifactTool } from "./save-artifact.js";
import { RetrieveArtifactToolSchema, executeRetrieveArtifactTool } from "./retrieve-artifact.js";
import { ListArtifactsToolSchema, executeListArtifactsTool } from "./list-artifacts.js";
import { DeleteArtifactToolSchema, executeDeleteArtifactTool } from "./delete-artifact.js";
import { AwakenToolSchema, executeAwakenTool } from "./awaken.js";

function penfieldTool<S extends TSchema>(
  name: string,
  label: string,
  description: string,
  parameters: S,
  execute: (
    client: PenfieldApiClient,
    params: Static<S>,
    flush?: FlushContext
  ) => Promise<{ content: { type: "text"; text: string }[]; details: unknown }>
) {
  return {
    metadata: { name, label, description, parameters },
    async run(
      client: PenfieldApiClient,
      params: unknown,
      signal?: AbortSignal,
      flush?: FlushContext
    ) {
      try {
        const input = parseSchema(parameters, params, name + " input");
        return await execute(client.withSignal(signal), input, flush);
      } catch (err) {
        return {
          isError: true,
          ...toolResult({ error: err instanceof Error ? err.message : String(err) }),
        };
      }
    },
  };
}

const tools = [
  penfieldTool(
    "penfield_store",
    "Store Memory",
    "Store a new memory in Penfield",
    StoreToolSchema,
    executeStoreTool
  ),

  penfieldTool(
    "penfield_recall",
    "Recall Memories",
    "Search memories using hybrid BM25 + vector + graph search",
    RecallToolSchema,
    executeRecallTool
  ),

  penfieldTool(
    "penfield_search",
    "Search Memories",
    "Semantic search for memories",
    SearchToolSchema,
    executeSearchTool
  ),

  penfieldTool(
    "penfield_fetch",
    "Fetch Memory",
    "Get a specific memory by ID",
    FetchToolSchema,
    executeFetchTool
  ),

  penfieldTool(
    "penfield_update_memory",
    "Update Memory",
    "Update an existing memory",
    UpdateMemoryToolSchema,
    executeUpdateMemoryTool
  ),

  penfieldTool(
    "penfield_connect",
    "Connect Memories",
    "Create a relationship between two memories",
    ConnectToolSchema,
    executeConnectTool
  ),

  penfieldTool(
    "penfield_disconnect",
    "Disconnect Memories",
    "Remove a relationship between two memories",
    DisconnectToolSchema,
    executeDisconnectTool
  ),

  penfieldTool(
    "penfield_explore",
    "Explore Graph",
    "Traverse the knowledge graph from a starting memory",
    ExploreToolSchema,
    executeExploreTool
  ),

  penfieldTool(
    "penfield_save_context",
    "Save Context",
    "Save a cognitive state checkpoint with name and description for handoff to another agent or future session",
    SaveContextToolSchema,
    executeSaveContextTool
  ),

  penfieldTool(
    "penfield_restore_context",
    "Restore Context",
    "Restore a previously saved context checkpoint by name, UUID, or 'awakening' for personality briefing",
    RestoreContextToolSchema,
    executeRestoreContextTool
  ),

  penfieldTool(
    "penfield_list_contexts",
    "List Contexts",
    "List all saved checkpoints",
    ListContextsToolSchema,
    executeListContextsTool
  ),

  penfieldTool(
    "penfield_reflect",
    "Reflect",
    "Analyze memory patterns and generate insights",
    ReflectToolSchema,
    executeReflectTool
  ),

  penfieldTool(
    "penfield_save_artifact",
    "Save Artifact",
    "Save a file artifact to Penfield storage",
    SaveArtifactToolSchema,
    executeSaveArtifactTool
  ),

  penfieldTool(
    "penfield_retrieve_artifact",
    "Retrieve Artifact",
    "Retrieve a file artifact from Penfield storage",
    RetrieveArtifactToolSchema,
    executeRetrieveArtifactTool
  ),

  penfieldTool(
    "penfield_list_artifacts",
    "List Artifacts",
    "List artifacts in a directory",
    ListArtifactsToolSchema,
    executeListArtifactsTool
  ),

  penfieldTool(
    "penfield_delete_artifact",
    "Delete Artifact",
    "Delete a file artifact from Penfield storage",
    DeleteArtifactToolSchema,
    executeDeleteArtifactTool
  ),

  penfieldTool(
    "penfield_awaken",
    "Awaken",
    "Load personality configuration and identity core",
    AwakenToolSchema,
    executeAwakenTool
  ),
];

export const penfieldToolMetadata = tools.map(({ metadata }) => ({
  ...metadata,
  parameters: { ...metadata.parameters },
}));

export function registerPenfieldTools(
  api: OpenClawPluginApi,
  client: PenfieldApiClient,
  flushOrigin?: string
) {
  for (const tool of tools) {
    if (flushOrigin && tool.metadata.name === "penfield_store") {
      api.registerTool(
        (ctx) => ({
          ...tool.metadata,
          execute: (_id, params, signal) =>
            tool.run(
              client,
              params,
              signal,
              ctx.memoryFlush && {
                id: ctx.memoryFlush.flushId,
                origin: flushOrigin,
                stateDir: api.runtime.state.resolveStateDir(),
              }
            ),
        }),
        { name: tool.metadata.name, workspaceAccess: false }
      );
    } else {
      api.registerTool({
        ...tool.metadata,
        execute: (_id, params, signal) => tool.run(client, params, signal),
      });
    }
  }
}
