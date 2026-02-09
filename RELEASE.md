# Release Notes: openclaw-penfield v1.1.2

**Date:** February 9, 2026
**Type:** Patch Release (UX Improvement)

---

## Overview

Native OpenClaw plugin providing direct integration with Penfield's memory and knowledge graph API.

**v1.1.2 adds an auth warning for unauthenticated installs.** When the plugin is installed but not authenticated, the `before_agent_start` hook now injects an ACTION REQUIRED message into the agent's system prompt, telling it to instruct the user to run `openclaw penfield login`. Previously, unauthenticated installs silently failed with no feedback.

---

## Breaking Changes

- Package renamed: `clawdbot-penfield` → `openclaw-penfield`
- Plugin ID changed: `clawdbot-penfield` → `openclaw-penfield`
- Credential path changed: `~/.clawdbot/extensions/` → `~/.openclaw/extensions/`
- CLI commands: `clawdbot penfield` → `openclaw penfield`
- Manifest file: `clawdbot.plugin.json` → `openclaw.plugin.json`

**Migration:** Run `openclaw penfield login` to re-authenticate.

---

## What's New

### Performance
- Native HTTP client (no MCP overhead)
- 4-5x faster than mcporter → MCP → Penfield stack
- Lazy runtime initialization
- In-memory credential caching

### Authentication
- OAuth 2.1 Device Code Flow (RFC 8628)
- Automatic Dynamic Client Registration (DCR)
- Token rotation with automatic refresh (RFC 9700)
- 240-minute expiry buffer

### Memory Tools (5)
| Tool | Description |
|------|-------------|
| `penfield_store` | Store a new memory (max 10,000 chars) |
| `penfield_recall` | Hybrid search (BM25 + vector + graph) |
| `penfield_search` | Semantic search variant |
| `penfield_fetch` | Get memory by ID |
| `penfield_update_memory` | Update existing memory |

### Knowledge Graph Tools (2)
| Tool | Description |
|------|-------------|
| `penfield_connect` | Create relationships (24 types) |
| `penfield_explore` | Traverse knowledge graph |

### Context Management (3)
| Tool | Description |
|------|-------------|
| `penfield_save_context` | Save cognitive state checkpoint for agent handoff |
| `penfield_restore_context` | Restore checkpoint by name, UUID, or "awakening" |
| `penfield_list_contexts` | List saved checkpoints |

### Analysis (1)
| Tool | Description |
|------|-------------|
| `penfield_reflect` | Analyze memory patterns |

### Artifact Storage (4)
| Tool | Description |
|------|-------------|
| `penfield_save_artifact` | Save file artifact |
| `penfield_retrieve_artifact` | Retrieve file artifact |
| `penfield_list_artifacts` | List artifacts |
| `penfield_delete_artifact` | Delete artifact |

### Personality (1)
| Tool | Description |
|------|-------------|
| `penfield_awaken` | Load personality configuration |

---

## 24 Relationship Types

**Knowledge Evolution:** supersedes, updates, evolution_of

**Evidence & Support:** supports, contradicts, disputes

**Hierarchy & Structure:** parent_of, child_of, sibling_of, composed_of, part_of

**Cause & Prerequisites:** causes, influenced_by, prerequisite_for

**Implementation & Testing:** implements, documents, tests, example_of

**Conversation & Attribution:** responds_to, references, inspired_by

**Sequence & Flow:** follows, precedes

**Dependencies:** depends_on

---

## Installation

```bash
npm install openclaw-penfield
openclaw plugins install openclaw-penfield
```

Or from source:

```bash
git clone https://github.com/penfieldlabs/openclaw-penfield.git
cd openclaw-penfield
npm install
npm run build
openclaw plugins install -l .
```

---

## Authentication

```bash
openclaw penfield login
```

This will:
1. Discover OAuth endpoints from the auth server
2. Register a dynamic client (DCR) if needed
3. Display a device code for user authentication
4. Poll for token completion

Credentials stored at: `~/.openclaw/extensions/openclaw-penfield/credentials.json`
File permissions: `0o600` (owner-only)

---

## Requirements

- OpenClaw CLI
- Node.js 18+
- Penfield account (api.penfield.app)

---

## Credits

Author: Frank Fiegel

---

## Links

- Repository: https://github.com/penfieldlabs/openclaw-penfield
- Issues: https://github.com/penfieldlabs/openclaw-penfield/issues
- npm: https://www.npmjs.com/package/openclaw-penfield
