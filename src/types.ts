/**
 * Clawdbot Plugin API types for Penfield plugin
 *
 * Single source of truth for plugin interfaces.
 * These types are adapted from @clawdbot/types for plugin use.
 */

export interface Logger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface ClawdbotPluginApi {
  /** Plugin identifier */
  id: string;
  /** Plugin name */
  name: string;
  /** Plugin version */
  version?: string;
  /** Plugin description */
  description?: string;
  /** Plugin source module */
  source: string;
  /** Raw config object */
  config: Record<string, unknown>;
  /** Parsed plugin configuration */
  pluginConfig: Record<string, unknown>;

  /** Get plugin config by ID */
  getPluginConfig(id: string): Record<string, unknown> | undefined;

  /** Resolve ~ paths to absolute paths */
  resolvePath(input: string): string;

  /** Logger instance */
  logger: Logger;

  /** Register CLI commands */
  registerCli(fn: (ctx: ClawdbotCliContext) => void, opts?: { commands?: string[] }): void;

  /** Register a tool with single-object parameter pattern */
  registerTool(tool: {
    name: string;
    label: string;
    description: string;
    parameters: unknown;
    execute: (toolCallId: string, input: unknown) => Promise<unknown>;
  }): void;

  /** Register service lifecycle */
  registerService(service: {
    id: string;
    start?: () => Promise<void>;
    stop?: () => Promise<void>;
  }): void;

  /** Runtime context (available in agent mode, not CLI) */
  runtime?: {
    prompter: {
      info(msg: string): void;
      warn(msg: string): void;
      error(msg: string): void;
    };
    openUrl?: (url: string) => Promise<void>;
  };
}

export interface ClawdbotCliContext {
  program: {
    command(name: string): ClawdbotCliCommand;
  };
  logger: Logger;
}

export interface ClawdbotCliCommand {
  command(name: string): ClawdbotCliCommand;
  description(msg: string): ClawdbotCliCommand;
  action(fn: () => Promise<void>): ClawdbotCliCommand;
  addHelpText(
    position: 'before' | 'after' | 'beforeAll' | 'afterAll',
    text: string | ((cmd: this) => string)
  ): ClawdbotCliCommand;
}
