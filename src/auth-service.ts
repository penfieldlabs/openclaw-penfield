import {
  beginDeviceFlow,
  isInvalidClient,
  pollDeviceFlow,
  refreshAccessToken,
  revokeTokens,
  parseTokens,
} from "./device-flow.js";
import { requestJson } from "./http.js";
import {
  claims,
  clearCredential,
  loadCredential,
  loadClientId,
  saveCredential,
  savedLogins,
  withCredentialLock,
  type StorageHost,
} from "./store.js";

export type AuthService = ReturnType<typeof createAuthService>;
export function createAuthService(api: StorageHost, options: { apiUrl: string; apiKey?: string }) {
  const { apiUrl, apiKey } = options;
  let exchange: Promise<string> | undefined;
  let cachedKey: { access: string; expires: number } | undefined;
  let scope: string[] = [];
  const granted = (token: string, reported?: string) => {
    const claim = claims(token);
    const values = reported?.split(/\s+/) ?? claim.scopes ?? claim.scope?.split(/\s+/) ?? [];
    return Array.isArray(values)
      ? values.filter((v): v is string => typeof v === "string" && !!v)
      : [];
  };

  async function getAccessToken(force = false): Promise<string> {
    if (apiKey) {
      if (!force && cachedKey && cachedKey.expires > Date.now() + 30_000) return cachedKey.access;
      exchange ??= (async () => {
        const response = await requestJson<{ data?: unknown }>(
          new URL("/api/v2/auth/token", apiUrl),
          {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
          }
        );
        const result = parseTokens(response?.data ?? response);
        scope = granted(result.access_token, result.scope);
        cachedKey = { access: result.access_token, expires: Date.now() + result.expires_in * 1000 };
        return result.access_token;
      })().finally(() => {
        exchange = undefined;
      });
      return exchange;
    }
    const read = () => {
      const cred = loadCredential(api, apiUrl);
      if (!cred) throw new Error("Sign in with openclaw penfield login.");
      scope = granted(cred.access, cred.scope);
      return cred;
    };
    const previous = read();
    const usable = (c: typeof previous) => c.expires > Date.now() + (c.refresh ? 60_000 : 0);
    if (!force && usable(previous)) return previous.access;
    return withCredentialLock(api, apiUrl, async () => {
      const current = read();
      if (
        usable(current) &&
        (!force || current.access !== previous.access || current.refresh !== previous.refresh)
      )
        return current.access;
      if (!current.refresh)
        throw new Error("Sign-in expired or cannot be refreshed. Run openclaw penfield login.");
      const result = await refreshAccessToken(apiUrl, current.refresh, current.clientId);
      scope = granted(result.access_token, result.scope);
      saveCredential(
        api,
        {
          clientId: current.clientId,
          access: result.access_token,
          refresh: result.refresh_token ?? current.refresh,
          expires: Date.now() + result.expires_in * 1000,
          scope: scope.join(" "),
        },
        apiUrl
      );
      return result.access_token;
    });
  }
  return {
    getAccessToken,
    getScopes: () => scope,
    discardRejectedKeyToken(access: string) {
      if (cachedKey?.access === access) cachedKey = undefined;
    },
    mode: apiKey ? "API key" : "browser sign-in",
    async login(prompt: (message: string) => void) {
      let pending = await beginDeviceFlow(apiUrl, api);
      const approve = () => {
        prompt(`Visit ${pending.device.verification_uri} and enter ${pending.device.user_code}.`);
        return pollDeviceFlow(pending);
      };
      let result;
      try {
        result = await approve();
      } catch (err) {
        if (!isInvalidClient(err)) throw err;
        pending = await beginDeviceFlow(apiUrl, api, pending.clientId);
        result = await approve();
      }
      const permissions = granted(result.access_token, result.scope);
      await withCredentialLock(api, apiUrl, async () =>
        saveCredential(
          api,
          {
            access: result.access_token,
            refresh: result.refresh_token ?? undefined,
            clientId: pending.clientId,
            expires: Date.now() + result.expires_in * 1000,
            scope: permissions.join(" "),
          },
          apiUrl
        )
      );
      return permissions;
    },
    async logout() {
      return withCredentialLock(api, apiUrl, async () => {
        const saved = savedLogins(api, apiUrl);
        if (!saved.length) return false;
        for (const cred of saved) await revokeTokens(apiUrl, cred);
        // Preserve an older registration if possible. A separate client cache
        // must never prevent revocation or clearing the signed-out session.
        try {
          loadClientId(api, apiUrl);
        } catch {
          api.logger?.warn(
            "Browser tokens revoked. Check the saved Penfield client registration before signing in again."
          );
        }
        clearCredential(api, apiUrl);
        return true;
      });
    },
  };
}
