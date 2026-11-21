# Authentication

Browser sign-in uses the OAuth device authorization grant. The CLI reads `/.well-known/oauth-authorization-server` on the selected API origin, reuses the profile’s public client for that API origin, requests a fresh device code, and prints the verification address and user code. Only the interactive login command polls. Pending authorization follows the server's interval. A slow-down response increases the interval. An expired or refused code ends the command.

A new client registers as `OpenClaw (Penfield plugin)`. The profile saves the client ID in an owner-only file before requesting a code. This lets a later sign-in reuse it after cancellation, expiry or logout. An existing origin-bound browser login supplies its original client ID when upgrading. The original registration keeps its earlier display name. If the server rejects a client as `invalid_client`, the plugin registers a replacement. If this happens while polling, approve the newly displayed code. Other server errors leave the client registration available for retry.

The token response determines the granted permissions. The CLI stores the browser access token, optional refresh token, client ID, expiry, and scope in the selected OpenClaw state directory. Each API origin has a separate credential file. The plugin directory is mode 700 and the credential file is mode 600. A unique temporary file and rename avoid partially written JSON.

When a caller needs a token, the plugin reloads the saved login. If a refresh is due it acquires a per-origin SQLite lock, reloads the file under that lock, and renews only if another process has not already done so. A process exit releases the lock. The lock database holds no tokens. The plugin never automatically replays a rotating refresh grant after an uncertain network outcome. A valid access token without a refresh token remains usable until expiry.

A configured API key takes priority. The plugin sends it as Bearer in an empty POST to `/api/v2/auth/token`. Concurrent callers share one exchange. The resulting access token remains in process memory. The plugin exchanges the configured key again when it needs a new access token. It reads the JWT permissions for display. The Penfield API enforces authorization.

`openclaw penfield status` checks the active login with Penfield and confirms read access to a protected memories endpoint. It reports the granted permissions. If the login is recognized but lacks the read permission, status reports restricted read access. The check discards the returned memory data.

Logout discovers the revocation endpoint, revokes the saved refresh and access tokens, and clears the local login only after successful server responses. If the profile holds both a current and a matching legacy sign-in, logout revokes both token pairs. If revocation fails, the command exits unsuccessfully and retains the local record for retry. Logout does not change a configured API key.

When upgrading, legacy credentials with an identifiable Penfield issuer are restricted to the matching environment. An older file without a recognized issuer requires a fresh browser sign-in. New sign-ins are stored only for the selected API origin.

Sources include the [Penfield API reference](https://docs.penfield.app/api/endpoints/authentication/), [OAuth device grant](https://www.rfc-editor.org/rfc/rfc8628), [authorization server metadata](https://www.rfc-editor.org/rfc/rfc8414), and [token revocation](https://www.rfc-editor.org/rfc/rfc7009).
