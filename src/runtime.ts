import type { AuthService } from "./auth-service.js";
import type { PenfieldApiClient } from "./api-client.js";

export interface PenfieldRuntime {
  apiClient: PenfieldApiClient;
  authService: AuthService;
}
