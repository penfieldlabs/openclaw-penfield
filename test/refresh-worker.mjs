import { join } from "node:path";
import { createAuthService } from "../dist/src/auth-service.js";
import { withCredentialLock } from "../dist/src/store.js";
const [directory, address] = process.argv.slice(2);
if (address === "hold-lock") {
  const host = { id: "penfield", resolvePath: () => directory };
  await withCredentialLock(host, "https://api.example", async () => {
    process.send("locked");
    await new Promise((resolve) => process.once("disconnect", resolve));
  });
} else {
  const fetchLocal = globalThis.fetch;
  globalThis.fetch = (url, init) => fetchLocal(address + new URL(url).pathname, init);
  const host = { id: "penfield", resolvePath: (p) => join(directory, p.replace(/^~\//, "")) };
  const access = await createAuthService(host, { apiUrl: "https://api.example" }).getAccessToken();
  if (access !== "rotated-access") throw new Error("Worker did not obtain the renewed session.");
}
