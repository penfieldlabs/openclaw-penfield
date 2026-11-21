import { Type } from "typebox";
import { httpsUrl, parseSchema } from "./schema.js";
import { production } from "./store.js";

export const configSchema = Type.Object(
  {
    apiUrl: Type.Optional(httpsUrl),
    authUrl: Type.Optional(httpsUrl),
    apiKey: Type.Optional(Type.String({ minLength: 1, pattern: "\\S" })),
    autoAwaken: Type.Optional(Type.Boolean({ default: true })),
    compactionFlush: Type.Optional(Type.Boolean({ default: false })),
    autoOrient: Type.Optional(Type.Boolean({ default: true })),
  },
  { additionalProperties: false }
);
export function parseConfig(value: unknown) {
  const config = parseSchema(configSchema, value, "Penfield configuration");
  return {
    ...config,
    apiKey: config.apiKey?.trim(),
    autoAwaken: config.autoAwaken ?? true,
    compactionFlush: config.compactionFlush ?? false,
    autoOrient: config.autoOrient ?? true,
  };
}
export type PenfieldConfig = ReturnType<typeof parseConfig>;
export function connectionOptions(config: PenfieldConfig, env: NodeJS.ProcessEnv = process.env) {
  const legacy = config.authUrl ?? env.PENFIELD_AUTH_URL;
  let apiUrl = config.apiUrl ?? env.PENFIELD_API_URL;
  if (!apiUrl && legacy) {
    const origin = new URL(legacy).origin;
    if (origin === "https://auth-dev.penfield.app") apiUrl = "https://api-dev.penfield.app";
    else if (origin !== "https://auth.penfield.app")
      throw new Error("Set apiUrl for OAuth discovery on a custom Penfield server.");
  }
  apiUrl ??= production;
  const url = new URL(apiUrl);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Penfield apiUrl must be an HTTPS origin.");
  }
  const key = config.apiKey ?? env.PENFIELD_API_KEY;
  if (key !== undefined && !key.trim())
    throw new Error(
      "The configured API key is empty. Supply a key or unset it to use browser sign-in."
    );
  return { apiUrl: url.origin, apiKey: key?.trim() };
}
