import { toolPluginMetadataSymbol, type ToolPluginMetadata } from "openclaw/plugin-sdk/tool-plugin";
import { buildJsonPluginConfigSchema, definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { connectionOptions, configSchema, parseConfig } from "./src/config.js";
import { registerPenfieldTools, penfieldToolMetadata } from "./src/tools/index.js";
import { registerPenfieldHooks } from "./src/hooks.js";
import { registerLoginCommand } from "./src/cli.js";
import { createAuthService } from "./src/auth-service.js";
import { PenfieldApiClient } from "./src/api-client.js";

const identity = {
  id: "openclaw-penfield",
  name: "Penfield Memory",
  description: "Penfield memory, relationships, checkpoints, and artifacts",
};

const jsonConfig = { ...configSchema };
const plugin = definePluginEntry({
  ...identity,
  kind: "memory",
  configSchema: buildJsonPluginConfigSchema(jsonConfig),
  register(api) {
    const config = parseConfig(api.pluginConfig ?? {});
    const options = connectionOptions(config);
    const authService = createAuthService(api, options);
    const apiClient = new PenfieldApiClient(authService, options.apiUrl, api.logger);
    const runtime = { apiClient, authService };
    api.registerMemoryCapability({
      recallToolNames: ["penfield_recall", "penfield_fetch"],
      providerFlushPlanResolver: () =>
        config.compactionFlush
          ? {
              prompt:
                "Before compaction, recall relevant Penfield memories if needed. If there is new durable information, combine it into one concise memory and call penfield_store once. Otherwise finish silently.",
              systemPrompt:
                "Use Penfield for this save. Preserve decisions and their reasons. Omit secrets, transcripts and transient details. Leave room for one automatic tag.",
              persistenceToolNames: ["penfield_store"],
              lookupToolNames: ["penfield_recall"],
            }
          : null,
    });
    registerLoginCommand(api, runtime);
    registerPenfieldTools(api, apiClient, config.compactionFlush ? options.apiUrl : undefined);
    registerPenfieldHooks({ api, config, runtime });
  },
});

// The SDK validator reads static tool metadata. Use the same descriptors that
// register the tools while keeping the memory, hook and CLI entry points.
Object.defineProperty(plugin, toolPluginMetadataSymbol, {
  value: {
    ...identity,
    activation: { onStartup: true },
    configSchema: jsonConfig,
    tools: penfieldToolMetadata,
  } satisfies ToolPluginMetadata,
});
export default plugin;
