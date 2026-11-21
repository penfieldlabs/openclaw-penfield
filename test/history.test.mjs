import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createWorkspaceBootstrapFilePolicy } from "openclaw/plugin-sdk/agent-workspace-runtime";

test("the published migration preserves original bytes and refuses to replace an archive", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "penfield-history-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const guide = await readFile(new URL("../persona-templates/MEMORY.md", import.meta.url), "utf8");
  const script = guide.match(/<<'JS'\n([\s\S]*?)\nJS\n/)[1];
  const run = () =>
    spawnSync(process.execPath, ["--input-type=module", "-"], { cwd: dir, input: script });
  const original = Buffer.from("Prior work\r\nDécisions\n");
  const note = join(dir, "MEMORY.md");
  const archive = "history/openclaw-memory.md";
  await writeFile(note, original);
  assert.equal(run().status, 0);
  assert.deepEqual(await readFile(join(dir, archive)), original);
  assert.equal(await readFile(note, "utf8"), "# MEMORY\n");
  await writeFile(note, "Later manual content");
  assert.notEqual(run().status, 0);
  assert.equal(await readFile(note, "utf8"), "Later manual content");
  assert.deepEqual(await readFile(join(dir, archive)), original);
  const policy = createWorkspaceBootstrapFilePolicy({ workspaceDir: dir, config: {} });
  assert.equal(policy.canRead("MEMORY.md"), true);
  assert.equal(policy.canRead(archive), false);
});
