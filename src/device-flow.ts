/**
 * RFC 8628 Device Code Flow implementation for Penfield OAuth
 *
 * Discovers endpoints dynamically from /.well-known/oauth-authorization-server
 */

export interface DeviceFlowParams {
  /** Base URL of Penfield Auth service (e.g., https://auth.penfield.app) */
  authUrl: string;
  /** OAuth client ID (optional - will register if not provided) */
  clientId?: string;
  /** Prompter for showing messages to user */
  prompter: { info(msg: string): void; warn(msg: string): void; error(msg: string): void };
  /** Optional: open URL in browser */
  openUrl?: (url: string) => Promise<void>;
}

export interface DeviceFlowResult {
  clientId: string;       // The client_id used (registered or provided)
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

interface OAuthDiscovery {
  issuer: string;
  token_endpoint: string;
  device_authorization_endpoint?: string;
  registration_endpoint?: string;
  scopes_supported: string[];
}

interface ClientRegistration {
  client_id: string;
  client_id_issued_at: number;
  client_name: string;
  grant_types: string[];
  response_types: string[];
  scope: string;
}

/**
 * Discover OAuth endpoints from .well-known/oauth-authorization-server
 */
async function discoverEndpoints(authUrl: string): Promise<OAuthDiscovery> {
  const response = await fetch(`${authUrl}/.well-known/oauth-authorization-server`);
  if (!response.ok) {
    throw new Error(`Failed to discover OAuth endpoints: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Register a dynamic client (DCR) if clientId not provided
 * Returns the client_id to use
 */
async function getOrRegisterClient(
  authUrl: string,
  providedClientId?: string,
  prompter?: { info(msg: string): void }
): Promise<string> {
  if (providedClientId) {
    return providedClientId;
  }

  // Discover endpoints dynamically (RFC 8414)
  const discovery = await discoverEndpoints(authUrl);

  // RFC 8414: registration_endpoint must be advertised if DCR is supported
  if (!discovery.registration_endpoint) {
    throw new Error(
      'Dynamic Client Registration not supported: registration_endpoint not advertised in OAuth discovery'
    );
  }
  const registrationEndpoint = discovery.registration_endpoint;

  const regResp = await fetch(registrationEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'clawdbot-penfield',
      redirect_uris: ['http://localhost:8080/callback'],
      grant_types: ['urn:ietf:params:oauth:grant-type:device_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: 'read write offline_access'
    })
  });

  if (!regResp.ok) {
    const error = await regResp.json().catch(() => ({}));
    throw new Error(`Client registration failed: ${error.error_description || error.error || regResp.statusText}`);
  }

  const client: ClientRegistration = await regResp.json();
  prompter?.info(`[penfield] Registered dynamic client: ${client.client_id}`);

  return client.client_id;
}

/**
 * Execute the complete OAuth Device Code Flow (RFC 8628)
 */
export async function executeDeviceFlow(params: DeviceFlowParams): Promise<DeviceFlowResult> {
  const { authUrl, clientId, prompter, openUrl } = params;

  // Discover endpoints dynamically
  const discovery = await discoverEndpoints(authUrl);
  const tokenEndpoint = discovery.token_endpoint;

  // Get or register client
  const actualClientId = await getOrRegisterClient(authUrl, clientId, prompter);

  // RFC 8628: device_authorization_endpoint must be advertised for device flow
  if (!discovery.device_authorization_endpoint) {
    throw new Error(
      'Device Authorization Grant not supported: device_authorization_endpoint not advertised in OAuth discovery'
    );
  }
  const deviceEndpoint = discovery.device_authorization_endpoint;

  // Request offline_access for refresh tokens (RFC 8628 + RFC 9700)
  const scope = 'read write offline_access';

  // Step 1: Request device code (form-encoded per RFC 8628)
  const deviceResp = await fetch(deviceEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: actualClientId,
      scope
    })
  });

  if (!deviceResp.ok) {
    const error = await deviceResp.json().catch(() => ({}));
    throw new Error(`Device authorization failed: ${deviceResp.statusText}${error.error ? ` - ${error.error}` : ''}`);
  }

  const deviceData = await deviceResp.json();
  const { device_code, user_code, verification_uri_complete, expires_in, interval } = deviceData;

  // Step 2: Show user instructions
  prompter.info(`🔐 Penfield Authorization Required\n`);
  prompter.info(`To authorize, visit: ${verification_uri_complete || deviceData.verification_uri}`);
  prompter.info(`Or enter code: ${user_code}\n`);
  prompter.info(`Waiting for authorization...`);

  if (openUrl && verification_uri_complete) {
    try {
      await openUrl(verification_uri_complete);
    } catch {
      // Silently ignore openUrl failures
    }
  }

  // Step 3: Poll for token (form-encoded per RFC 8628)
  let pollInterval = interval || 5;
  const expiresAt = Date.now() + (expires_in * 1000);

  while (Date.now() < expiresAt) {
    await new Promise(resolve => setTimeout(resolve, pollInterval * 1000));

    const tokenResp = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code,
        client_id: actualClientId
      })
    });

    if (tokenResp.ok) {
      const tokens = await tokenResp.json();
      prompter.info('✅ Authorization successful!');
      return {
        clientId: actualClientId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in,
        scope: tokens.scope
      };
    }

    const error = await tokenResp.json().catch(() => ({}));

    if (error.error === 'authorization_pending') {
      continue;
    }

    if (error.error === 'slow_down') {
      pollInterval += 5;
      continue;
    }

    if (error.error === 'access_denied') {
      throw new Error('Authorization denied by user');
    }

    if (error.error === 'expired_token') {
      throw new Error('Device code expired - please try again');
    }

    // Provide meaningful error message
    const errorDesc = error.error_description || error.error || 'Unknown error';
    throw new Error(`Authorization failed: ${errorDesc}`);
  }

  throw new Error('Device code expired - please try again');
}

/**
 * Refresh an access token using a refresh token (RFC 8628 + RFC 9700)
 */
export async function refreshAccessToken(
  authUrl: string,
  refreshToken: string,
  clientId: string
): Promise<DeviceFlowResult> {
  // Discover token endpoint dynamically
  const discovery = await discoverEndpoints(authUrl);
  const tokenEndpoint = discovery.token_endpoint;

  const tokenResp = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId
    })
  });

  if (!tokenResp.ok) {
    const error = await tokenResp.json().catch(() => ({}));
    throw new Error(`Token refresh failed: ${error.error_description || error.error || tokenResp.statusText}`);
  }

  const tokens = await tokenResp.json();
  return {
    clientId,  // Pass through the clientId
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token, // RFC 9700: token rotation - use new refresh token
    expires_in: tokens.expires_in,
    scope: tokens.scope
  };
}
