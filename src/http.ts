import { setTimeout as delay } from "node:timers/promises";

export class PenfieldError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string
  ) {
    super(message);
  }
}

interface ErrorBody {
  error?:
    | string
    | {
        code?: string;
        message?: string;
        field_errors?: Record<string, string | string[]>;
      };
  error_description?: string;
}

// One caller may stop waiting while a shared token exchange finishes for other callers.
export function waitWithSignal<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export async function requestJson<T>(
  url: URL | string,
  init: RequestInit = {},
  scopes?: readonly string[],
  emptyResponse = false
): Promise<T> {
  const method = init.method ?? "GET";
  for (let attempt = 0; ; attempt++) {
    const deadline = AbortSignal.timeout(30_000);
    const signal = init.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
    const retryRead = method === "GET" && attempt === 0;
    try {
      const response = await fetch(url, { ...init, method, signal, redirect: "error" });
      if (response.ok) {
        if (emptyResponse) {
          await response.body?.cancel();
          return {} as T;
        }
        if (response.status === 204) return {} as T;
        try {
          return (await response.json()) as T;
        } catch (err) {
          if (err instanceof SyntaxError)
            throw new PenfieldError(response.status, "Penfield returned unreadable JSON.");
          throw err;
        }
      }
      const retryAfter = response.headers.get("Retry-After");
      const retryMs =
        retryAfter === null
          ? 200
          : /^\d+$/.test(retryAfter)
            ? Number(retryAfter) * 1000
            : Math.max(0, Date.parse(retryAfter) - Date.now());
      if (retryRead && [429, 502, 503, 504].includes(response.status) && retryMs <= 1000) {
        await response.body?.cancel();
        await delay(retryMs, undefined, { signal });
        continue;
      }
      const data: ErrorBody = (await response.json().catch(() => ({}))) ?? {};
      const error = typeof data.error === "object" ? data.error : undefined;
      const code = error?.code ?? (typeof data.error === "string" ? data.error : undefined);
      const parts = [
        `Penfield HTTP ${response.status}.`,
        error?.message ?? data.error_description ?? code,
      ];
      if (response.status === 401)
        parts.push("Sign in with openclaw penfield login or check the configured API key.");
      if (response.status === 403 && code === "AUTH_INSUFFICIENT_PERMISSIONS") {
        const granted = scopes ?? [];
        parts.push(
          granted.length
            ? `This login is allowed to ${granted.join(", ")}.`
            : "The service has not reported this login's permissions."
        );
      }
      if (response.status === 422 && error?.field_errors) {
        for (const [field, reasons] of Object.entries(error.field_errors)) {
          parts.push(`${field}: ${Array.isArray(reasons) ? reasons.join(", ") : reasons}.`);
        }
      }
      if (response.status === 429)
        parts.push(retryAfter ? `Retry after ${retryAfter}.` : "Try again later.");
      let message = parts.filter(Boolean).join(" ");
      const bearer = new Headers(init.headers).get("Authorization")?.replace(/^Bearer /i, "");
      const secrets = [bearer];
      if (init.body instanceof URLSearchParams) {
        for (const field of ["token", "refresh_token", "device_code"])
          secrets.push(init.body.get(field) ?? undefined);
      }
      for (const secret of secrets) if (secret) message = message.replaceAll(secret, "[redacted]");
      throw new PenfieldError(response.status, message, code);
    } catch (err) {
      if (init.signal?.aborted) throw err;
      if (
        deadline.aborted ||
        (err instanceof Error && ["TimeoutError", "AbortError"].includes(err.name))
      ) {
        throw new Error("Penfield request timed out.", { cause: err });
      }
      if (retryRead && err instanceof TypeError) {
        await delay(200);
        continue;
      }
      throw err;
    }
  }
}
