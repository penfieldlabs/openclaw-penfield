import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import {
  claims,
  clearCredential,
  credentialPath,
  loadCredential,
  production,
  saveCredential,
} from "../dist/src/store.js";

function host(t) {
  const root = mkdtempSync(join(tmpdir(), "penfield-state-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return {
    id: "penfield",
    runtime: { state: { resolveStateDir: () => root } },
    resolvePath: () => {
      throw Error("use the host state directory");
    },
  };
}
const dev = "https://api-dev.penfield.app";
const data = { clientId: "old", access: "saved", expires: 2000000000000 };
function legacy(h, issuer) {
  const path = join(h.runtime.state.resolveStateDir(), "extensions", h.id, "credentials.json");
  mkdirSync(dirname(path), { recursive: true });
  const access =
    "test." +
    Buffer.from(JSON.stringify(issuer ? { iss: issuer } : {})).toString("base64url") +
    ".local";
  writeFileSync(path, JSON.stringify({ ...data, access, version: 1 }), { mode: 0o600 });
  return path;
}
test("legacy credentials with an issuer are used only on the matching environment", (t) => {
  const h = host(t);
  legacy(h, "https://auth-dev.penfield.app");
  assert.equal(loadCredential(h, production), null);
  assert.equal(loadCredential(h, dev).clientId, "old");
  clearCredential(h, dev);
  assert.equal(loadCredential(h, dev), null);
});
test("an ambiguous legacy login stays local until the owner signs in again", (t) => {
  const h = host(t),
    old = legacy(h);
  assert.equal(loadCredential(h, production), null);
  assert.equal(loadCredential(h, dev), null);
  assert.ok(existsSync(old));
});
test("credential writes repair the mode of the plugin-owned directory", (t) => {
  const h = host(t),
    path = credentialPath(h, dev);
  mkdirSync(dirname(path), { recursive: true });
  chmodSync(dirname(path), 0o755);
  saveCredential(h, data, dev);
  assert.equal(statSync(dirname(path)).mode & 0o777, 0o700);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(JSON.parse(readFileSync(path, "utf8")).access, data.access);
});
test("invalid new credential records produce an actionable sign-in error", (t) => {
  const h = host(t),
    path = credentialPath(h, dev);
  mkdirSync(dirname(path), { recursive: true });
  for (const invalid of [
    "invalid JSON",
    "{}",
    JSON.stringify({ ...data, version: 1, scope: 42 }),
  ]) {
    writeFileSync(path, invalid);
    assert.throws(() => loadCredential(h, dev), /sign in/i);
  }
});
test("invalid claim payloads cannot break permission reporting", () => {
  for (const data of [null, [], { scopes: 42, scope: 7, iss: false }]) {
    const encoded = Buffer.from(JSON.stringify(data)).toString("base64url");
    assert.deepEqual(claims("unit." + encoded + ".local"), {});
  }
});
