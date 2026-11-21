# Penfield Memory for OpenClaw

Penfield is a memory service that lets your OpenClaw agent remember decisions across sessions, find the evidence behind them, and hand off unfinished work. Its 17 tools cover memories, relationships, checkpoints, and file artifacts. Installing the plugin selects Penfield as OpenClaw's primary memory provider.

## Connect

1. Create an account in the [Penfield portal](https://portal.penfield.app). Use OpenClaw 2026.10.33 or later with Node 24.16 or later in the 24.x line, or Node 26.1 or later.
2. Install the published package and sign in. Open the address printed by the login command, enter the device code, and approve **OpenClaw (Penfield plugin)**.

   ```sh
   openclaw plugins install npm:openclaw-penfield
   openclaw penfield login
   ```

3. Grant the prompt hook conversation access so OpenClaw can include your identity briefing and recent memories on eligible turns. Restart the running gateway, then verify the connection and grant.

   ```sh
   openclaw config set plugins.entries.openclaw-penfield.hooks.allowConversationAccess true
   openclaw gateway restart
   openclaw penfield status
   ```

Status reports the hook setting, verifies the active login with Penfield, and lists its permissions. To preview the identity briefing yourself, run `openclaw penfield awaken`. Later sign-ins reuse the client registered for that profile and API origin.

### Memory slot, Active Memory and rollback

Installation sets `plugins.slots.memory` to `openclaw-penfield`. Penfield replaces `memory-core` as the primary memory provider. The built-in workflow stores long-term notes in `MEMORY.md` and daily notes in `memory/YYYY-MM-DD.md`, then reads them with `memory_search` and `memory_get`. Penfield writes to the connected account with `penfield_store` and retrieves records with `penfield_recall` and `penfield_fetch`. Installing it leaves existing workspace files in place. It does not import them.

When Active Memory is enabled, its default Penfield tools are `penfield_recall` for a bounded search preview and `penfield_fetch` for a full record by ID. Both are read-only. Use `penfield_explore` explicitly when a task calls for graph traversal. OpenClaw 2026.11.6 first uses a usable explicit `plugins.entries.active-memory.config.toolsAllow`, then the selected provider's recall tools. With neither, it uses `memory_recall` for the legacy LanceDB slot or `memory_search` and `memory_get` otherwise. Per-turn tool permissions can narrow the result. Active Memory has no access to protected private transcripts through Penfield.

**After `openclaw penfield status` succeeds, turn off OpenClaw's own memory.** Keep Penfield in the slot and disable the built-in plugin:

```sh
openclaw config set plugins.slots.memory openclaw-penfield
openclaw config set plugins.entries.memory-core.enabled false
```

Restart the running gateway. This stops built-in dreaming, standing intents, `memory_search`, `memory_get`, and the pre-compaction flush that prompts the agent to append to a daily file. Penfield keeps all 17 tools. The settings leave existing `MEMORY.md`, `memory/YYYY-MM-DD.md` and `DREAMS.md` untouched. If you also enabled the separate `session-memory` hook, run `openclaw hooks disable session-memory` to stop it saving session excerpts on reset. Remove any daily-note writing instructions or scheduled jobs you added, including instructions inherited from the stock workspace `AGENTS.md`.

Keep the old files as history. Use ordinary file search and read tools when working on something from before Penfield, or when Penfield recall turns up nothing. Store an individual fact in Penfield when it proves useful, with a tag such as `from-openclaw-memory`. For a shorter startup context, follow the archive procedure before reducing `MEMORY.md` to its bare header. [Preserve the old MEMORY.md](persona-templates/MEMORY.md)

If you keep memory-core enabled, OpenClaw can still load it as a dreaming sidecar. On 2026.10.33 and 2026.11.6 it contributes its recall prompt and can expose both built-in memory read tools when policy allows. While Penfield owns the slot, OpenClaw uses Penfield's pre-compaction setting below. The sidecar's daily-file flush prompt does not run. [OpenClaw dreaming](https://docs.openclaw.ai/concepts/dreaming)

**To return to built-in memory**, re-enable its entry, select its slot, then restart the gateway:

```sh
openclaw config set plugins.entries.memory-core.enabled true
openclaw config set plugins.slots.memory memory-core
```

Selecting memory-core turns Penfield off completely. Its account records stay in Penfield. If you previously archived the long-term note, it is still in `history/openclaw-memory.md`.

### Limited permissions with an API key

Browser sign-in is the usual setup. To restrict an agent, issue an API key with the desired combination of read, write, and delete. Write access does not grant delete. Provide the key as `PENFIELD_API_KEY` in the environment of the gateway or CLI, or through the plugin's `apiKey` configuration. Keep credential files owner-readable only.

A configured key takes precedence over a saved browser sign-in. A failed key exchange is reported to the caller. The plugin never changes accounts to retry a refused action. A key exchange stays in memory. Browser sign-in requests offline access and uses the permissions the server actually grants.

| Command                     | Result                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `openclaw penfield login`   | Sign in with a fresh device code in a browser.                                                                     |
| `openclaw penfield status`  | Report prompt hook access, verify the login with Penfield, and show its permissions.                               |
| `openclaw penfield refresh` | Force a browser-token refresh or a new exchange of the configured key.                                             |
| `openclaw penfield logout`  | Revoke the saved browser tokens on the server, then remove the saved sign-in. A configured API key remains active. |
| `openclaw penfield awaken`  | Run the same read used by the awaken tool.                                                                         |

### Configure the plugin

These settings belong under `plugins.entries.openclaw-penfield.config`.

| Setting           | Default                    | Purpose                                                                                                   |
| ----------------- | -------------------------- | --------------------------------------------------------------------------------------------------------- |
| `apiUrl`          | `https://api.penfield.app` | HTTPS API origin. You can also set it with `PENFIELD_API_URL`.                                            |
| `apiKey`          | Unset                      | Optional restricted credential. The environment alternative is `PENFIELD_API_KEY`.                        |
| `autoAwaken`      | `true`                     | Include a bounded identity briefing when the turn can use `penfield_awaken`.                              |
| `autoOrient`      | `true`                     | Include recent memory previews when the turn can use `penfield_reflect`.                                  |
| `compactionFlush` | `false`                    | Save a durable memory to Penfield before eligible compactions.                                            |
| `authUrl`         | Deprecated                 | Recognized legacy auth origins select their corresponding API host. Use `apiUrl` for a custom deployment. |

The plugin discovers OAuth endpoints on the API origin. The current host requires explicit conversation access for an external prompt hook. Enable the hook only where Penfield context belongs.

```json
{
  "plugins": {
    "entries": {
      "openclaw-penfield": {
        "enabled": true,
        "hooks": { "allowConversationAccess": true },
        "config": { "autoAwaken": true, "autoOrient": true }
      }
    }
  }
}
```

The gateway also applies its prompt-injection and per-turn tool policies. The hook skips incognito sessions. It reads each source only when that turn can use the corresponding tool. Its three-second budget covers authentication and context retrieval. Cached identity and recent-memory previews expire after 30 and 10 minutes respectively. Each tool policy has its own cache. Changing the credential clears all cached context. A service outage leaves the turn free to continue.

Explicit writes use the Penfield account attached to this installation. The package includes a Penfield skill with the tool reference and guidance for checkpoint handoffs. People who need separate accounts should use separate OpenClaw profiles and credentials. Nothing in this plugin automatically uploads a transcript. For optional workspace examples, see the [persona templates](https://github.com/penfieldlabs/openclaw-penfield/tree/main/persona-templates).

### Save before compaction

Pre-compaction saving is off by default. To enable it, run the following command and restart the gateway.

```sh
openclaw config set plugins.entries.openclaw-penfield.config.compactionFlush true
```

OpenClaw can use `penfield_recall` to look up existing information and `penfield_store` to save one concise memory when there is something new to retain. Allow both tools and use an account with read and write permissions. The plugin reserves one tag for the host's flush ID. The plugin keeps the confirmed memory ID for seven days and fetches that ID on retry, including after a restart. If the memory is missing, the retry returns an error. When no ID is on file, the plugin checks the flush tag. Identical content, including whitespace and line endings, returns the existing receipt. Different content in the same cycle returns an error stating that the second memory was not saved. If a write's outcome is uncertain and its receipt is still missing, Penfield reports the uncertainty and skips a second write. The global `agents.defaults.compaction.memoryFlush.enabled: false` disables the run even when the plugin setting is on.

### Upgrade from 2.x

Grant conversation access for automatic awaken and orient, then restart the gateway and check status:

```sh
openclaw config set plugins.entries.openclaw-penfield.hooks.allowConversationAccess true
openclaw gateway restart
openclaw penfield status
```

2.x recommended configuring `memoryFlush` for handoffs. To keep saving before compaction in 3.0, run `openclaw config set plugins.entries.openclaw-penfield.config.compactionFlush true` and restart the gateway. Remove any old prompt directing the agent to write daily notes.

Review `plugins.slots.memory` and any explicit Active Memory `toolsAllow` override after upgrading. Select `openclaw-penfield` for Penfield or `memory-core` for the built-in provider. The rollback command above also applies to an existing installation.

Store and update return a compact receipt with the memory ID. Use `penfield_fetch` to read back the full record. Search defaults to an 800-character preview for each result and its chunk context.

Browser credentials now live under the active profile's `credentials/openclaw-penfield` directory and are bound to an API origin. Before replacing a 2.x installation, preserve its owner-only credential file if it sits inside the extension directory. A legacy sign-in with a matching issuer can be used in its original profile. Sign in again when the issuer cannot be identified. See [authentication details](AUTHENTICATION_NOTES.md).

## Available Tools

### Memory Management

#### `penfield_store`

Store a new memory in Penfield. Manage identity and personality in the Penfield portal. `identity_core` and `personality_trait` are read filters.

**Parameters:**

- `content` (required): Memory content (max 10,000 chars)
- `memory_type` (optional): Type of memory (default: "fact")
  - Options: fact, insight, conversation, correction, reference, task, checkpoint, relationship, strategy
- `importance` (optional): Score 0-1 (default: 0.5)
- `confidence` (optional): Score 0-1 (default: 0.8)
- `source_type` (optional): `direct_input`, `conversation`, `api_import`, `checkpoint`, `document_upload`, `web_scrape`, `reflection` or `checkpoint_recall`.
- `tags` (optional): Up to 10 distinct tags after cleaning. Repeated tags keep their first position. Each tag must be 2 to 50 characters after cleaning. The plugin lowercases tags, replaces spaces and underscores with hyphens, removes other characters outside `a-z`, `0-9` and `-`, collapses repeated hyphens and strips outer hyphens. For example, `Best Practices` becomes `best-practices`.

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

Hybrid search using BM25 + vector + graph. Returns compact responses (essential fields only).

**Parameters:**

- `query` (required): Search query (1-4,000 chars)
- `limit` (optional): Max results (default: 20, max: 100)
- `bm25_weight` (optional): Keyword weight (default: 0.4)
- `vector_weight` (optional): Semantic weight (default: 0.4)
- `graph_weight` (optional): Relationship weight (default: 0.2)
- `tags` accepts comma-separated tags. A match on any tag qualifies.
- `source_types` accepts `direct_input`, `conversation`, `api_import`, `checkpoint` and `document_upload`.
- `memory_types` (optional): Filter by types
- `importance_threshold` (optional): Minimum importance
- `enable_graph_expansion` (optional): Enable traversal (default: true)
- `start_date` (optional): Filter memories created on or after this date (ISO 8601, e.g. "2025-01-01")
- `end_date` (optional): Filter memories created on or before this date (ISO 8601, e.g. "2025-12-31")
- `sort` (optional): Sort order. "relevance" (default), "created_desc", or "created_asc"
- `max_content_length` (optional): Preview length from 50 to 10,000 characters (default 800). Full content available via `penfield_fetch`.

**Example:**

```typescript
{
  "query": "programming preferences",
  "limit": 10,
  "vector_weight": 0.5,
  "bm25_weight": 0.3,
  "graph_weight": 0.2,
  "start_date": "2025-06-01"
}
```

#### `penfield_search`

Semantic search variant (higher vector weight). Returns compact responses (essential fields only).

**Parameters:**

- `query` (required): Search query (1-4,000 chars)
- `limit` (optional): Max results (default: 20, max: 100)
- `tags` accepts comma-separated tags. A match on any tag qualifies.
- `source_types` accepts `direct_input`, `conversation`, `api_import`, `checkpoint` and `document_upload`.
- `memory_types` (optional): Filter by types
- `importance_threshold` (optional): Minimum importance
- `start_date` (optional): Filter memories created on or after this date (ISO 8601)
- `end_date` (optional): Filter memories created on or before this date (ISO 8601)
- `sort` (optional): Sort order. "relevance" (default), "created_desc", or "created_asc"
- `max_content_length` (optional): Truncate content to N characters (50-10,000)

#### `penfield_fetch`

Get a specific memory by ID.

**Parameters:**

- `memory_id` (required): Memory ID to fetch (UUID format)

#### `penfield_update_memory`

Update an existing memory. The writable memory types are the same as for `penfield_store`. Manage identity and personality in the Penfield portal.

**Parameters:**

- `memory_id` (required): Memory ID to update (UUID format)
- `content` (optional): Updated content
- `memory_type` (optional): Updated type
- `importance` (optional): Updated importance
- `confidence` (optional): Updated confidence
- `tags` (optional): Up to 10 replacement tags, each 2 to 50 characters after the same cleaning used by `penfield_store`.

### Knowledge Graph

#### `penfield_connect`

An optional `evidence` object can record supporting details as string values.
Create a relationship between two memories.

**Parameters:**

- `from_memory_id` (required): Source memory ID (UUID format)
- `to_memory_id` (required): Target memory ID (UUID format)
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

#### `penfield_disconnect`

Remove a relationship between two memories.

**Parameters:**

- `from_memory_id` (required): Source memory ID (UUID format)
- `to_memory_id` (required): Target memory ID (UUID format)

**Example:**

```typescript
{
  "from_memory_id": "22618318-8d82-49c9-8bb8-1cf3a61b3c75",
  "to_memory_id": "20413926-2446-4f88-bfd6-749b37969f34"
}
```

#### `penfield_explore`

Traverse the knowledge graph from a starting memory.

**Parameters:**

- `start_memory_id` (required): Starting memory ID (UUID format)
- `max_depth` (optional): Max traversal depth (default: 3, max: 10)
- `relationship_types` (optional): Filter by relationship types
- `min_strength` applies to every edge in a returned path.
- `max_paths` limits the returned paths (default 25, maximum 100). `paths_found` includes all matching paths.

### Context Management

#### `penfield_save_context`

Save a cognitive state checkpoint for handoff to another agent or future session.

**Parameters:**

- `name` (required): Choose a unique, non-empty name that fits in the 10,000-character checkpoint record. Saving checks for an exact name match, including Unicode, and refuses a duplicate. A write-only login can save with a warning that it could not check the name. Restore uses the original spelling. A name that cleans to a valid tag also labels the checkpoint.
- `description` (optional): Detailed cognitive handoff description with memory references (max 10,000 chars). Include what was investigated, key discoveries, current hypotheses, open questions, and suggested next steps. Use `memory_id: <uuid>` patterns for reliable memory linking.
- `memory_ids` (optional): Explicit array of memory IDs to include in the checkpoint (UUID format)

**Memory linking** works three ways (combined, deduplicated):

1. Explicit `memory_ids` parameter. always linked
2. `memory_id: <uuid>` patterns extracted from description text. always linked
3. Hybrid search using description as query. best-effort additional context

#### `penfield_restore_context`

The optional `max_content_length` limits each restored memory preview (default 1,000). Fetch by ID for full text.
Restore a previously saved context checkpoint by name, UUID, or "awakening" for personality briefing.

**Parameters:**

- `name` (required): Name or ID of context to restore. Can be a context name (exact match), a context UUID, or "awakening" for personality briefing.
- `limit` (optional): Maximum number of memories to restore (default: 20, max: 100)

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
  The server detects the MIME type from the path. The file content limit is 1 MiB.

#### `penfield_retrieve_artifact`

Retrieve a file artifact from Penfield storage.

**Parameters:**

- `path` (required): Artifact path to retrieve

#### `penfield_list_artifacts`

List artifacts in a directory.

**Parameters:**

- `name_pattern` filters file and folder names on the server.
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
  tags: ["preferences", "ui"],
});

// Recall memories
const results = await penfield_recall({
  query: "user interface preferences",
  limit: 5,
});
```

### Building Knowledge Graphs

```typescript
// Store two related memories
const mem1 = await penfield_store({
  content: "TypeScript provides static typing",
  memory_type: "fact",
});

const mem2 = await penfield_store({
  content: "Static typing helps catch bugs early",
  memory_type: "insight",
});

// Connect them
await penfield_connect({
  from_memory_id: mem1.id,
  to_memory_id: mem2.id,
  relationship_type: "supports",
  strength: 0.9,
});

// Explore the graph
const graph = await penfield_explore({
  start_memory_id: mem1.id,
  max_depth: 2,
});
```

### Context Checkpoints

```typescript
// Save context with explicit memory IDs
const checkpoint = await penfield_save_context({
  name: "API investigation",
  description:
    "Investigated timeout issues in the payment API.\nmemory_id: 550e8400-e29b-41d4-a716-446655440000",
  memory_ids: ["550e8400-e29b-41d4-a716-446655440000", "6ba7b810-9dad-11d1-80b4-00c04fd430c8"],
});

// Restore later
await penfield_restore_context({
  name: "API investigation",
});

// Restore by UUID
await penfield_restore_context({
  name: "550e8400-e29b-41d4-a716-446655440000",
});

// Load personality briefing
await penfield_restore_context({
  name: "awakening",
});
```

## Development

From a reviewed local checkout, install dependencies and build before linking it to a development profile. Use the capability acceptance flags only after reviewing the declared tools and hooks.

```sh
npm ci
npm run build
openclaw plugins install --link --force --accept-capabilities .
```

### Tests

```sh
npm ci
npm run lint
npm run typecheck
npm run format:check
npm test
npm run test:live
```

Run `npm run test:host` to pack and install the plugin in a temporary OpenClaw profile. It checks slot selection and rollback, the actual Active Memory hook, dreaming sidecar reads, package validation, deep status and doctor through a loopback gateway. Set `OPENCLAW_TEST_CLI` to the absolute path of another host's `openclaw.mjs` to repeat the test on that version. With the dev key sourced it also verifies the Penfield CLI and invokes a registered tool without a model. Run `openclaw plugins validate --root .` after building to check the checkout against the host validator.

The unit suite uses mocked HTTP and temporary directories. It includes a two-process token rotation test. The live suite skips when its selected environment has no key. It checks all 17 registered tools through their actual HTTP client and verifies removal of its own fixtures. Source the appropriate private environment file before running these commands.

```sh
PENFIELD_TEST_ENV=dev npm run test:live
# After dev passes, with a disposable production account:
PENFIELD_TEST_ENV=prod PENFIELD_TEST_ALLOW_PROD=1 npm run test:live
```

Dev reads `PENFIELD_DEV_API_KEY`. Production reads `PENFIELD_PROD_API_KEY`. The suite checks the account's granted scopes before creating data. It needs read, write, and delete to clean up its test records. No live key is needed for CI.

Each HTTP attempt has a 30-second deadline. GET requests retry one transient failure within a bounded wait. Writes and rotating token grants are sent once. Rate limits report the server's retry hint. Scope refusals name the granted permissions. Validation errors include the service's field-level reasons.

The current API reference is maintained in the [Penfield documentation](https://docs.penfield.app). The plugin uses the [OpenClaw plugin SDK](https://docs.openclaw.ai/plugins/building-plugins).

## License

MIT. See [LICENSE](LICENSE).
