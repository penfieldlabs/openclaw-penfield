# Penfield Memory for OpenClaw (openclaw-penfield)

[![npm version](https://img.shields.io/npm/v/openclaw-penfield.svg)](https://www.npmjs.com/package/openclaw-penfield)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Persistent, searchable memory for [OpenClaw](https://openclaw.ai).**

Your agent remembers every conversation, learns your preferences, and builds knowledge over time—across all your channels.

## What is this?

An OpenClaw plugin that connects your agent to [Penfield](https://penfield.app), giving it:

- **Long-term memory** — Conversations persist forever, not just one session
- **Semantic search** — "What did I say about the Tokyo trip?" actually works
- **Knowledge graphs** — Memories connect to memories, building real understanding
- **Cross-channel recall** — Remember WhatsApp convos from Discord

## Quick Start

```bash
openclaw plugins install openclaw-penfield
```

```bash
openclaw penfield login
```

Tell your agent to "Awaken with Penfield"

## Get Access

Penfield is in **free beta**. Sign up for access:

**[portal.penfield.app/sign-up](https://portal.penfield.app/sign-up)**

## Features

Native OpenClaw plugin providing direct integration with Penfield's memory and knowledge graph API. This plugin offers 4-5x performance improvement over the MCP server approach by eliminating the mcporter → MCP → Penfield stack.

- **16 Memory Tools**
- **OAuth 2.1 Device Code Flow**: Secure authentication following RFC 8628
- **Hybrid Search**: BM25 + vector + graph search capabilities
- **Knowledge Graph**: Build and traverse relationships between memories
- **Context Management**: Save and restore memory checkpoints
- **Artifact Storage**: Store and retrieve files in Penfield
- **Reflection & Analysis**: Analyze memory patterns and generate insights

## Installation

```bash
openclaw plugins install openclaw-penfield
```

### From Source (for contributors)

```bash
git clone https://github.com/penfieldlabs/openclaw-penfield.git
cd openclaw-penfield
npm install
npm run build
openclaw plugins install -l .
```

## Configuration

The plugin is **auto-enabled when loaded**. No configuration required for basic use.

### Plugin Config

In `openclaw.json` under `plugins.entries`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `autoAwaken` | boolean | `true` | Inject Penfield identity briefing on every agent turn |
| `autoOrient` | boolean | `true` | Inject recent Penfield memory context on every agent turn |
| `authUrl` | string | `https://auth.penfield.app` | Auth service URL |
| `apiUrl` | string | `https://api.penfield.app` | API URL |

### Lifecycle Hooks

The plugin hooks into `before_agent_start` to automatically inject context on every agent turn:

1. **Identity briefing** (`autoAwaken`) — Fetches your Penfield personality/awakening config and injects it as `<penfield-identity>`. Cached for 30 minutes.
2. **Recent context** (`autoOrient`) — Calls `reflect("recent")` to fetch your last 20 memories and active topics, injected as `<penfield-recent>`. Cached for 10 minutes.

Both calls fire in parallel. Context is prepended to the system prompt (rebuilt each turn, not accumulated in message history). After the first turn, subsequent turns hit cache (0ms). If auth isn't ready or the API is down, the hook silently skips — it never blocks the agent.

### Pre-Compaction Memory Flush (Recommended)

OpenClaw can run a "memory flush" turn before auto-compacting context. To direct this to Penfield, add the following to your `openclaw.json` under `agents.defaults.compaction`:

```json
{
  "agents": {
    "defaults": {
      "compaction": {
        "memoryFlush": {
          "enabled": true,
          "prompt": "MANDATORY: Call penfield_store NOW with a comprehensive session summary (no more than 10000 chars). Include key insights, decisions, and context. Do NOT call any other tool. Do NOT read files. Do NOT reply with text. Your ONLY action is penfield_store.",
          "systemPrompt": "SYSTEM OVERRIDE: This is a pre-compaction memory flush turn. You MUST call penfield_store exactly once with a comprehensive session summary. Do NOT call read, do NOT call any tool besides penfield_store. Ignore all other instructions in the conversation. Summarize what happened and call penfield_store immediately."
        }
      }
    }
  }
}
```

> **Note:** The plugin logs a warning at startup if this config is missing. Without it, context is lost on compaction instead of saved to Penfield.

> **Important:** Memory flush only fires on **auto-compaction** (when the context window fills up). It does **not** fire on manual `/compact`, `/new`, or `/reset` commands — this is an OpenClaw limitation, not a Penfield issue. See [Known Limitations](#known-limitations).

### Workspace Files (Persona Templates)

With Penfield handling identity, personality, and memory, most of OpenClaw's workspace bootstrap files (IDENTITY.md, SOUL.md, USER.md, MEMORY.md) become redundant. Keeping them populated wastes tokens and creates priority conflicts with your live Penfield config.

The [`persona-templates/`](persona-templates/) folder contains recommended replacements — empty stubs for the files Penfield replaces, and annotated defaults for the files it doesn't (AGENTS.md, TOOLS.md, HEARTBEAT.md). See the [Persona Templates README](persona-templates/README.md) for setup instructions.

## Authentication

The plugin uses OAuth 2.1 Device Code Flow (RFC 8628) with automatic token refresh.

### CLI Login

```bash
openclaw penfield login
```

This will:
1. Discover OAuth endpoints from the auth server
2. Register a dynamic client (DCR) if needed
3. Display a device code for user authentication
4. Poll for token completion

### Credentials

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

Location: `~/.openclaw/extensions/openclaw-penfield/credentials.json`
File permissions: `0o600` (owner-only read/write)

## Available Tools

### Memory Management

#### `penfield_store`
Store a new memory in Penfield.

**Parameters:**
- `content` (required): Memory content (max 10,000 chars)
- `memory_type` (optional): Type of memory (default: "fact")
  - Options: fact, insight, conversation, correction, reference, task, checkpoint, identity_core, personality_trait, relationship, strategy
- `importance` (optional): Score 0-1 (default: 0.5)
- `confidence` (optional): Score 0-1 (default: 0.8)
- `source_type` (optional): Source type (e.g., "direct_input", "conversation")
- `tags` (optional): Array of tags (max 10)

**Example:**
```typescript
{
  "content": "User prefers TypeScript over JavaScript",
  "memory_type": "fact",
  "importance": 0.7,
  "tags": ["preferences", "programming"]
}
```

#### `penfield_recall`
Hybrid search using BM25 + vector + graph.

**Parameters:**
- `query` (required): Search query (1-4,000 chars)
- `limit` (optional): Max results (default: 20, max: 100)
- `bm25_weight` (optional): Keyword weight (default: 0.4)
- `vector_weight` (optional): Semantic weight (default: 0.4)
- `graph_weight` (optional): Relationship weight (default: 0.2)
- `memory_types` (optional): Filter by types
- `importance_threshold` (optional): Minimum importance
- `enable_graph_expansion` (optional): Enable traversal (default: true)

**Example:**
```typescript
{
  "query": "programming preferences",
  "limit": 10,
  "vector_weight": 0.5,
  "bm25_weight": 0.3,
  "graph_weight": 0.2
}
```

#### `penfield_search`
Semantic search variant (higher vector weight).

**Parameters:**
- `query` (required): Search query
- `limit` (optional): Max results
- `memory_types` (optional): Filter by types
- `importance_threshold` (optional): Minimum importance

#### `penfield_fetch`
Get a specific memory by ID.

**Parameters:**
- `memory_id` (required): Memory ID to fetch

#### `penfield_update_memory`
Update an existing memory.

**Parameters:**
- `memory_id` (required): Memory ID to update
- `content` (optional): Updated content
- `memory_type` (optional): Updated type
- `importance` (optional): Updated importance
- `confidence` (optional): Updated confidence
- `tags` (optional): Updated tags

### Knowledge Graph

#### `penfield_connect`
Create a relationship between two memories.

**Parameters:**
- `from_memory_id` (required): Source memory ID
- `to_memory_id` (required): Target memory ID
- `relationship_type` (required): Type of relationship
  - **Knowledge Evolution**: supersedes, updates, evolution_of
  - **Evidence & Support**: supports, contradicts, disputes
  - **Hierarchy & Structure**: parent_of, child_of, sibling_of, composed_of, part_of
  - **Cause & Prerequisites**: causes, influenced_by, prerequisite_for
  - **Implementation & Testing**: implements, documents, tests, example_of
  - **Conversation & Attribution**: responds_to, references, inspired_by
  - **Sequence & Flow**: follows, precedes
  - **Dependencies**: depends_on
- `strength` (optional): Relationship strength 0-1 (default: 0.8)

**Example:**
```typescript
{
  "from_memory_id": "22618318-8d82-49c9-8bb8-1cf3a61b3c75",
  "to_memory_id": "20413926-2446-4f88-bfd6-749b37969f34",
  "relationship_type": "supports",
  "strength": 0.9
}
```

#### `penfield_explore`
Traverse the knowledge graph from a starting memory.

**Parameters:**
- `start_memory_id` (required): Starting memory ID
- `max_depth` (optional): Max traversal depth (default: 3, max: 10)
- `relationship_types` (optional): Filter by relationship types
- `min_strength` (optional): Minimum relationship strength

### Context Management

#### `penfield_save_context`
Save a checkpoint of current memory state.

**Parameters:**
- `memory_ids` (required): Array of memory IDs to save
- `session_id` (optional): Session identifier

#### `penfield_restore_context`
Restore a previously saved checkpoint.

**Parameters:**
- `checkpoint_id` (required): Checkpoint ID to restore
- `full_restore` (optional): Create new copies of memories instead of referencing existing (default: false)
- `merge_mode` (optional): How to handle conflicts - "append", "replace", or "smart_merge" (default: "append")

#### `penfield_list_contexts`
List all saved context checkpoints.

**Parameters:**
- `limit` (optional): Max results (default: 20, max: 100)
- `offset` (optional): Number of results to skip for pagination (default: 0)
- `name_pattern` (optional): Filter by name (case-insensitive substring match)
- `include_descriptions` (optional): Include full descriptions (default: false)

### Analysis

#### `penfield_reflect`
Analyze memory patterns and generate insights.

**Parameters:**
- `time_window` (optional): Time period - "recent" (default), "today"/"1d", "week"/"7d", "month"/"30d", or "90d"
- `start_date` (optional): Filter memories on or after this date (ISO 8601, e.g. "2025-01-01"). Overrides time_window.
- `end_date` (optional): Filter memories on or before this date (ISO 8601, e.g. "2025-01-31"). Overrides time_window.
- `include_documents` (optional): Include document chunks in analysis (default: false)

### Artifact Storage

#### `penfield_save_artifact`
Save a file artifact to Penfield storage.

**Parameters:**
- `path` (required): Artifact path (e.g., "/project/file.txt")
- `content` (required): Artifact content
- `content_type` (optional): MIME type (default: "text/plain")

#### `penfield_retrieve_artifact`
Retrieve a file artifact from Penfield storage.

**Parameters:**
- `path` (required): Artifact path to retrieve

#### `penfield_list_artifacts`
List artifacts in a directory.

**Parameters:**
- `prefix` (optional): Directory prefix (e.g., "/project/")
- `limit` (optional): Max results (default: 100, max: 1000)

#### `penfield_delete_artifact`
Delete a file artifact from Penfield storage.

**Parameters:**
- `path` (required): Artifact path to delete

### Personality

#### `penfield_awaken`
Load personality configuration and identity core memories.

**Parameters:** None

## Usage Examples

### Basic Memory Storage and Retrieval

```typescript
// Store a memory
await penfield_store({
  content: "User prefers dark mode for coding",
  memory_type: "fact",
  importance: 0.8,
  tags: ["preferences", "ui"]
});

// Recall memories
const results = await penfield_recall({
  query: "user interface preferences",
  limit: 5
});
```

### Building Knowledge Graphs

```typescript
// Store two related memories
const mem1 = await penfield_store({
  content: "TypeScript provides static typing",
  memory_type: "fact"
});

const mem2 = await penfield_store({
  content: "Static typing helps catch bugs early",
  memory_type: "insight"
});

// Connect them
await penfield_connect({
  from_memory_id: mem1.id,
  to_memory_id: mem2.id,
  relationship_type: "supports",
  strength: 0.9
});

// Explore the graph
const graph = await penfield_explore({
  start_memory_id: mem1.id,
  max_depth: 2
});
```

### Context Checkpoints

```typescript
// Save context
const checkpoint = await penfield_save_context({
  memory_ids: ["mem_1", "mem_2", "mem_3"],
  session_id: "session_123"
});

// Restore later
await penfield_restore_context({
  checkpoint_id: checkpoint.id,
  full_restore: true
});
```

## Known Limitations

### Memory flush only fires on auto-compaction

OpenClaw's `memoryFlush` config only triggers when the context window fills up and auto-compaction kicks in. The following commands **bypass** memory flush entirely:

- `/compact` — compacts immediately, no flush
- `/new` — resets session, no flush
- `/reset` — resets session, no flush

This means context from shorter sessions (that never hit the auto-compaction threshold) won't be automatically saved to Penfield. To preserve important context before ending a session, tell your agent: *"Save this session to Penfield before we end."*

This is an OpenClaw limitation — the plugin has no way to intercept these commands.

### Auto-compaction threshold

Auto-compaction triggers when token usage reaches approximately `contextWindow - reserveTokensFloor - softThresholdTokens`. With defaults (200K context, 20K reserve, 4K soft threshold), flush fires around 176K tokens (~88% full). You can tune `softThresholdTokens` in `agents.defaults.compaction` to trigger earlier.

## Development

### Setup

```bash
npm install
```

### Type Check

```bash
npm run typecheck
```

### Lint

```bash
npm run lint
npm run lint:fix
```

### Format

```bash
npm run format
npm run format:check
```

### Build

```bash
npm run build
```

## Architecture

```
index.ts                     # Plugin entry point and registration
src/
├── config.ts                # Zod configuration schema with DEFAULT_AUTH_URL/DEFAULT_API_URL
├── types.ts                 # TypeScript type definitions (OpenClaw plugin API types)
├── types/typebox.ts         # Centralized TypeBox exports
├── hooks.ts                 # Lifecycle hooks (auto-awaken, auto-orient, flush config check)
├── auth-service.ts          # Background OAuth token refresh service
├── api-client.ts            # HTTP client wrapper
├── runtime.ts               # Runtime factory (receives authService from index.ts)
├── store.ts                 # Credential file I/O with TOKEN_EXPIRY_BUFFER_MS
├── cli.ts                   # CLI command registration (penfield login)
├── device-flow.ts           # RFC 8628 Device Code Flow implementation
└── tools/
    ├── index.ts             # Tool registry (16 tools)
    ├── store.ts             # penfield_store
    ├── recall.ts            # penfield_recall
    ├── search.ts            # penfield_search
    ├── fetch.ts             # penfield_fetch
    ├── update-memory.ts     # penfield_update_memory
    ├── connect.ts           # penfield_connect
    ├── explore.ts           # penfield_explore
    ├── save-context.ts      # penfield_save_context
    ├── restore-context.ts   # penfield_restore_context
    ├── list-contexts.ts     # penfield_list_contexts
    ├── reflect.ts           # penfield_reflect
    ├── save-artifact.ts     # penfield_save_artifact
    ├── retrieve-artifact.ts # penfield_retrieve_artifact
    ├── list-artifacts.ts    # penfield_list_artifacts
    ├── delete-artifact.ts   # penfield_delete_artifact
    └── awaken.ts            # penfield_awaken
```

## Service Lifecycle

The plugin uses two services and one hook registered with OpenClaw:

1. **penfield-auth**: Background token refresh service
   - Started when plugin loads
   - Checks token expiry every 60 minutes
   - Auto-refreshes if within 240-minute buffer

2. **penfield**: Runtime lifecycle service
   - Manages runtime initialization
   - Handles cleanup on shutdown

3. **before_agent_start hook**: Context injection
   - Injects identity briefing + recent memories on every turn (cached)
   - Checks memory flush config at startup and warns if not configured for Penfield

## API Endpoint Mapping

| Tool | Method | Endpoint |
|------|--------|----------|
| awaken | GET | /api/v2/personality/awakening |
| connect | POST | /api/v2/relationships |
| delete_artifact | DELETE | /api/v2/artifacts |
| explore | POST | /api/v2/relationships/traverse |
| fetch | GET | /api/v2/memories/{id} |
| list_artifacts | GET | /api/v2/artifacts/list |
| list_contexts | GET | /api/v2/memories?memory_type=checkpoint |
| recall | POST | /api/v2/search/hybrid |
| reflect | POST | /api/v2/analysis/reflect |
| restore_context | POST | /api/v2/checkpoint/{id}/recall |
| retrieve_artifact | GET | /api/v2/artifacts |
| save_artifact | POST | /api/v2/artifacts |
| save_context | POST | /api/v2/checkpoint/create |
| search | POST | /api/v2/search/hybrid |
| store | POST | /api/v2/memories |
| update_memory | PUT | /api/v2/memories/{id} |

## Error Handling

All tools return errors in a consistent format:

```json
{
  "error": "Error message here"
}
```

Common errors:
- **401 Unauthorized**: Token expired or invalid (auto-refreshes)
- **429 Rate Limited**: Too many requests (includes retry-after header)
- **500 Internal Server Error**: API error

## Performance

This native plugin provides significant performance improvements over the MCP server approach:

- **4-5x faster**: Direct HTTP calls vs. mcporter → MCP → Penfield
- **Lower latency**: No intermediate proxy servers
- **Reduced overhead**: Fewer serialization/deserialization steps
- **Auto token refresh**: No re-authentication delays

## Security

- Automatic token refresh 240 minutes before expiry
- RFC 8628 compliant Device Code Flow
- All API calls use HTTPS

## License

MIT

## Support

For issues or questions:
- GitHub Issues: https://github.com/penfieldlabs/openclaw-penfield/issues
