import type { AuthService } from "./auth-service.js";
import type { PluginLogger } from "./types.js";

export class PenfieldApiClient {
  constructor(
    private auth: AuthService,
    private apiUrl: string,
    private logger?: PluginLogger
  ) {}

  async request<T>(
    method: string,
    endpoint: string,
    body?: unknown,
    queryParams?: Record<string, string>
  ): Promise<T> {
    const token = await this.auth.getAccessToken();

    let url = `${this.apiUrl}${endpoint}`;
    if (queryParams) {
      const params = new URLSearchParams(queryParams);
      url += `?${params.toString()}`;
    }

    this.logger?.debug?.(`[penfield] ${method} ${endpoint}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        const msg = `Request timed out after 30s: ${method} ${endpoint}`;
        this.logger?.error?.(`[penfield] ${msg}`);
        throw new Error(msg);
      }
      throw err;
    }
    clearTimeout(timeoutId);

    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      throw new Error(`Rate limit exceeded. Retry after ${retryAfter} seconds`);
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const errorMessage =
        `API request failed: ${response.status} ${response.statusText}` +
        (error.error?.message ? ` - ${error.error.message}` : "");
      this.logger?.error(`[penfield] ${errorMessage}`);
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return (data.data || data) as T;
  }

  async get<T>(endpoint: string, queryParams?: Record<string, string>): Promise<T> {
    return this.request<T>("GET", endpoint, undefined, queryParams);
  }

  async post<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", endpoint, body);
  }

  async put<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", endpoint, body);
  }

  async delete<T>(endpoint: string, queryParams?: Record<string, string>): Promise<T> {
    return this.request<T>("DELETE", endpoint, undefined, queryParams);
  }
}
