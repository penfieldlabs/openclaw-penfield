# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.3] - 2026-01-27

### Fixed
- Include clawdbot.plugin.json in npm package  

## [1.0.2] - 2026-01-27

### Changed
- Plugin ID changed from `penfield` to `clawdbot-penfield` to match npm package name
- Credential storage path now dynamically follows plugin ID

### Fixed
- Warning flood caused by plugin ID mismatch with installation folder

## [1.0.1] - 2026-01-27

### Added
- Initial public release
- Native Clawdbot plugin with 4-5x performance over MCP approach
- OAuth 2.0 Device Code Flow authentication (RFC 8628)
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

[1.0.3]: https://github.com/penfieldlabs/clawdbot-penfield/releases/tag/v1.0.3
[1.0.2]: https://github.com/penfieldlabs/clawdbot-penfield/releases/tag/v1.0.2
[1.0.1]: https://github.com/penfieldlabs/clawdbot-penfield/releases/tag/v1.0.1
