# Preserve the old MEMORY.md

This is a migration guide. Do not copy it over a workspace file. Run the command once from the workspace after Penfield is working. Stop any gateway or editor that might write the file during the move. If no `MEMORY.md` exists, or it already contains just the header, skip the archive step. Keep daily notes and `DREAMS.md` where they are.

The command preserves the original file at `history/openclaw-memory.md` before replacing the workspace copy with the single line `# MEMORY`. Run it in a shell with Node available. An existing archive causes it to stop without changing either file.

```sh
node --input-type=module <<'JS'
import { linkSync, lstatSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

if (!lstatSync("MEMORY.md").isFile()) throw Error("Expected a regular workspace MEMORY.md");
mkdirSync("history", { recursive: true });
const temp = mkdtempSync(".penfield-header-");
try {
  const header = join(temp, "MEMORY.md");
  writeFileSync(header, "# MEMORY\n", { mode: 0o600 });
  linkSync("MEMORY.md", "history/openclaw-memory.md");
  renameSync(header, "MEMORY.md");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
JS
```

The archive is outside the default session bootstrap files and the daily-notes directory. Read or grep it with ordinary workspace tools when older work matters. Save useful history selectively in Penfield.
