import { waitWithSignal } from "./http.js";
import { isIncognitoSessionKey } from "openclaw/plugin-sdk/routing";
import type { PenfieldRuntime } from "./runtime.js";
import type { PenfieldConfig } from "./config.js";
import type { OpenClawPluginApi } from "./types.js";

interface CachedText {
  value: string;
  expires: number;
}

export function registerPenfieldHooks({
  api,
  config,
  runtime,
}: {
  api: OpenClawPluginApi;
  config: PenfieldConfig;
  runtime: PenfieldRuntime;
}) {
  if (!config.autoAwaken && !config.autoOrient) return;
  const policies = new Map<string, { identity?: CachedText; recent?: CachedText }>();
  let session: string | undefined;
  api.on(
    "before_prompt_build",
    async (_event, ctx) => {
      if (isIncognitoSessionKey(ctx.sessionKey)) return;
      const authority = ctx.toolAuthority;
      if (!authority) return;
      const allowAwaken = config.autoAwaken && authority.allows("penfield_awaken");
      const allowOrient = config.autoOrient && authority.allows("penfield_reflect");
      if (!allowAwaken && !allowOrient) return;
      const signal = AbortSignal.timeout(3000);
      const client = runtime.apiClient.withSignal(signal);
      const getSession = () => waitWithSignal(runtime.authService.getAccessToken(), signal);
      let access: string;
      try {
        access = await getSession();
      } catch {
        if (signal.aborted) return;
        policies.clear();
        session = undefined;
        authority.assertActive();
        return {
          prependContext:
            "Penfield sign-in is unavailable. Run openclaw penfield status for details.",
        };
      }
      authority.assertActive();
      if (access !== session) {
        policies.clear();
        session = access;
      }
      const fingerprint = authority.fingerprint;
      const cache = policies.get(fingerprint) ?? {};
      // Keep the most recently used policies. In-flight turns keep their own entry.
      policies.delete(fingerprint);
      policies.set(fingerprint, cache);
      if (policies.size > 64) policies.delete(policies.keys().next().value!);
      const awaken = async () => {
        if (!allowAwaken) return "";
        if (cache.identity && cache.identity.expires > Date.now()) return cache.identity.value;
        const response = await client.get<{ briefing: string }>("/api/v2/personality/awakening");
        const value = response.briefing?.slice(0, 8000) ?? "";
        authority.assertActive();
        cache.identity = { value, expires: Date.now() + 30 * 60_000 };
        return value;
      };
      const orient = async () => {
        if (!allowOrient) return "";
        if (cache.recent && cache.recent.expires > Date.now()) return cache.recent.value;
        const response = await client.post<{
          memories?: { content: string }[];
          active_topics?: string[];
        }>("/api/v2/analysis/reflect", { time_window: "recent", max_memories: 8 });
        const lines = (response.memories ?? [])
          .slice(0, 8)
          .map((m) => "- " + m.content.slice(0, 420));
        if (response.active_topics?.length)
          lines.push("Topics: " + response.active_topics.slice(0, 8).join(", "));
        const value = lines.join("\n").slice(0, 4000);
        authority.assertActive();
        cache.recent = { value, expires: Date.now() + 10 * 60_000 };
        return value;
      };
      const sections = await Promise.allSettled([awaken(), orient()]);
      const parts: string[] = [];
      for (const [i, section] of sections.entries()) {
        if (section.status === "rejected") {
          api.logger.warn(`[penfield] Could not load ${i ? "recent memories" : "identity"}.`);
          continue;
        }
        if (section.value)
          parts.push(`${i ? "Recent Penfield memories" : "Penfield identity"}:\n${section.value}`);
      }
      if (!parts.length || session !== access || fingerprint !== authority.fingerprint) return;
      // An interactive logout or a request deadline may finish while the reads run.
      if (access !== (await getSession().catch(() => undefined))) return;
      authority.assertActive();
      return { prependContext: parts.join("\n\n") };
    },
    { requiresToolAuthority: true }
  );
}
