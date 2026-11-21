import { closeSync, mkdirSync, openSync } from "node:fs";
import { join } from "node:path";

const week = 7 * 24 * 60 * 60 * 1000;

export async function reserveFlush(stateDir: string, digest: string) {
  const dir = join(stateDir, "openclaw-penfield", "flush");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, "attempts.sqlite");
  closeSync(openSync(file, "a", 0o600));
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(file);
  try {
    db.exec("PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE");
    db.exec(
      "CREATE TABLE IF NOT EXISTS reservations (digest TEXT PRIMARY KEY, reserved_at INTEGER NOT NULL) WITHOUT ROWID; CREATE TABLE IF NOT EXISTS uncertain (digest TEXT PRIMARY KEY) WITHOUT ROWID"
    );

    db.exec(
      "CREATE TABLE IF NOT EXISTS saved (digest TEXT PRIMARY KEY, memory_id TEXT NOT NULL, saved_at INTEGER NOT NULL) WITHOUT ROWID"
    );
    const insert = db.prepare(`INSERT OR IGNORE INTO reservations (digest, reserved_at)
      SELECT :digest, :reservedAt WHERE NOT EXISTS (SELECT 1 FROM uncertain WHERE digest = :digest)
      AND NOT EXISTS (SELECT 1 FROM saved WHERE digest = :digest)`);

    const now = Date.now();
    // Retire expired reservations. A digest alone prevents replay if a POST's
    // response was lost and Penfield still cannot find the saved memory.
    db.prepare(
      "INSERT OR IGNORE INTO uncertain SELECT digest FROM reservations WHERE reserved_at < ?"
    ).run(now - week);
    db.prepare("DELETE FROM reservations WHERE reserved_at < ?").run(now - week);
    db.prepare("DELETE FROM saved WHERE saved_at < ?").run(now - week);
    db.exec("COMMIT");

    db.exec("BEGIN IMMEDIATE");
    const saved = db.prepare("SELECT memory_id FROM saved WHERE digest = ?").get(digest);
    const savedId = saved?.memory_id as string | undefined;
    const claimed = !savedId && insert.run({ digest, reservedAt: now }).changes === 1;
    db.exec("COMMIT");

    function finish(memoryId?: string) {
      db.exec("BEGIN IMMEDIATE");
      if (memoryId !== undefined)
        db.prepare(
          "INSERT INTO saved (digest, memory_id, saved_at) VALUES (?, ?, ?) ON CONFLICT(digest) DO NOTHING"
        ).run(digest, memoryId, Date.now());
      db.prepare("DELETE FROM reservations WHERE digest = ?").run(digest);
      db.prepare("DELETE FROM uncertain WHERE digest = ?").run(digest);
      db.exec("COMMIT");
    }
    return {
      claimed,
      savedId,
      forget: () => finish(),
      confirm: (memoryId: string) => {
        try {
          finish(memoryId);
        } catch {
          // Penfield already returned the receipt. Closing the connection rolls
          // back an unfinished confirmation and leaves the retry guard intact.
        }
      },
      close: () => db.close(),
    };
  } catch (err) {
    db.close();
    throw err;
  }
}
