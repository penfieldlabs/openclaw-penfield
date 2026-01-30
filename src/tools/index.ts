import type { PenfieldRuntime } from "../runtime.js";
import type { OpenClawPluginApi } from "../types.js";
import type { PenfieldApiClient } from "../api-client.js";

import { StoreToolSchema, executeStoreTool } from "./store.js";
import { RecallToolSchema, executeRecallTool } from "./recall.js";
import { SearchToolSchema, executeSearchTool } from "./search.js";
import { FetchToolSchema, executeFetchTool } from "./fetch.js";
import { UpdateMemoryToolSchema, executeUpdateMemoryTool } from "./update-memory.js";
import { ConnectToolSchema, executeConnectTool } from "./connect.js";
import { ExploreToolSchema, executeExploreTool } from "./explore.js";
import { SaveContextToolSchema, executeSaveContextTool } from "./save-context.js";
import {
  RestoreContextToolSchema,
  executeRestoreContextTool,
} from "./restore-context.js";
import { ListContextsToolSchema, executeListContextsTool } from "./list-contexts.js";
import { ReflectToolSchema, executeReflectTool } from "./reflect.js";
import { SaveArtifactToolSchema, executeSaveArtifactTool } from "./save-artifact.js";
import {
  RetrieveArtifactToolSchema,
  executeRetrieveArtifactTool,
} from "./retrieve-artifact.js";
import { ListArtifactsToolSchema, executeListArtifactsTool } from "./list-artifacts.js";
import {
  DeleteArtifactToolSchema,
  executeDeleteArtifactTool,
} from "./delete-artifact.js";
import { AwakenToolSchema, executeAwakenTool } from "./awaken.js";

export function registerPenfieldTools(
  api: OpenClawPluginApi,
  ensureRuntime: () => Promise<PenfieldRuntime>
) {
  const json = (payload: unknown) => ({
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: payload,
  });

  const registerTool = (
    name: string,
    label: string,
    description: string,
    schema: unknown,
    execute: (client: PenfieldApiClient, params: unknown) => Promise<unknown>
  ) => {
    api.registerTool({
      name,
      label,
      description,
      parameters: schema,
      async execute(_toolCallId, params) {
        try {
          const rt = await ensureRuntime();
          return await execute(rt.apiClient, params);
        } catch (err) {
          return json({
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },
    });
  };

  // Register all 16 tools
  registerTool(
    "penfield_store",
    "Store Memory",
    "Store a new memory in Penfield",
    StoreToolSchema,
    executeStoreTool
  );

  registerTool(
    "penfield_recall",
    "Recall Memories",
    "Search memories using hybrid BM25 + vector + graph search",
    RecallToolSchema,
    executeRecallTool
  );

  registerTool(
    "penfield_search",
    "Search Memories",
    "Semantic search for memories",
    SearchToolSchema,
    executeSearchTool
  );

  registerTool(
    "penfield_fetch",
    "Fetch Memory",
    "Get a specific memory by ID",
    FetchToolSchema,
    executeFetchTool
  );

  registerTool(
    "penfield_update_memory",
    "Update Memory",
    "Update an existing memory",
    UpdateMemoryToolSchema,
    executeUpdateMemoryTool
  );

  registerTool(
    "penfield_connect",
    "Connect Memories",
    "Create a relationship between two memories",
    ConnectToolSchema,
    executeConnectTool
  );

  registerTool(
    "penfield_explore",
    "Explore Graph",
    "Traverse the knowledge graph from a starting memory",
    ExploreToolSchema,
    executeExploreTool
  );

  registerTool(
    "penfield_save_context",
    "Save Context",
    "Save a checkpoint of current memory state",
    SaveContextToolSchema,
    executeSaveContextTool
  );

  registerTool(
    "penfield_restore_context",
    "Restore Context",
    "Restore a previously saved checkpoint",
    RestoreContextToolSchema,
    executeRestoreContextTool
  );

  registerTool(
    "penfield_list_contexts",
    "List Contexts",
    "List all saved checkpoints",
    ListContextsToolSchema,
    executeListContextsTool
  );

  registerTool(
    "penfield_reflect",
    "Reflect",
    "Analyze memory patterns and generate insights",
    ReflectToolSchema,
    executeReflectTool
  );

  registerTool(
    "penfield_save_artifact",
    "Save Artifact",
    "Save a file artifact to Penfield storage",
    SaveArtifactToolSchema,
    executeSaveArtifactTool
  );

  registerTool(
    "penfield_retrieve_artifact",
    "Retrieve Artifact",
    "Retrieve a file artifact from Penfield storage",
    RetrieveArtifactToolSchema,
    executeRetrieveArtifactTool
  );

  registerTool(
    "penfield_list_artifacts",
    "List Artifacts",
    "List artifacts in a directory",
    ListArtifactsToolSchema,
    executeListArtifactsTool
  );

  registerTool(
    "penfield_delete_artifact",
    "Delete Artifact",
    "Delete a file artifact from Penfield storage",
    DeleteArtifactToolSchema,
    executeDeleteArtifactTool
  );

  registerTool(
    "penfield_awaken",
    "Awaken",
    "Load personality configuration and identity core",
    AwakenToolSchema,
    executeAwakenTool
  );
}
