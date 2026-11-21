import type { OpenClawPluginApi } from "./types.js";
import type { PenfieldRuntime } from "./runtime.js";
import { executeAwakenTool } from "./tools/awaken.js";

export function registerLoginCommand(api: OpenClawPluginApi, runtime: PenfieldRuntime): void {
  const { authService: auth, apiClient } = runtime;
  api.registerCli(
    ({ program, config }) => {
      const root = program
        .command("penfield")
        .description("Sign in to Penfield and check memory access");
      const command = (name: string, description: string, action: () => Promise<string>) => {
        root
          .command(name)
          .description(description)
          .action(async () => {
            try {
              console.log(await action());
            } catch (err) {
              process.exitCode = 1;
              console.error(err instanceof Error ? err.message : String(err));
            }
          });
      };
      command("login", "Sign in with a browser", async () => {
        const scope = await auth.login((message) => console.log(message));
        return (
          `Saved browser sign-in. Granted permissions: ${scope.join(", ") || "unreported"}.` +
          (auth.mode === "API key" ? " The configured API key still takes precedence." : "")
        );
      });
      command("status", "Verify the active login with Penfield", async () => {
        const entry = config?.plugins?.entries?.["openclaw-penfield"];
        if (entry?.config?.autoAwaken === false && entry.config.autoOrient === false) {
          console.log("Prompt hook disabled. Both autoAwaken and autoOrient are off.");
        } else if (entry?.hooks?.allowConversationAccess !== true) {
          console.log(
            "Prompt hook blocked. Run openclaw config set plugins.entries.openclaw-penfield.hooks.allowConversationAccess true and restart the gateway."
          );
        } else if (entry.hooks.allowPromptInjection === false) {
          console.log(
            "Prompt hook blocked by plugins.entries.openclaw-penfield.hooks.allowPromptInjection."
          );
        } else {
          console.log(
            "Prompt hook conversation access granted. Per-turn tool permissions still apply."
          );
        }
        const status = await apiClient.get<{ valid: boolean }>("/api/v2/auth/verify");
        if (status?.valid !== true) throw new Error("Penfield did not verify this login.");
        const access = await apiClient.checkReadAccess();
        const permissions = auth.getScopes().join(", ") || "unreported";
        if (access === "restricted")
          return `Penfield recognized this ${auth.mode}. Read access is restricted. Granted permissions: ${permissions}.`;
        return `Verified ${auth.mode}. Granted permissions: ${permissions}.`;
      });
      command("refresh", "Renew the active credential now", async () => {
        await auth.getAccessToken(true);
        return `Renewed ${auth.mode}.`;
      });
      command("logout", "Revoke the saved browser sign-in at Penfield", async () => {
        const revoked = await auth.logout();
        return (
          (revoked ? "Revoked the saved browser sign-in." : "No saved browser sign-in.") +
          (auth.mode === "API key" ? " The configured API key remains active." : "")
        );
      });
      command("awaken", "Read the briefing using the awaken tool", async () => {
        const result = await executeAwakenTool(apiClient, {});
        return result.content[0].text;
      });
    },
    {
      commands: ["penfield"],
      descriptors: [
        {
          name: "penfield",
          description: "Penfield sign-in and memory commands",
          hasSubcommands: true,
        },
      ],
    }
  );
}
