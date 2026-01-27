# Release Notes: clawdbot-penfield v1.0.1

**Date:** January 27, 2026
**Type:** Patch Release

---

## Overview

Native Clawdbot plugin providing direct integration with Penfield's memory and knowledge graph API. This release delivers full feature parity with the Penfield MCP server while offering 4-5x performance improvement through native HTTP.

---

## What's New

### Performance
- Native HTTP client (no MCP overhead)
- 4-5x faster than mcporter → MCP → Penfield stack
- Lazy runtime initialization
- In-memory credential caching

### Authentication
- OAuth 2.0 Device Code Flow (RFC 8628)
- Automatic Dynamic Client Registration (DCR)
- Token rotation with automatic refresh (RFC 9700)
- 240-minute expiry buffer

### Memory Tools (6)
| Tool | Description |
|------|-------------|
| `penfield_store` | Store a new memory (max 10,000 chars) |
| `penfield_recall` | Hybrid search (BM25 + vector + graph) |
| `penfield_search` | Semantic search variant |
| `penfield_fetch` | Get memory by ID |
| `penfield_update_memory` | Update existing memory |

### Knowledge Graph Tools (3)
| Tool | Description |
|------|-------------|
| `penfield_connect` | Create relationships (24 types) |
| `penfield_explore` | Traverse knowledge graph |

### Context Management (3)
| Tool | Description |
|------|-------------|
| `penfield_save_context` | Save checkpoint of memory state |
| `penfield_restore_context` | Restore checkpoint |
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
npm install clawdbot-penfield
clawdbot plugins install clawdbot-penfield
```

Or from source:

```bash
git clone https://github.com/penfieldlabs/clawdbot-penfield.git
cd clawdbot-penfield
npm install
npm run build
clawdbot plugins install -l .
```

---

## Authentication

```bash
clawdbot penfield login
```

This will:
1. Discover OAuth endpoints from the auth server
2. Register a dynamic client (DCR) if needed
3. Display a device code for user authentication
4. Poll for token completion

Credentials stored at: `~/.clawdbot/extensions/penfield/credentials.json`
File permissions: `0o600` (owner-only)

---

## Breaking Changes

None. This is the first release.

---

## Requirements

- Clawdbot CLI
- Node.js 18+
- Penfield account (api.penfield.app)

---

## Credits

Author: Frank Fiegel

---

## Links

- Repository: https://github.com/penfieldlabs/clawdbot-penfield
- Issues: https://github.com/penfieldlabs/clawdbot-penfield/issues
- npm: https://www.npmjs.com/package/clawdbot-penfield
