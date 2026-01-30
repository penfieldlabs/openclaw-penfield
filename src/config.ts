import { z } from "zod";

// Production defaults - can be overridden via config or environment variables
const DEFAULT_AUTH_URL = process.env.PENFIELD_AUTH_URL || "https://auth.penfield.app";
const DEFAULT_API_URL = process.env.PENFIELD_API_URL || "https://api.penfield.app";

export { DEFAULT_AUTH_URL, DEFAULT_API_URL };

// Minimal config schema - everything optional for device flow
// Note: enabled is handled by OpenClaw at entry level, not in pluginConfig
//
// IMPORTANT: This zod schema is the source of truth for config validation.
// If you modify this, also update openclaw.plugin.json configSchema to match.
export const PenfieldConfigSchema = z.object({
  authUrl: z.string().optional(),
  apiUrl: z.string().optional(),
}).strict();

export type PenfieldConfig = z.infer<typeof PenfieldConfigSchema>;
