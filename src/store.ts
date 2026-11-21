import { randomUUID, createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  openSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export interface StorageHost {
  id: string;
  logger?: { warn(message: string): void };
  runtime?: { state?: { resolveStateDir(): string } };
  resolvePath(path: string): string;
}

export interface CredentialFile {
  version: number;
  clientId: string;
  access: string;
  refresh?: string;
  expires: number;
  scope?: string;
  createdAt: number;
}

export const production = "https://api.penfield.app";
const stateDir = (api: StorageHost) =>
  api.runtime?.state?.resolveStateDir() ??
  api.resolvePath(process.env.OPENCLAW_STATE_DIR || "~/.openclaw");
export function credentialPath(api: StorageHost, apiUrl: string) {
  const key = createHash("sha256").update(new URL(apiUrl).origin).digest("hex").slice(0, 24);
  return join(stateDir(api), "credentials", api.id, key + ".json");
}
function legacyPath(api: StorageHost) {
  return join(stateDir(api), "extensions", api.id, "credentials.json");
}
export function claims(access: string): { scopes?: string[]; scope?: string; iss?: string } {
  try {
    const value = JSON.parse(Buffer.from(access.split(".")[1], "base64url").toString());
    if (!value || typeof value !== "object") return {};
    const result: { scopes?: string[]; scope?: string; iss?: string } = {};
    if (typeof value.iss === "string") result.iss = value.iss;
    if (typeof value.scope === "string") result.scope = value.scope;
    if (Array.isArray(value.scopes))
      result.scopes = value.scopes.filter((s: unknown) => typeof s === "string");
    return result;
  } catch {
    return {};
  }
}
class InvalidCredential extends Error {}
function read(path: string): CredentialFile | null {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  let record;
  try {
    record = JSON.parse(raw);
  } catch {
    /* Keep stored text out of parser diagnostics. */
  }
  if (
    record?.version === 1 &&
    typeof record.access === "string" &&
    record.access &&
    typeof record.clientId === "string" &&
    record.clientId &&
    (record.refresh == null || typeof record.refresh === "string") &&
    (record.scope == null || typeof record.scope === "string") &&
    Number.isFinite(record.expires)
  )
    return record as CredentialFile;
  throw new InvalidCredential("Invalid saved Penfield login. Sign in again.");
}
function legacy(api: StorageHost, apiUrl: string) {
  const cred = read(legacyPath(api));
  if (!cred) return null;
  const issuer = claims(cred.access).iss;
  const origin = new URL(apiUrl).origin;
  if (origin === production && (issuer === "https://auth.penfield.app" || issuer === production))
    return cred;
  if (
    origin === "https://api-dev.penfield.app" &&
    (issuer === "https://auth-dev.penfield.app" || issuer === origin)
  )
    return cred;
  return null;
}
export function loadCredential(api: StorageHost, apiUrl: string) {
  return read(credentialPath(api, apiUrl)) ?? legacy(api, apiUrl);
}
export function savedLogins(api: StorageHost, apiUrl: string) {
  const current = read(credentialPath(api, apiUrl));
  const previous = legacy(api, apiUrl);
  if (!current) return previous ? [previous] : [];
  if (previous && (previous.access !== current.access || previous.refresh !== current.refresh))
    return [current, previous];
  return [current];
}
function ensurePrivateDirectory(path: string) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  chmodSync(dirname(path), 0o700);
}
export function saveCredential(
  api: StorageHost,
  value: Omit<CredentialFile, "version" | "createdAt">,
  apiUrl: string
) {
  const path = credentialPath(api, apiUrl);
  writePrivateJson(path, { ...value, version: 1, createdAt: Date.now() });
}

function writePrivateJson(path: string, value: unknown) {
  ensurePrivateDirectory(path);
  const tmp = path + "." + randomUUID();
  try {
    writeFileSync(tmp, JSON.stringify(value), { mode: 0o600, flag: "wx" });
    renameSync(tmp, path);
  } finally {
    rmSync(tmp, { force: true });
  }
}

export function saveClientId(api: StorageHost, apiUrl: string, clientId: string) {
  writePrivateJson(credentialPath(api, apiUrl) + ".client", { client_id: clientId });
}
export function loadClientId(api: StorageHost, apiUrl: string): string | undefined {
  const path = credentialPath(api, apiUrl) + ".client";
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    // Older installations kept the client only inside the saved login.
    let id;
    try {
      id = loadCredential(api, apiUrl)?.clientId;
    } catch (err) {
      if (!(err instanceof InvalidCredential)) throw err;
    }
    if (id) saveClientId(api, apiUrl, id);
    return id;
  }
  let record;
  try {
    record = JSON.parse(raw);
  } catch {
    /* Do not echo stored data. */
  }
  if (typeof record?.client_id !== "string" || !record.client_id.trim())
    throw new Error("Invalid saved Penfield client registration. Check the profile's client file.");
  return record.client_id;
}
export function clearCredential(api: StorageHost, apiUrl: string) {
  if (legacy(api, apiUrl)) rmSync(legacyPath(api));
  rmSync(credentialPath(api, apiUrl), { force: true });
}
export async function withCredentialLock<T>(
  api: StorageHost,
  apiUrl: string,
  action: () => Promise<T>
): Promise<T> {
  const file = credentialPath(api, apiUrl);
  ensurePrivateDirectory(file);
  // A reserved SQLite lock belongs to this connection. The OS releases it if
  // the process exits. No credentials are stored in the lock database.
  const lockPath = file + ".lock";
  closeSync(openSync(lockPath, "a", 0o600));
  const { DatabaseSync } = await import("node:sqlite");
  const connection = new DatabaseSync(lockPath);
  const deadline = Date.now() + 90_000;
  try {
    for (;;) {
      try {
        connection.exec("BEGIN IMMEDIATE");
        break;
      } catch (err) {
        if ((err as { errcode?: number }).errcode !== 5) throw err;
        if (Date.now() >= deadline)
          throw new Error("Timed out waiting for another Penfield credential operation.", {
            cause: err,
          });
        await delay(100);
      }
    }
    return await action();
  } finally {
    connection.close();
  }
}
