/**
 * OpenClaw Plugin API types for Penfield plugin
 *
 * These types define the contract between Penfield and OpenClaw.
 * They match the interfaces exported by openclaw/plugin-sdk.
 *
 * At runtime, OpenClaw provides the actual implementations.
 * During development, these provide type safety.
 */

/**
 * Minimal Commander.js Command interface for CLI registration.
 * Only includes methods we actually use.
 */
export interface CliCommand {
  command(name: string): CliCommand;
  description(msg: string): CliCommand;
  action(fn: () => Promise<void>): CliCommand;
  addHelpText(
    position: "before" | "after" | "beforeAll" | "afterAll",
    text: string | ((cmd: CliCommand) => string)
  ): CliCommand;
}

export interface PluginLogger {
  debug?: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

export interface OpenClawPluginServiceContext {
  config: Record<string, unknown>;
  workspaceDir?: string;
  stateDir: string;
  logger: PluginLogger;
}

export interface OpenClawPluginService {
  id: string;
  start: (ctx: OpenClawPluginServiceContext) => void | Promise<void>;
  stop?: (ctx: OpenClawPluginServiceContext) => void | Promise<void>;
}

export interface OpenClawPluginCliContext {
  program: CliCommand;
  config: Record<string, unknown>;
  workspaceDir?: string;
  logger: PluginLogger;
}

// ---------------------------------------------------------------------------
// Plugin Hook Event / Result Types
// ---------------------------------------------------------------------------

/** Event for before_agent_start hook */
export interface PluginHookBeforeAgentStartEvent {
  prompt: string;
  messages?: unknown[];
}

/** Result for before_agent_start hook — prependContext is injected before the agent prompt */
export interface PluginHookBeforeAgentStartResult {
  systemPrompt?: string;
  prependContext?: string;
}

// ---------------------------------------------------------------------------
// Plugin API
// ---------------------------------------------------------------------------

export interface OpenClawPluginApi {
  /** Plugin identifier */
  id: string;
  /** Plugin name */
  name: string;
  /** Plugin version */
  version?: string;
  /** Plugin description */
  description?: string;
  /** Plugin source module path */
  source: string;
  /** Full OpenClaw configuration */
  config: Record<string, unknown>;
  /** Parsed plugin-specific configuration */
  pluginConfig?: Record<string, unknown>;

  /** Resolve ~ paths to absolute paths */
  resolvePath(input: string): string;

  /** Logger instance */
  logger: PluginLogger;

  /** Register CLI commands */
  registerCli(
    fn: (ctx: OpenClawPluginCliContext) => void | Promise<void>,
    opts?: { commands?: string[] }
  ): void;

  /** Register a tool */
  registerTool(
    tool: {
      name: string;
      label: string;
      description: string;
      parameters: unknown;
      execute: (toolCallId: string, input: unknown) => Promise<unknown>;
    },
    opts?: { name?: string; names?: string[]; optional?: boolean }
  ): void;

  /** Register service lifecycle */
  registerService(service: OpenClawPluginService): void;

  /** Register a typed plugin lifecycle hook (always available, no config gate) */
  on(
    hookName: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OpenClaw dispatches typed events at runtime
    handler: (...args: any[]) => any,
    opts?: { priority?: number }
  ): void;

  /** Runtime context */
  runtime?: {
    prompter?: {
      info(msg: string): void;
      warn(msg: string): void;
      error(msg: string): void;
    };
    openUrl?: (url: string) => Promise<void>;
  };
}
