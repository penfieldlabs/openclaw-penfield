import { type AuthService } from "./auth-service.js";
import { PenfieldApiClient } from "./api-client.js";
import { DEFAULT_API_URL, type PenfieldConfig } from "./config.js";
import type { OpenClawPluginApi, PluginLogger } from "./types.js";

export interface PenfieldRuntime {
  config: PenfieldConfig;
  apiClient: PenfieldApiClient;
  authService: AuthService;
  stop: () => Promise<void>;
}

export interface CreateRuntimeParams {
  api: OpenClawPluginApi;
  config: PenfieldConfig;
  authService: AuthService;
  logger?: PluginLogger;
}

export async function createPenfieldRuntime(params: CreateRuntimeParams): Promise<PenfieldRuntime> {
  const { config, authService, logger } = params;

  logger?.info("[penfield] Initializing runtime");

  const apiUrl = config.apiUrl || DEFAULT_API_URL;

  // Create API client with existing auth service
  const apiClient = new PenfieldApiClient(authService, apiUrl, logger);

  return {
    config,
    apiClient,
    authService,
    async stop() {
      await authService.stop();
      logger?.info("[penfield] Runtime stopped");
    },
  };
}
