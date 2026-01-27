/**
 * CLI command registration for Penfield plugin
 */

import type { ClawdbotPluginApi, ClawdbotCliContext } from './types.js';
import { executeDeviceFlow } from './device-flow.js';
import { saveCredential } from './store.js';
import { DEFAULT_AUTH_URL } from './config.js';

/**
 * Register the 'penfield' CLI command group with 'login' subcommand
 */
export function registerLoginCommand(api: ClawdbotPluginApi): void {
  api.registerCli(({ program, logger }: ClawdbotCliContext) => {
    const root = program
      .command('penfield')
      .description('Penfield Memory commands');

    root
      .command('login')
      .description('Authenticate with Penfield using OAuth Device Flow')
      .action(async () => {
        try {
          // Use pluginConfig directly (same as index.ts)
          const config = api.pluginConfig as { authUrl?: string; clientId?: string } | undefined;
          const authUrl = config?.authUrl || DEFAULT_AUTH_URL;

          logger.info(`[penfield] CLI login - authUrl: ${authUrl}`);

          // CLI context doesn't have api.runtime, so create a prompter from logger
          const prompter = {
            info(msg: string) { logger.info(msg); },
            warn(msg: string) { logger.warn(msg); },
            error(msg: string) { logger.error(msg); },
          };

          const tokens = await executeDeviceFlow({
            authUrl,
            clientId: config?.clientId,  // Optional - will register if not provided
            prompter,
            // openUrl not available in CLI context
          });

          saveCredential(api, {
            clientId: tokens.clientId,
            access: tokens.access_token,
            refresh: tokens.refresh_token,
            expires: Date.now() + tokens.expires_in * 1000,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error(`Login failed: ${message}`);
          process.exit(1);
        }
      });
  }, { commands: ['penfield'] });
}
