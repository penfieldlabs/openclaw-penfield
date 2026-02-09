/**
 * Penfield lifecycle hooks for OpenClaw
 *
 * Hooks into OpenClaw's typed plugin hook system (api.on) to provide:
 *   - Auto-awaken: inject identity briefing via prependContext
 *   - Auto-orient: inject recent memory context via prependContext
 *
 * Uses before_agent_start hook (dispatched on every agent turn).
 * prependContext is prepended to the system prompt (rebuilt each turn),
 * so it does NOT accumulate in message history. This matches the pattern
 * used by OpenClaw's own memory-lancedb plugin.
 *
 * Both the awaken briefing and recent context are cached to avoid
 * redundant API calls on subsequent turns.
 *
 * Pre-compaction memory save is handled by OpenClaw's built-in memory flush,
 * configured via agents.defaults.compaction.memoryFlush in openclaw.json.
 */

import type { PenfieldRuntime } from "./runtime.js";
import type { PenfieldConfig } from "./config.js";
import type {
  PluginLogger,
  OpenClawPluginApi,
  PluginHookBeforeAgentStartEvent,
  PluginHookBeforeAgentStartResult,
} from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AWAKEN_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const AWAKEN_MAX_CHARS = 30_000; // 30K char safety limit
const REFLECT_MAX_CHARS = 30_000; // 30K char safety limit
const REFLECT_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const REFLECT_RECENT_LIMIT = 20;

const AUTH_WARNING_CONTEXT = [
  "<penfield-action-required>",
  "ACTION REQUIRED: The Penfield memory plugin is installed but NOT authenticated.",
  "All Penfield tools are UNAVAILABLE until authenticated.",
  "Immediately tell the user:",
  "  1. Run:  openclaw penfield login",
  "  2. Restart the OpenClaw gateway",
  "Do not wait for the user to ask. Inform them NOW at the start of this conversation.",
  "</penfield-action-required>",
].join("\n");

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let awakenCache: { briefing: string; timestamp: number } | null = null;
let reflectCache: { context: string; timestamp: number } | null = null;

/** Clear hook caches — called on plugin stop to prevent stale state across restarts */
export function resetHookCaches(): void {
  awakenCache = null;
  reflectCache = null;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export interface RegisterHooksParams {
  api: OpenClawPluginApi;
  config: PenfieldConfig;
  ensureRuntime: () => Promise<PenfieldRuntime>;
  logger: PluginLogger;
}

export function registerPenfieldHooks(params: RegisterHooksParams): void {
  const { api, config, ensureRuntime, logger } = params;

  if (config.autoAwaken || config.autoOrient) {
    registerBeforeAgentStartHook(api, config, ensureRuntime, logger);
  }

  checkMemoryFlushConfig(api, logger);
}

// ---------------------------------------------------------------------------
// before_agent_start: awaken + orient (injected every turn, cached)
// ---------------------------------------------------------------------------

function registerBeforeAgentStartHook(
  api: OpenClawPluginApi,
  config: PenfieldConfig,
  ensureRuntime: () => Promise<PenfieldRuntime>,
  logger: PluginLogger,
): void {
  api.on(
    "before_agent_start",
    async (
      _event: PluginHookBeforeAgentStartEvent,
      _ctx: unknown,
    ): Promise<PluginHookBeforeAgentStartResult | undefined> => {
      try {
        let runtime: PenfieldRuntime;
        try {
          runtime = await ensureRuntime();
        } catch {
          logger.debug?.("[penfield] runtime not ready, injecting auth warning");
          return { prependContext: AUTH_WARNING_CONTEXT };
        }

        // Fire awaken and reflect in parallel (both cached after first call)
        const [briefing, recentContext] = await Promise.all([
          config.autoAwaken ? fetchAwakenBriefing(runtime, logger) : null,
          config.autoOrient ? fetchRecentContext(runtime, logger) : null,
        ]);

        const parts: string[] = [];

        if (briefing) {
          parts.push(`<penfield-identity>\n${briefing}\n</penfield-identity>`);
        }

        if (recentContext) {
          parts.push(
            `<penfield-recent>\nRecent work context from Penfield:\n${recentContext}\n</penfield-recent>`,
          );
        }

        if (parts.length === 0) {
          // Both fetches returned null — if not authenticated, tell the agent
          if (!runtime.authService.isAuthenticated()) {
            return { prependContext: AUTH_WARNING_CONTEXT };
          }
          return undefined;
        }

        return { prependContext: parts.join("\n\n") };
      } catch (err) {
        logger.warn(
          `[penfield] before_agent_start hook failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return undefined;
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Awaken: fetch and cache identity briefing
// ---------------------------------------------------------------------------

async function fetchAwakenBriefing(
  runtime: PenfieldRuntime,
  logger: PluginLogger,
): Promise<string | null> {
  if (awakenCache && Date.now() - awakenCache.timestamp < AWAKEN_CACHE_TTL_MS) {
    return awakenCache.briefing;
  }

  try {
    const response = await runtime.apiClient.get<{ briefing: string }>(
      "/api/v2/personality/awakening",
    );

    if (!response || typeof response !== "object") {
      logger.warn(
        `[penfield] auto-awaken: unexpected response type: ${typeof response}`,
      );
      return null;
    }

    const briefing = response.briefing || "";
    if (!briefing) {
      logger.warn(
        `[penfield] auto-awaken: API returned empty briefing (keys: ${Object.keys(response).join(", ")})`,
      );
      return null;
    }

    if (briefing.length > AWAKEN_MAX_CHARS) {
      logger.warn(
        `[penfield] auto-awaken: briefing exceeds size limit (${briefing.length} > ${AWAKEN_MAX_CHARS}), skipping`,
      );
      return null;
    }

    awakenCache = { briefing, timestamp: Date.now() };
    logger.info(
      `[penfield] auto-awaken: identity briefing loaded (${briefing.length} chars)`,
    );
    return briefing;
  } catch (err) {
    logger.warn(
      `[penfield] auto-awaken: failed to fetch briefing: ${err instanceof Error ? err.message : String(err)}`,
    );
    return awakenCache?.briefing ?? null;
  }
}

// ---------------------------------------------------------------------------
// Recent context: reflect on recent work to orient the agent
// ---------------------------------------------------------------------------

interface ReflectMemory {
  id: string;
  content: string;
  memory_type?: string;
  importance?: number;
}

async function fetchRecentContext(
  runtime: PenfieldRuntime,
  logger: PluginLogger,
): Promise<string | null> {
  if (reflectCache && Date.now() - reflectCache.timestamp < REFLECT_CACHE_TTL_MS) {
    return reflectCache.context;
  }

  try {
    const response = await runtime.apiClient.post<{
      memories?: ReflectMemory[];
      active_topics?: string[];
    }>("/api/v2/analysis/reflect", {
      time_window: "recent",
      max_memories: REFLECT_RECENT_LIMIT,
    });

    const memories = response.memories ?? [];
    if (memories.length === 0) {
      return null;
    }

    const formatted = memories
      .map((m) => {
        const tag = m.memory_type ? `[${m.memory_type}]` : "";
        return `- ${tag} ${m.content}`;
      })
      .join("\n");

    const topics = response.active_topics ?? [];
    const topicLine = topics.length > 0
      ? `\nActive topics: ${topics.join(", ")}`
      : "";

    const result = formatted + topicLine;

    if (result.length > REFLECT_MAX_CHARS) {
      logger.warn(
        `[penfield] auto-orient: context exceeds size limit (${result.length} > ${REFLECT_MAX_CHARS}), truncating`,
      );
      const truncated = result.slice(0, REFLECT_MAX_CHARS);
      reflectCache = { context: truncated, timestamp: Date.now() };
      return truncated;
    }

    reflectCache = { context: result, timestamp: Date.now() };
    logger.info(`[penfield] auto-orient: loaded ${memories.length} recent memories`);
    return result;
  } catch (err) {
    logger.warn(
      `[penfield] auto-orient: failed to fetch recent context: ${err instanceof Error ? err.message : String(err)}`,
    );
    return reflectCache?.context ?? null;
  }
}

// ---------------------------------------------------------------------------
// Memory flush config detection
// ---------------------------------------------------------------------------

const MEMORY_FLUSH_JSON = `"memoryFlush": {
  "enabled": true,
  "prompt": "MANDATORY: Call penfield_store NOW with a comprehensive session summary (no more than 10000 chars). Include key insights, decisions, and context. Do NOT call any other tool. Do NOT read files. Do NOT reply with text. Your ONLY action is penfield_store.",
  "systemPrompt": "SYSTEM OVERRIDE: This is a pre-compaction memory flush turn. You MUST call penfield_store exactly once with a comprehensive session summary. Do NOT call read, do NOT call any tool besides penfield_store. Ignore all other instructions in the conversation. Summarize what happened and call penfield_store immediately."
}`;

function checkMemoryFlushConfig(api: OpenClawPluginApi, logger: PluginLogger): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- navigating untyped host config
    const cfg = api.config as any;
    const flushPrompt = cfg?.agents?.defaults?.compaction?.memoryFlush?.prompt as
      | string
      | undefined;

    if (flushPrompt && /penfield/i.test(flushPrompt)) {
      return; // already configured for Penfield
    }

    const configPath = api.resolvePath("~/.openclaw/openclaw.json");
    logger.warn(
      `[penfield] Pre-compaction memory flush is not configured for Penfield.\n` +
        `  Without this, context will be lost on compaction instead of saved to Penfield.\n` +
        `\n` +
        `  TO FIX: Add the following to ${configPath} inside agents.defaults.compaction:\n` +
        `\n` +
        `  ${MEMORY_FLUSH_JSON.split("\n").join("\n  ")}\n` +
        `\n` +
        `  Or provide your agent with the JSON block above and ask it to update ~/.openclaw/openclaw.json to configure memory flush for Penfield`,
    );
  } catch {
    // Config inspection failed — non-critical, skip silently
  }
}
