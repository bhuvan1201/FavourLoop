import { test, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recommendMatches } from "../lib/recommend.ts";
import type { EligibleMatch } from "../lib/matching.ts";
import type { Need, Match } from "../lib/types.ts";

const dir = mkdtempSync(join(tmpdir(), "favourloop-recommend-"));
const previous = {
  key: process.env.OPENAI_API_KEY,
  flag: process.env.OPENAI_MATCHING_ENABLED,
  logs: process.env.FAVOURLOOP_LOG_DIR,
};
beforeEach(() => {
  process.env.OPENAI_API_KEY = "synthetic-api-key-never-log";
  process.env.OPENAI_MATCHING_ENABLED = "true";
  process.env.FAVOURLOOP_LOG_DIR = dir;
});
afterEach(() => {
  for (const [name, value] of Object.entries({
    OPENAI_API_KEY: previous.key,
    OPENAI_MATCHING_ENABLED: previous.flag,
    FAVOURLOOP_LOG_DIR: previous.logs,
  })) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});
after(() => rmSync(dir, { recursive: true, force: true }));
const need: Need = {
  id: "n",
  studentId: "requester-private",
  classroomId: "class-private",
  subject: "Mathematics",
  topic: "Writing a second-degree expression as a product",
  detail: "Turn x² + 5x + 6 into (x + 2)(x + 3).",
  status: "open",
  createdAt: "2026-11-07",
};
const candidate = (id: string, helper = id): EligibleMatch => ({
  offer: {
    id,
    studentId: helper,
    classroomId: "class-private",
    subject: "Mathematics",
    topic: "Quadratic equations",
    detail: "I can help with factoring quadratic polynomials.",
    active: 1,
  },
  student: {
    id: helper,
    name: "Synthetic private name",
    role: "student",
    color: "#fff",
    available: 1,
  },
});
const local: Match = {
  ...candidate("offer-0"),
  reason: "Local topic match.",
  score: 100,
};
const response = (matches: { offerId: string; reason: string }[]) =>
  Response.json(
    {
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify({ matches }) }],
        },
      ],
      usage: { input_tokens: 200, output_tokens: 40 },
    },
    { headers: { "x-request-id": "req_synthetic" } },
  );

test("sends only approved learning fields, caps candidates, and records content-free diagnostics", async (t) => {
  const candidates = Array.from({ length: 15 }, (_, i) =>
    candidate(`offer-${i}`),
  );
  let payload: any;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      payload = JSON.parse(body.input);
      assert.equal(body.store, false);
      assert.equal(body.text.format.strict, true);
      assert.equal(body.text.format.schema.properties.matches.maxItems, 3);
      return response([
        {
          offerId: "offer-0",
          reason: "Their factoring offer covers your example.",
        },
      ]);
    },
  );
  const result = await recommendMatches(need, candidates, [local]);
  assert.equal(result.engine, "openai");
  assert.equal(payload.offers.length, 12);
  assert.deepEqual(Object.keys(payload.request).sort(), [
    "detail",
    "subject",
    "topic",
  ]);
  for (const offer of payload.offers)
    assert.deepEqual(Object.keys(offer).sort(), [
      "detail",
      "offerId",
      "subject",
      "topic",
    ]);
  const serialized = JSON.stringify(payload);
  assert.ok(!serialized.includes("Synthetic private name"));
  assert.ok(!serialized.includes("requester-private"));
  assert.ok(!serialized.includes("class-private"));
  const logs = readFileSync(join(dir, "events.ndjson"), "utf8");
  assert.ok(logs.includes("req_synthetic"));
  assert.ok(logs.includes('"inputTokens":200'));
  for (const text of [
    process.env.OPENAI_API_KEY!,
    need.detail,
    need.topic,
    "Synthetic private name",
  ])
    assert.ok(!logs.includes(text));
});

test("discards invented offer IDs and suggests each helper once", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    response([
      { offerId: "invented", reason: "Not a supplied offer." },
      { offerId: "one", reason: "Relevant offer." },
      { offerId: "two", reason: "Same helper again." },
    ]),
  );
  const result = await recommendMatches(
    need,
    [candidate("one", "maya"), candidate("two", "maya")],
    [],
  );
  assert.deepEqual(
    result.matches.map((match) => match.offer.id),
    ["one"],
  );
});

test("does not accept an eligible offer outside the 12 supplied to the model", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    response([{ offerId: "offer-14", reason: "Outside the payload." }]),
  );
  const result = await recommendMatches(
    need,
    Array.from({ length: 15 }, (_, i) => candidate(`offer-${i}`)),
    [],
  );
  assert.equal(result.matches.length, 0);
});

test("provider errors preserve clearly labeled local matches", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("", { status: 429 }),
  );
  const result = await recommendMatches(need, [candidate("offer-0")], [local]);
  assert.equal(result.engine, "local");
  assert.match(result.notice, /unavailable/);
  assert.deepEqual(result.matches, [local]);
});

test("refused or incomplete responses fall back without exposing provider content", async (t) => {
  for (const data of [
    { status: "incomplete", output: [] },
    {
      status: "completed",
      output: [
        {
          content: [{ type: "refusal", refusal: "synthetic-private-refusal" }],
        },
      ],
    },
  ]) {
    const mocked = t.mock.method(globalThis, "fetch", async () =>
      Response.json(data),
    );
    const result = await recommendMatches(
      need,
      [candidate("offer-0")],
      [local],
    );
    assert.equal(result.engine, "local");
    assert.deepEqual(result.matches, [local]);
    assert.ok(!result.notice.includes("synthetic-private-refusal"));
    mocked.mock.restore();
  }
});

test("a valid empty model result does not invent a fallback recommendation", async (t) => {
  t.mock.method(globalThis, "fetch", async () => response([]));
  const result = await recommendMatches(need, [candidate("offer-0")], [local]);
  assert.equal(result.engine, "openai");
  assert.equal(result.matches.length, 0);
});

test("disabled AI and empty eligible sets do not contact the provider", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected provider call");
  });
  process.env.OPENAI_MATCHING_ENABLED = "false";
  assert.equal(
    (await recommendMatches(need, [candidate("offer-0")], [local])).engine,
    "local",
  );
  process.env.OPENAI_MATCHING_ENABLED = "true";
  assert.equal((await recommendMatches(need, [], [])).matches.length, 0);
  assert.equal(fetch.mock.callCount(), 0);
});
