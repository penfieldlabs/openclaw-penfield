import type { AuthService } from "./auth-service.js";
import { requestJson, waitWithSignal, PenfieldError } from "./http.js";
import type { PluginLogger } from "./types.js";

export class PenfieldApiClient {
  constructor(
    private auth: AuthService,
    private apiUrl: string,
    private logger?: PluginLogger,
    private signal?: AbortSignal
  ) {}

  withSignal(signal?: AbortSignal) {
    return signal ? new PenfieldApiClient(this.auth, this.apiUrl, this.logger, signal) : this;
  }

  async request<T>(
    method: string,
    endpoint: string,
    body?: unknown,
    queryParams?: Record<string, string>,
    discardBody = false
  ): Promise<T> {
    this.signal?.throwIfAborted();
    const token = await waitWithSignal(this.auth.getAccessToken(), this.signal);
    this.signal?.throwIfAborted();
    const url = new URL(endpoint, this.apiUrl);
    if (url.origin !== new URL(this.apiUrl).origin) throw new Error("Expected a Penfield API path");
    for (const [key, value] of Object.entries(queryParams ?? {})) url.searchParams.set(key, value);
    this.logger?.debug?.(`[penfield] ${method} ${url.pathname}`);
    const payload = await requestJson<T | { data: T }>(
      url,
      {
        method,
        signal: this.signal,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      this.auth.getScopes(),
      discardBody
    ).catch((err) => {
      if (err instanceof PenfieldError && err.status === 401)
        this.auth.discardRejectedKeyToken(token);
      throw err;
    });
    return payload !== null && typeof payload === "object" && "data" in payload
      ? payload.data
      : (payload as T);
  }

  async checkReadAccess(): Promise<"allowed" | "restricted"> {
    try {
      await this.request("GET", "/api/v2/memories", undefined, { per_page: "1" }, true);
      return "allowed";
    } catch (err) {
      const grants = this.auth.getScopes();
      if (
        err instanceof PenfieldError &&
        err.status === 403 &&
        err.code === "AUTH_INSUFFICIENT_PERMISSIONS" &&
        grants.length > 0 &&
        !grants.includes("read")
      )
        return "restricted";
      throw err;
    }
  }

  get<T>(endpoint: string, params?: Record<string, string>) {
    return this.request<T>("GET", endpoint, undefined, params);
  }
  post<T>(endpoint: string, body?: unknown) {
    return this.request<T>("POST", endpoint, body);
  }
  put<T>(endpoint: string, body?: unknown) {
    return this.request<T>("PUT", endpoint, body);
  }
  delete<T>(endpoint: string, params?: Record<string, string>) {
    return this.request<T>("DELETE", endpoint, undefined, params);
  }
}
