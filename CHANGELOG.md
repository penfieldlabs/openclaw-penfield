# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 3.0.0 - 2026-11-21

- Enable automatic awaken and orient with `openclaw config set plugins.entries.openclaw-penfield.hooks.allowConversationAccess true` and restart the gateway. Status identifies a blocked hook independently of the login result. Concurrent turns and cached context respect each turn's tool policy.
- Add opt-in pre-compaction saving with `compactionFlush`, disabled by default. OpenClaw can recall existing records and save one durable memory per flush cycle. Matching content, including whitespace and line endings, returns the original receipt on retry. Confirmed saves retain their memory IDs for seven days. Retries fetch that ID directly, even when the tag index is stale. A missing saved memory returns an error. After seven days only a digest is retained for an unresolved write to prevent replay. Different content in the same flush cycle returns an error and leaves the first memory intact. This replaces the 2.x manual flush setup.
- Restore the 30-second HTTP deadline for slow recall, reflection and graph requests. Only GET requests retry transient failures.
- Check the build and offline suite before npm publication and pin the workflow actions to reviewed revisions.
- Installing Penfield selects it for the memory slot, replacing the built-in file-backed provider. After verifying Penfield, disable the memory-core entry to stop built-in writes, dreaming and standing intents. To restore built-in memory and turn Penfield off, re-enable that entry and set `plugins.slots.memory` to `memory-core` and restart the gateway. Existing workspace notes are preserved.
- Preserve old workspace memory in a separate archive before reducing the startup file to a header. Read old notes on demand and save useful facts in Penfield.
- Validate each tag after cleaning and reject the request if any tag falls outside 2 to 50 characters. Memories accept ten distinct tags after cleaning, in first-seen order. Checkpoints preserve the original name and add a name tag when the cleaned form is valid. Saving checks for an exact duplicate before search or creation. A write-only login can save with a warning when it cannot check the name. Validate portal-managed memory types and accepted write and search sources before making requests.
- Reuse the private OAuth client registration for each API origin across sign-ins and logout. Replace a rejected client and request a fresh approval.
- Active Memory discovers two read-only Penfield tools, `penfield_recall` and `penfield_fetch`. OpenClaw retains control over dreaming and per-turn tool permissions.
- Set the host minimum to OpenClaw 2026.10.33. Verify packaged installations on extended stable, 2026.11.6 and the 2026.11.10-beta.1 preview. The authoring validator now checks all 17 tool contracts against the package's actual schemas.
- Lead with browser sign-in. Add optional scope-limited API keys, verified status, explicit renewal, and server-side logout. Status checks the active login with Penfield and confirms read access to a protected endpoint.
- Discover OAuth endpoints from the API origin. Bind browser credentials to their origin and coordinate refresh across processes. Older records without an identifiable issuer require sign-in again.
- Use the current permission-aware prompt hook. Cap context size and wait time, skip incognito turns, and discard stale cached context.
- Preserve scope and validation errors. Correct checkpoint pagination, search enrichment, rolling reflection windows, graph strength filtering, and artifact listing limits.
- Return compact receipts for memory writes and compact search, reflection, and graph details. Fetch individual memories for full text. Artifact MIME is server-detected, so the old override is removed.
- Add offline tests and isolated dev and explicitly enabled production contract tests.

## [2.0.0] - 2026-03-13

### Added

- `penfield_disconnect` tool - remove a relationship between two memories via `DELETE /api/v2/relationships/between`. Mirrors the MCP disconnect tool. Parameters: `from_memory_id` (UUID), `to_memory_id` (UUID). Returns 204 on success, 404 if no relationship exists.
- Integration test for disconnect tool (`tests/disconnect-tool.sh`) - creates memories, connects, disconnects, verifies cleanup, deletes test data
- Response compaction for `penfield_recall`, `penfield_search`, `penfield_reflect`, and `penfield_explore` - strips debug fields (score_breakdown, search_metadata, knowledge_cloud, analyzed_query) and returns only essential fields, mirroring MCP server patterns. Reduces context token usage by 60-80% on search responses.
- `start_date` and `end_date` parameters on `penfield_recall` and `penfield_search` - ISO 8601 date filters passed through to the API's hybrid search endpoint
- `sort` parameter on `penfield_recall` and `penfield_search` - client-side sort by `"relevance"` (default), `"created_desc"`, or `"created_asc"`
- `max_content_length` parameter on `penfield_recall` and `penfield_search` - truncate memory content to N characters (50-10,000), with note to use `penfield_fetch` for full content
- `src/response-compact.ts` - shared compaction utilities: `compactRecallResponse`, `compactReflectResponse`, `compactExploreResponse`

### Fixed

- `api-client.ts`: Handle HTTP 204 No Content responses without attempting to parse an empty body. Previously, `response.json()` would throw `SyntaxError` on 204 responses from DELETE endpoints (`/api/v2/relationships/between`, `/api/v2/artifacts`). Now returns `{}` for 204 status.
- `penfield_disconnect`: Now returns a confirmation response (`success`, `from_id`, `to_id`, `message`) instead of empty `{}` on success
- `penfield_explore`: Returns a descriptive message when no connections exist (`"No connections found from this memory"`) instead of a bare empty paths array

### Changed

- Tool count: 16 → 17

## [1.1.2] - 2026-02-09

### Added

- Auth warning injection: when the plugin is installed but not authenticated, the `before_agent_start` hook injects an ACTION REQUIRED message via `prependContext`, telling the agent to instruct the user to run `openclaw penfield login` and restart the gateway
- Two detection paths: `ensureRuntime()` failure (runtime can't initialize) and `isAuthenticated()` check (runtime initializes but API calls fail)
- `AUTH_WARNING_CONTEXT` constant for single-source-of-truth warning message

## [1.1.1] - 2026-02-09

### Fixed

- `penfield_save_context` now stores checkpoints as `POST /api/v2/memories` with `memory_type: "checkpoint"`, matching MCP server format exactly. Params: `name` (required), `description` (optional), `memory_ids` (optional). Memory linking via three combined sources: explicit `memory_ids` parameter, `memory_id: <uuid>` patterns extracted from description, and hybrid search. Checkpoint format is fully interoperable with MCP server checkpoints.
- `penfield_restore_context` now resolves checkpoints by name, UUID, or "awakening" keyword. Fetches referenced memories individually. New params: `name` (required), `limit` (optional).
- Updated tool descriptions for save_context and restore_context
- All memory ID parameters now consistently document "(UUID format)" in tool descriptions (fetch, update_memory, explore, save_context - aligning with connect which already had it)
- Memory flush config warning wording improved (provides actionable instructions)

## [1.1.0] - 2026-02-09

### Added

- Lifecycle hooks via OpenClaw's typed plugin hook system (`api.on()`)
- **Auto-Awaken**: Injects Penfield identity briefing automatically via `before_agent_start` hook (30-min cache)
- **Auto-Orient**: Injects recent Penfield memory context (`reflect("recent")`) automatically (10-min cache)
- Config flag: `autoAwaken` (default `true`) controls identity briefing injection
- Config flag: `autoOrient` (default `true`) controls recent memory context injection
- Recommended memory flush config for pre-compaction saves via OpenClaw's built-in `memoryFlush`
- Diagnostic logging for awaken response shape debugging

### Changed

- Awaken briefing cached for 30 minutes (0ms after first load)
- Recent context cached for 10 minutes
- Awaken and reflect API calls fire in parallel for lower latency
- Context injected every turn via `prependContext` (system prompt, not message history - matches OpenClaw's memory-lancedb pattern)

### Architecture Notes

- Only `before_agent_start` hook used (confirmed dispatched in OpenClaw 2026.02.6)
- Pre-compaction memory saves handled by OpenClaw's built-in `memoryFlush` feature, not custom hooks
- 9 of 14 OpenClaw plugin hooks are scaffolded but never dispatched - only 5 fire at runtime

### Fixed

- `penfield_reflect` aligned with MCP API - accepts all 8 time_window values, adds `start_date`/`end_date`/`include_documents`, removes ghost params `focus_areas` and `memory_types`
- `penfield_list_contexts` switched from wrong endpoint (`GET /api/v2/checkpoint`) to correct one (`GET /api/v2/memories?memory_type=checkpoint`) - fixes missing contexts for users with >20 saved checkpoints
- `penfield_list_contexts` adds `offset`, `name_pattern`, `include_descriptions` params with proper API-side pagination
- Request timeout increased from 10s to 30s - prevents false timeouts on heavier operations (reflect, recall with graph expansion)
- Timeout errors now include endpoint context instead of raw `AbortError`
- ESLint 8 (EOL) upgraded to ESLint 9 with flat config; removes 6 deprecated transitive dependencies
- Documentation corrections across README, TEST_PROMPT, RELEASE, DEV_ENDPOINTS, AUTHENTICATION_NOTES

## [1.0.6] - 2026-02-01

### Fixed

- Prevent duplicate OpenClaw core installation when installing plugin
  - Added `peerDependenciesMeta` with `optional: true` for `openclaw` dependency
  - npm 7+ auto-installs peer dependencies by default; this fix tells npm to skip installation since OpenClaw is already present in the host environment

## [1.0.5] - 2026-01-30

### Fixed

- v1.0.4 npm package was missing build artifacts

## [1.0.4] - 2026-01-30

### Changed

- Rebranded from Clawdbot to OpenClaw
- Package renamed from `clawdbot-penfield` to `openclaw-penfield`
- Plugin ID changed from `clawdbot-penfield` to `openclaw-penfield`
- Credential storage path changed from `~/.clawdbot/extensions/` to `~/.openclaw/extensions/openclaw-penfield/`
- All CLI commands now use `openclaw` instead of `clawdbot`
- Manifest file renamed from `clawdbot.plugin.json` to `openclaw.plugin.json`

### Migration

- Users must re-authenticate with `openclaw penfield login`
- Previous credentials at `~/.clawdbot/` are not migrated automatically

## [1.0.3] - 2026-01-27

### Fixed

- Include openclaw.plugin.json in npm package

## [1.0.2] - 2026-01-27

### Changed

- Plugin ID changed from `penfield` to `clawdbot-penfield` to match npm package name
- Credential storage path now dynamically follows plugin ID

### Fixed

- Warning flood caused by plugin ID mismatch with installation folder

## [1.0.1] - 2026-01-27

### Added

- Initial public release
- Native OpenClaw plugin with 4-5x performance over MCP approach
- OAuth 2.1 Device Code Flow authentication (RFC 8628)
- Automatic Dynamic Client Registration (DCR)
- Token rotation with automatic refresh (RFC 9700)
- 240-minute token expiry buffer

### Memory Tools

- `penfield_store` - Store memories (max 10,000 chars)
- `penfield_recall` - Hybrid search (BM25 + vector + graph)
- `penfield_search` - Semantic search variant
- `penfield_fetch` - Get memory by ID
- `penfield_update_memory` - Update existing memory

### Knowledge Graph Tools

- `penfield_connect` - Create relationships (24 types)
- `penfield_explore` - Traverse knowledge graph

### Context Management

- `penfield_save_context` - Save checkpoint of memory state
- `penfield_restore_context` - Restore checkpoint
- `penfield_list_contexts` - List saved checkpoints

### Analysis

- `penfield_reflect` - Analyze memory patterns

### Artifact Storage

- `penfield_save_artifact` - Save file artifact
- `penfield_retrieve_artifact` - Retrieve file artifact
- `penfield_list_artifacts` - List artifacts
- `penfield_delete_artifact` - Delete artifact

### Personality

- `penfield_awaken` - Load personality configuration

[2.0.0]: https://github.com/penfieldlabs/openclaw-penfield/releases/tag/v2.0.0
[1.1.2]: https://github.com/penfieldlabs/openclaw-penfield/releases/tag/v1.1.2
[1.1.1]: https://github.com/penfieldlabs/openclaw-penfield/releases/tag/v1.1.1
[1.1.0]: https://github.com/penfieldlabs/openclaw-penfield/releases/tag/v1.1.0
[1.0.6]: https://github.com/penfieldlabs/openclaw-penfield/releases/tag/v1.0.6
[1.0.5]: https://github.com/penfieldlabs/openclaw-penfield/releases/tag/v1.0.5
[1.0.4]: https://github.com/penfieldlabs/openclaw-penfield/releases/tag/v1.0.4
[1.0.3]: https://github.com/penfieldlabs/openclaw-penfield/releases/tag/v1.0.3
[1.0.2]: https://github.com/penfieldlabs/openclaw-penfield/releases/tag/v1.0.2
[1.0.1]: https://github.com/penfieldlabs/openclaw-penfield/releases/tag/v1.0.1
