# Penfield Plugin - Authentication Notes

## RFC 8628 Device Code Flow Implementation

The plugin implements OAuth 2.0 Device Code Flow (RFC 8628) with dynamic endpoint discovery (RFC 8414).

### How It Works

1. **Dynamic Discovery** - Endpoints discovered from `/.well-known/oauth-authorization-server`
2. **Auto-Registration** - Plugin registers a dynamic client (DCR) on first login
3. **Device Flow** - User authenticates via device code
4. **Token Refresh** - Background refresh with RFC 9700 token rotation

### Token Types

| Type | Description | Storage |
|------|-------------|---------|
| clientId | DCR-registered client ID | `credentials.json` |
| access_token | JWT for API calls | `credentials.json` |
| refresh_token | For token rotation (RFC 9700) | `credentials.json` |

### Credentials File

```bash
~/.openclaw/extensions/openclaw-penfield/credentials.json
```

```json
{
  "version": 1,
  "clientId": "dyn_abc123...",
  "access": "eyJ...",
  "refresh": "eyJ...",
  "expires": 1234567890000,
  "createdAt": 1234567890000
}
```

File permissions: `0o600` (owner read/write only)

### Background Refresh

- **Check interval**: Every 60 minutes
- **Refresh trigger**: Token expires within 4 hours
- **Retry logic**: 3 attempts with exponential backoff (1s → 2s → 4s)
- **Token rotation**: New refresh token on each refresh (RFC 9700)

### Development vs Production

**Production** (default URLs):
```json
{
  "plugins": {
    "entries": {
      "penfield": {
        "enabled": true
      }
    }
  }
}
```

**Development** (custom URLs):
```json
{
  "plugins": {
    "entries": {
      "penfield": {
        "enabled": true,
        "config": {
          "authUrl": "https://auth-dev.penfield.app",
          "apiUrl": "https://api-dev.penfield.app"
        }
      }
    }
  }
}
```

### Files

- `src/device-flow.ts` - RFC 8628 device flow, RFC 9700 refresh, RFC 8414 discovery
- `src/auth-service.ts` - Background token refresh service
- `src/cli.ts` - `penfield login` CLI command
- `src/store.ts` - Credential file storage (0o600)

### Server Requirements

For background refresh to work, server must include in `/.well-known/oauth-authorization-server`:
- `grant_types_supported`: Must include `urn:ietf:params:oauth:grant-type:device_code`
- `registration_endpoint`: For DCR (or derive from token_endpoint)

## References

- RFC 8628: https://www.rfc-editor.org/rfc/rfc8628
- RFC 9700: https://www.rfc-editor.org/rfc/rfc9700 (Token Rotation)
- RFC 8414: https://www.rfc-editor.org/rfc/rfc8414 (OAuth Authorization Server Discovery)
- API Docs: `~/penfield-api-docs/endpoints/`
