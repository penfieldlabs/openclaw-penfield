import { DEFAULT_AUTH_URL, PenfieldConfigSchema, type PenfieldConfig } from "./src/config.js";
import { createPenfieldRuntime, type PenfieldRuntime } from "./src/runtime.js";
import { registerPenfieldTools } from "./src/tools/index.js";
import { registerLoginCommand } from "./src/cli.js";
import { createAuthService } from "./src/auth-service.js";
import type { ClawdbotPluginApi } from "./src/types.js";

const penfieldPlugin = {
  id: "penfield",
  name: "Penfield Memory",
  description: "Native Penfield memory integration with 16 tools for knowledge management",

  configSchema: {
    parse(value: unknown): PenfieldConfig {
      // Handle undefined/null when no config section exists
      if (value === undefined || value === null) {
        return {};
      }
      return PenfieldConfigSchema.parse(value);
    },
    uiHints: {
      enabled: {
        label: "Enable Penfield",
        help: "Enable Penfield memory integration",
      },
      authUrl: {
        label: "Auth URL",
        help: "Penfield Auth service URL (default: https://auth.penfield.app)",
      },
      apiUrl: {
        label: "API URL",
        help: "Penfield API URL (default: https://api.penfield.app)",
      },
    },
  },

  register(api: ClawdbotPluginApi) {
    const cfg = PenfieldConfigSchema.parse(api.pluginConfig ?? {});
    const logger = api.logger;

    // Runtime state - follows voice-call pattern
    let runtimePromise: Promise<PenfieldRuntime> | null = null;
    let runtime: PenfieldRuntime | null = null;

    // Create auth service (single instance)
    const authUrl = cfg.authUrl || DEFAULT_AUTH_URL;

    const authService = createAuthService(api, {
      authUrl,
      // clientId loaded from credentials on first login
    });

    // Lazy runtime initialization with race condition protection
    const ensureRuntime = async (): Promise<PenfieldRuntime> => {
      if (runtime) return runtime;
      if (!runtimePromise) {
        runtimePromise = createPenfieldRuntime({
          api,
          config: cfg,
          authService,
          logger,
        });
      }
      runtime = await runtimePromise;
      return runtime;
    };

    // Register CLI commands (penfield login)
    registerLoginCommand(api);

    // Register background auth service
    api.registerService({
      id: "penfield-auth",
      async start() {
        await authService.start();
        logger.info("[penfield-auth] Service started");
      },
      async stop() {
        await authService.stop();
        logger.info("[penfield-auth] Service stopped");
      },
    });

    // Register all 16 tools
    registerPenfieldTools(api, ensureRuntime);

    // Register service for runtime lifecycle
    api.registerService({
      id: "penfield",
      async start() {
        logger.info("[penfield] Service started");
      },
      async stop() {
        if (runtime) {
          await runtime.stop();
          runtime = null;
          runtimePromise = null;
        }
        logger.info("[penfield] Service stopped");
      },
    });
  },
};

export default penfieldPlugin;
