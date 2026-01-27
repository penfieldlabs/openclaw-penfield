/**
 * File-based credential storage for Penfield plugin
 *
 * Credentials are stored at: ~/.clawdbot/extensions/penfield/credentials.json
 * Directory permissions: 0o700 (only owner can access)
 * File permissions: 0o600 (only owner can read/write)
 */

import * as fs from 'fs';

// Credential storage paths
export const CRED_DIR = '~/.clawdbot/extensions/penfield';
export const CRED_FILE = `${CRED_DIR}/credentials.json`;

// Token buffer: refresh if token expires within 240 minutes (4 hours)
export const TOKEN_EXPIRY_BUFFER_MS = 240 * 60 * 1000;

export interface CredentialFile {
  version: number;        // Current: 1
  clientId: string;       // OAuth client ID (DCR-registered)
  access: string;
  refresh?: string;       // Optional - only for DCR clients with offline_access
  expires: number;        // Unix timestamp (milliseconds)
  createdAt: number;
}

/**
 * Save credentials to file with schema versioning
 */
export function saveCredential(
  api: { resolvePath(path: string): string; logger?: { info(...args: unknown[]): void; warn(...args: unknown[]): void; error(...args: unknown[]): void } },
  cred: Omit<CredentialFile, 'version' | 'createdAt'>
): void {
  const dirPath = api.resolvePath(CRED_DIR);
  const filePath = api.resolvePath(CRED_FILE);

  const content: CredentialFile = {
    version: 1,
    ...cred,
    createdAt: Date.now(),
  };

  // Create directory with restricted permissions (owner-only access)
  fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });

  // Atomic write: write to temp file, then rename (prevents corruption on crash)
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(content, null, 2), { mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
}

/**
 * Load credentials from file
 * Returns null if file doesn't exist or is corrupted
 */
export function loadCredential(
  api: { resolvePath(path: string): string }
): CredentialFile | null {
  const filePath = api.resolvePath(CRED_FILE);

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const content = JSON.parse(raw) as CredentialFile;

    if (content.version < 1) {
      throw new Error('Unsupported credential version');
    }

    return content;
  } catch {
    return null;
  }
}

/**
 * Check if we have valid (non-expired) credentials
 */
export function hasValidCredentials(
  api: { resolvePath(path: string): string }
): boolean {
  const cred = loadCredential(api);
  if (!cred) return false;

  // Check if expired (with buffer)
  return Date.now() < cred.expires - TOKEN_EXPIRY_BUFFER_MS;
}

/**
 * Get refresh token if available
 */
export function getRefreshToken(
  api: { resolvePath(path: string): string }
): string | null {
  const cred = loadCredential(api);
  return cred?.refresh || null;
}
