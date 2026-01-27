/**
 * Background authentication service for Penfield plugin
 *
 * Handles OAuth 2.0 token refresh silently in the background
 * without agent involvement. Registered as a Clawdbot service.
 *
 * Supports RFC 8628 Device Code Flow and RFC 9700 Token Rotation.
 * For refresh tokens, use a DCR-registered client with offline_access scope.
 *
 * Service lifecycle:
 * - start(): Load credentials, begin background refresh loop
 * - stop(): Clear refresh interval, cleanup
 */

import { loadCredential, saveCredential, TOKEN_EXPIRY_BUFFER_MS } from './store.js';
import { refreshAccessToken } from './device-flow.js';
import type { Logger } from './types.js';

// Refresh interval: check every 60 minutes
const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

export interface AuthService {
  /** Start the auth service and background refresh loop */
  start(): Promise<void>;
  /** Stop the service and cleanup */
  stop(): Promise<void>;
  /** Get a valid access token (cached or refreshed) */
  getAccessToken(): Promise<string>;
  /** Check if authenticated with valid credentials */
  isAuthenticated(): boolean;
}

interface AuthServiceOptions {
  authUrl: string;
  /** Optional clientId - will be loaded from credentials if not provided */
  clientId?: string;
}

export function createAuthService(
  api: { id: string; logger: Logger; resolvePath: (path: string) => string },
  options: AuthServiceOptions
): AuthService {
  const { authUrl, clientId: providedClientId } = options;
  const logger = api.logger;

  // In-memory token cache
  let accessToken: string | null = null;
  let refreshToken: string | null = null;
  let expiresAt: number = 0;
  let clientId: string | null = providedClientId || null;

  // Background refresh interval
  let refreshInterval: ReturnType<typeof setInterval> | null = null;
  let isRunning = false;

  /**
   * Load credentials from file into memory cache
   */
  function loadCredentials(): boolean {
    const cred = loadCredential(api);
    if (!cred) return false;

    accessToken = cred.access;
    refreshToken = cred.refresh || null;
    expiresAt = cred.expires;
    clientId = cred.clientId || clientId;
    return true;
  }

  /**
   * Save current in-memory tokens to file (RFC 9700 token rotation)
   */
  function saveTokensToFile(): void {
    if (accessToken && expiresAt > 0 && clientId) {
      saveCredential(api, {
        clientId,
        access: accessToken,
        refresh: refreshToken || undefined,  // May be undefined for non-DCR clients
        expires: expiresAt,
      });
    }
  }

  /**
   * Check if token is expired or about to expire
   */
  function isTokenExpired(): boolean {
    if (!accessToken || !expiresAt) return true;
    return Date.now() >= expiresAt - TOKEN_EXPIRY_BUFFER_MS;
  }

  /**
   * Perform OAuth token refresh using RFC 8628 + RFC 9700
   * Retry with exponential backoff on network errors
   */
  async function doRefreshAccessToken(): Promise<boolean> {
    if (!refreshToken) {
      logger.info('[penfield-auth] No refresh token - automatic refresh disabled');
      return false;
    }

    if (!clientId) {
      logger.warn('[penfield-auth] No clientId - cannot refresh token');
      return false;
    }

    const maxRetries = 3;
    let attempt = 0;
    const baseDelay = 1000; // 1 second

    while (attempt < maxRetries) {
      attempt++;

      try {
        const result = await refreshAccessToken(authUrl, refreshToken, clientId);

        // Update in-memory tokens (RFC 9700: always use new refresh token)
        accessToken = result.access_token;
        refreshToken = result.refresh_token || refreshToken;  // Rotate if provided
        expiresAt = Date.now() + result.expires_in * 1000;

        // Persist to file
        saveTokensToFile();

        if (attempt > 1) {
          logger.info(`[penfield-auth] Token refreshed successfully after ${attempt} attempts`);
        } else {
          logger.info('[penfield-auth] Token refreshed successfully');
        }
        return true;
      } catch (err) {
        const isNetworkError = err instanceof TypeError || String(err).includes('fetch') || String(err).includes('network');

        if (isNetworkError && attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1);
          logger.warn(`[penfield-auth] Network error on attempt ${attempt}/${maxRetries}, retrying in ${delay}ms: ${err}`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          logger.warn(`[penfield-auth] Token refresh failed: ${err}`);
          return false;
        }
      }
    }

    return false;
  }

  /**
   * Background refresh loop - runs every 60 minutes
   */
  async function backgroundRefresh(): Promise<void> {
    if (!isRunning) return;

    try {
      // Reload from file first (handles edge cases)
      const cred = loadCredential(api);
      if (!cred) {
        // No credentials yet - service is running but not authenticated
        return;
      }

      // Check if we need to refresh
      const msUntilExpiry = cred.expires - Date.now();
      if (msUntilExpiry < TOKEN_EXPIRY_BUFFER_MS) {
        await doRefreshAccessToken();
      }
    } catch (err) {
      // Log but don't crash - continue checking on next interval
      logger.warn(`[penfield-auth] Background refresh check failed: ${err}`);
    }
  }

  return {
    async start() {
      if (isRunning) return;

      // Load credentials from file
      const hasCreds = loadCredentials();

      if (hasCreds) {
        if (refreshToken) {
          logger.info('[penfield-auth] Credentials loaded, starting background refresh');
        } else {
          logger.info('[penfield-auth] Credentials loaded (no refresh token - manual re-auth required when expired)');
        }
      } else {
        logger.info('[penfield-auth] No credentials found, service running in unauthenticated mode');
      }

      // Start background refresh loop
      isRunning = true;
      refreshInterval = setInterval(backgroundRefresh, REFRESH_INTERVAL_MS);
    },

    async stop() {
      if (!isRunning) return;

      isRunning = false;

      if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
      }

      logger.info('[penfield-auth] Service stopped');
    },

    async getAccessToken(): Promise<string> {
      // Load from file if not in memory
      if (!accessToken || !expiresAt) {
        if (!loadCredentials()) {
          throw new Error('Not authenticated. Run: clawdbot penfield login');
        }
      }

      // Refresh if expired or about to expire
      if (isTokenExpired()) {
        // Try refresh first if we have a refresh token
        if (refreshToken) {
          const success = await doRefreshAccessToken();
          if (!success) {
            throw new Error('Token refresh failed. Run: clawdbot penfield login');
          }
        } else {
          throw new Error('Token expired. Run: clawdbot penfield login');
        }
      }

      return accessToken!;
    },

    isAuthenticated(): boolean {
      if (!accessToken || !expiresAt) {
        return loadCredentials();
      }
      // Even without refresh token, we're authenticated if we have a valid access token
      return Date.now() < expiresAt - TOKEN_EXPIRY_BUFFER_MS;
    },
  };
}
