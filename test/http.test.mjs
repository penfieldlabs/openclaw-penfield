import assert from "node:assert/strict";
import { test } from "node:test";
import { PenfieldApiClient } from "../dist/src/api-client.js";

function client(t, responses) {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    requests.push({ url, init });
    const response = responses.shift();
    if (response instanceof Error) throw response;
    return response;
  });
  const auth = {
    getAccessToken: async () => "local-test-value",
    getScopes: () => ["read"],
    discardRejectedKeyToken() {},
  };
  return { api: new PenfieldApiClient(auth, "https://api.example"), requests };
}

test("preserves false in a successful envelope", async (t) => {
  const { api } = client(t, [Response.json({ status: "success", data: false })]);
  assert.equal(await api.get("/read"), false);
});

test("401 reports that the login has been refused", async (t) => {
  const { api } = client(t, [Response.json({}, { status: 401 })]);
  await assert.rejects(api.get("/read"), /401.*sign in/i);
});

test("403 tells the model the required and granted permissions", async (t) => {
  const { api } = client(t, [
    Response.json(
      { error: { code: "AUTH_INSUFFICIENT_PERMISSIONS", message: "Required permission: delete" } },
      { status: 403 }
    ),
  ]);
  await assert.rejects(api.delete("/item"), /delete.*allowed.*read/i);
});

test("422 preserves individual field reasons", async (t) => {
  const { api } = client(t, [
    Response.json(
      {
        error: {
          message: "Validation failed",
          field_errors: { content: ["must be shorter"], tags: ["at most ten"] },
        },
      },
      { status: 422 }
    ),
  ]);
  await assert.rejects(api.post("/item", {}), /content.*must be shorter.*tags.*at most ten/);
});

test("429 on a write reports the wait and does not repeat the write", async (t) => {
  const { api, requests } = client(t, [
    new Response(null, { status: 429, headers: { "Retry-After": "7" } }),
  ]);
  await assert.rejects(api.post("/item", {}), /7/);
  assert.equal(requests.length, 1);
});

test("a timed out write is reported without replay", async (t) => {
  const { api, requests } = client(t, [new DOMException("deadline", "TimeoutError")]);
  await assert.rejects(api.post("/item", {}), /timed out/i);
  assert.equal(requests.length, 1);
});

test("an empty delete response is successful", async (t) => {
  const { api } = client(t, [new Response(null, { status: 204 })]);
  assert.deepEqual(await api.delete("/item"), {});
});

test("a transient read failure is retried once", async (t) => {
  const { api, requests } = client(t, [
    new Response(null, { status: 503 }),
    Response.json({ data: { ok: true } }),
  ]);
  assert.deepEqual(await api.get("/read"), { ok: true });
  assert.equal(requests.length, 2);
});

test("server diagnostics redact credentials echoed in an error", async (t) => {
  const { requestJson } = await import("../dist/src/http.js");
  const access = "private-input-fixture",
    refresh = "private-form-fixture";
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      { error_description: "Rejected " + access + " " + refresh, error: "invalid_grant" },
      { status: 400 }
    )
  );
  await assert.rejects(
    requestJson("https://api.example", {
      method: "POST",
      headers: { Authorization: "Bearer " + access },
      body: new URLSearchParams({ refresh_token: refresh }),
    }),
    (err) => {
      return (
        err.message.includes("400") &&
        !err.message.includes(access) &&
        !err.message.includes(refresh)
      );
    }
  );
});
test("a GET retries a transport failure, but a write is never replayed", async (t) => {
  const { api, requests } = client(t, [
    new TypeError("socket closed"),
    Response.json({ data: 7 }),
    new TypeError("socket closed"),
  ]);
  assert.equal(await api.get("/read"), 7);
  await assert.rejects(api.put("/write", {}), /socket closed/);
  assert.equal(requests.length, 3);
});
test("rate limits without a time hint never report null seconds", async (t) => {
  const { api } = client(t, [new Response(null, { status: 429 })]);
  await assert.rejects(api.post("/write", {}), /Try again later/);
});

test("malformed success JSON cannot surface the response body", async (t) => {
  const sentinel = "sensitive-response-fixture";
  const { api } = client(t, [new Response(sentinel)]);
  await assert.rejects(
    api.get("/read"),
    (e) => /unreadable JSON/.test(e.message) && !e.message.includes(sentinel)
  );
});
test("query parameters already in a request path survive additional filters", async (t) => {
  const { api, requests } = client(t, [Response.json({ data: [] })]);
  await api.get("/items?sort=name", { page: "2" });
  const url = new URL(requests[0].url);
  assert.equal(url.searchParams.get("sort"), "name");
  assert.equal(url.searchParams.get("page"), "2");
});

test("each request attempt gets a thirty-second deadline", async (t) => {
  const timeout = t.mock.method(AbortSignal, "timeout");
  const { api } = client(t, [Response.json({ data: true })]);
  await api.post("/analysis/reflect", {});
  assert.deepEqual(
    timeout.mock.calls.map((call) => call.arguments),
    [[30_000]]
  );
});
