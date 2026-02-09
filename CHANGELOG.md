# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.2] - 2026-02-09

### Added
- Auth warning injection: when the plugin is installed but not authenticated, the `before_agent_start` hook injects an ACTION REQUIRED message via `prependContext`, telling the agent to instruct the user to run `openclaw penfield login` and restart the gateway
- Two detection paths: `ensureRuntime()` failure (runtime can't initialize) and `isAuthenticated()` check (runtime initializes but API calls fail)
- `AUTH_WARNING_CONTEXT` constant for single-source-of-truth warning message

## [1.1.1] - 2026-02-09

### Fixed
- `penfield_save_context` rewritten — old endpoint (`POST /api/v2/checkpoint/create`) returned 410 Gone. Now stores checkpoints as `POST /api/v2/memories` with `memory_type: "checkpoint"`, matching MCP server format exactly. Params: `name` (required), `description` (optional), `memory_ids` (optional). Memory linking via three combined sources: explicit `memory_ids` parameter, `memory_id: <uuid>` patterns extracted from description, and hybrid search. Checkpoint format is fully interoperable with MCP server checkpoints.
- `penfield_restore_context` rewritten — old endpoint (`POST /api/v2/checkpoint/{id}/recall`) returned 404. Now resolves checkpoints by name, UUID, or "awakening" keyword. Fetches referenced memories individually. New params: `name` (required), `limit` (optional).
- Updated tool descriptions for save_context and restore_context
- All memory ID parameters now consistently document "(UUID format)" in tool descriptions (fetch, update_memory, explore, save_context — aligning with connect which already had it)
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
- Context injected every turn via `prependContext` (system prompt, not message history — matches OpenClaw's memory-lancedb pattern)

### Architecture Notes
- Only `before_agent_start` hook used (confirmed dispatched in OpenClaw 2026.02.6)
- Pre-compaction memory saves handled by OpenClaw's built-in `memoryFlush` feature, not custom hooks
- 9 of 14 OpenClaw plugin hooks are scaffolded but never dispatched — only 5 fire at runtime

### Fixed
- `penfield_reflect` aligned with MCP API — accepts all 8 time_window values, adds `start_date`/`end_date`/`include_documents`, removes ghost params `focus_areas` and `memory_types`
- `penfield_list_contexts` switched from wrong endpoint (`GET /api/v2/checkpoint`) to correct one (`GET /api/v2/memories?memory_type=checkpoint`) — fixes missing contexts for users with >20 saved checkpoints
- `penfield_list_contexts` adds `offset`, `name_pattern`, `include_descriptions` params with proper API-side pagination
- Request timeout increased from 10s to 30s — prevents false timeouts on heavier operations (reflect, recall with graph expansion)
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

[1.1.2]: https://github.com/penfieldlabs/openclaw-penfield/releases/tag/v1.1.2
[1.1.1]: https://github.com/penfieldlabs/openclaw-penfield/releases/tag/v1.1.1
[1.1.0]: https://github.com/penfieldlabs/openclaw-penfield/releases/tag/v1.1.0
[1.0.6]: https://github.com/penfieldlabs/openclaw-penfield/releases/tag/v1.0.6
[1.0.5]: https://github.com/penfieldlabs/openclaw-penfield/releases/tag/v1.0.5
[1.0.4]: https://github.com/penfieldlabs/openclaw-penfield/releases/tag/v1.0.4
[1.0.3]: https://github.com/penfieldlabs/openclaw-penfield/releases/tag/v1.0.3
[1.0.2]: https://github.com/penfieldlabs/openclaw-penfield/releases/tag/v1.0.2
[1.0.1]: https://github.com/penfieldlabs/openclaw-penfield/releases/tag/v1.0.1
