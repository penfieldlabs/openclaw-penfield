import { setTimeout as delay } from "node:timers/promises";
import { Type } from "typebox";
import { httpsUrl, parseSchema } from "./schema.js";
import { PenfieldError, requestJson } from "./http.js";

import { loadClientId, saveClientId, withCredentialLock, type StorageHost } from "./store.js";

const nonempty = Type.String({ minLength: 1 });
const positive = Type.Number({ exclusiveMinimum: 0 });
const tokenSchema = Type.Object({
  access_token: nonempty,
  refresh_token: Type.Optional(Type.Union([nonempty, Type.Null()])),
  expires_in: positive,
  scope: Type.Optional(Type.String()),
});
export function parseTokens(value: unknown) {
  return parseSchema(tokenSchema, value, "Penfield token response");
}
const metadata = Type.Object({
  issuer: httpsUrl,
  token_endpoint: httpsUrl,
  registration_endpoint: Type.Optional(httpsUrl),
  device_authorization_endpoint: Type.Optional(httpsUrl),
  revocation_endpoint: Type.Optional(httpsUrl),
});
const clientSchema = Type.Object({ client_id: nonempty });
const deviceSchema = Type.Object({
  device_code: nonempty,
  user_code: nonempty,
  verification_uri: httpsUrl,
  verification_uri_complete: Type.Optional(httpsUrl),
  expires_in: positive,
  interval: Type.Optional(positive),
});
export async function discoverEndpoints(apiUrl: string) {
  return parseSchema(
    metadata,
    await requestJson(new URL("/.well-known/oauth-authorization-server", apiUrl)),
    "OAuth discovery metadata"
  );
}

const scope = "read write delete offline_access";

async function registerClient(endpoint: string | undefined) {
  if (!endpoint) throw new Error("The server does not advertise dynamic registration.");
  const result = await requestJson(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "OpenClaw (Penfield plugin)",
      redirect_uris: ["http://localhost:8080/callback"],
      grant_types: ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope,
    }),
  });
  return parseSchema(clientSchema, result, "OAuth client registration").client_id;
}

export function isInvalidClient(err: unknown): boolean {
  return err instanceof PenfieldError && err.code === "invalid_client";
}

export async function beginDeviceFlow(
  apiUrl: string,
  host: StorageHost,
  rejectedClientId?: string
) {
  const discovery = await discoverEndpoints(apiUrl);
  const endpoint = discovery.device_authorization_endpoint;
  if (!endpoint) throw new Error("The server does not advertise device sign-in.");
  return withCredentialLock(host, apiUrl, async () => {
    const saved = loadClientId(host, apiUrl);
    const register = async () => {
      const id = await registerClient(discovery.registration_endpoint);
      saveClientId(host, apiUrl, id);
      return id;
    };
    const authorize = async (clientId: string) => {
      const device = parseSchema(
        deviceSchema,
        await requestJson(endpoint, {
          method: "POST",
          body: new URLSearchParams({ client_id: clientId, scope }),
        }),
        "device authorization response"
      );
      return {
        clientId,
        device,
        tokenEndpoint: discovery.token_endpoint,
        expiresAt: Date.now() + device.expires_in * 1000,
      };
    };
    if (saved && saved !== rejectedClientId) {
      try {
        return await authorize(saved);
      } catch (err) {
        if (!isInvalidClient(err)) throw err;
      }
    }
    return authorize(await register());
  });
}

export async function pollDeviceFlow(pending: Awaited<ReturnType<typeof beginDeviceFlow>>) {
  let interval = (pending.device.interval ?? 5) * 1000;
  while (Date.now() < pending.expiresAt) {
    await delay(Math.min(interval, pending.expiresAt - Date.now()));
    const remaining = pending.expiresAt - Date.now();
    if (remaining <= 0) break;
    try {
      const response = await requestJson(pending.tokenEndpoint, {
        method: "POST",
        signal: AbortSignal.timeout(remaining),
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: pending.device.device_code,
          client_id: pending.clientId,
        }),
      });
      return parseTokens(response);
    } catch (err) {
      if (Date.now() >= pending.expiresAt) break;
      if (err instanceof PenfieldError) {
        if (err.code === "authorization_pending") continue;
        if (err.code === "slow_down") {
          interval += 5000;
          continue;
        }
        if (err.code === "invalid_grant" || err.code === "expired_token") break;
        if (err.code === "access_denied") throw new Error("Sign-in was denied.", { cause: err });
      }
      throw err;
    }
  }
  throw new Error("Device code expired. Run openclaw penfield login again.");
}
export async function refreshAccessToken(apiUrl: string, refresh: string, clientId: string) {
  const { token_endpoint } = await discoverEndpoints(apiUrl);
  return parseTokens(
    await requestJson(token_endpoint, {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refresh,
        client_id: clientId,
      }),
    })
  );
}
export async function revokeTokens(
  apiUrl: string,
  cred: { access: string; refresh?: string; clientId: string }
) {
  const { revocation_endpoint } = await discoverEndpoints(apiUrl);
  if (!revocation_endpoint) throw new Error("The server does not advertise token revocation.");
  for (const [hint, token] of [
    ["refresh_token", cred.refresh],
    ["access_token", cred.access],
  ]) {
    if (token)
      await requestJson(
        revocation_endpoint,
        {
          method: "POST",
          body: new URLSearchParams({
            client_id: cred.clientId,
            token,
            token_type_hint: hint!,
          }),
        },
        undefined,
        true
      );
  }
}
