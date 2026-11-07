import { request, chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join, basename } from "node:path";
import { matchesFor } from "../lib/matching.ts";

const baseURL = process.env.TEST_URL || "http://127.0.0.1:3002";
assert.ok(
  ["127.0.0.1", "localhost"].includes(new URL(baseURL).hostname),
  "Use an isolated localhost test server.",
);
const dbPath =
  process.env.FAVOURLOOP_TEST_DB ||
  join(process.cwd(), ".data", "ai-matching-check.sqlite");
assert.equal(
  basename(dbPath),
  "ai-matching-check.sqlite",
  "This script only changes its dedicated synthetic fixture database.",
);
const runId = (
  process.env.FAVOURLOOP_RUN_ID ||
  new Date().toISOString().replace(/[:.]/g, "-")
).replace(/[^a-z0-9_-]/gi, "_");
const artifacts = join(process.cwd(), ".logs", "integration", runId);
mkdirSync(artifacts, { recursive: true, mode: 0o700 });
const student = await request.newContext({ baseURL }),
  teacher = await request.newContext({ baseURL }),
  helper = await request.newContext({ baseURL }),
  outsider = await request.newContext({ baseURL });
const traceIds = [];
let db, browser, context, page;
async function json(response) {
  const traceId = response.headers()["x-favourloop-trace-id"];
  assert.ok(traceId, "The API response should carry a trace identifier.");
  traceIds.push(traceId);
  assert.equal(
    response.status(),
    200,
    `Unexpected HTTP ${response.status()} (trace ${traceId})`,
  );
  return response.json();
}
try {
  const config = await json(await student.get("/api/config"));
  assert.ok(
    config.demo && config.ai && config.aiMatching,
    "Start the dedicated demo server with the local OpenAI key.",
  );
  await json(
    await student.post("/api/auth/signup", {
      data: {
        name: "AI Matching Test",
        email: `ai-match-${crypto.randomUUID()}@example.test`,
        password: "synthetic-test-only-123",
        role: "student",
        code: "LOOP10",
      },
    }),
  );
  await json(await teacher.post("/api/auth/demo", { data: { id: "rivera" } }));
  await json(await helper.post("/api/auth/demo", { data: { id: "maya" } }));
  await json(
    await outsider.post("/api/auth/demo", { data: { id: "outside" } }),
  );
  const initial = await json(await student.get("/api/state"));
  db = new DatabaseSync(dbPath);
  db.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;");
  assert.ok(
    db
      .prepare(
        "SELECT id FROM users WHERE id=? AND email LIKE '%@example.test'",
      )
      .get(initial.user.id),
    "The fixture database must belong to this test server.",
  );
  const excludedId = `formula-only-${crypto.randomUUID()}`;
  db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?,?,?)").run(
    excludedId,
    `${excludedId}@example.test`,
    "unused-synthetic-password",
    "Formula-only Test Helper",
    "student",
    initial.user.classroomId,
    "#fff",
    1,
  );
  db.prepare("INSERT INTO offers VALUES(?,?,?,?,?,?,?)").run(
    excludedId,
    excludedId,
    initial.user.classroomId,
    "Mathematics",
    "Quadratic equations",
    "I can only help with the quadratic formula. I cannot help with factoring or writing expressions as products.",
    1,
  );

  const draft = await json(
    await student.post("/api/intake", {
      data: {
        mode: "need",
        text: "I need help factoring quadratic equations. I can help with balancing chemical equations.",
      },
    }),
  );
  assert.equal(draft.engine, "openai");
  assert.ok(
    draft.items.some(
      (item) => item.kind === "need" && item.subject === "Mathematics",
    ),
  );
  assert.ok(
    draft.items.some(
      (item) => item.kind === "offer" && item.subject === "Chemistry",
    ),
  );
  const before = await json(await teacher.get("/api/state"));
  assert.equal(
    before.needs.filter((item) => item.studentId === initial.user.id).length,
    0,
  );
  assert.equal(
    before.offers.filter((item) => item.studentId === initial.user.id).length,
    0,
  );
  // Review/edit the private card into equivalent wording that has no keyword overlap.
  const items = draft.items.map((item) =>
    item.kind === "need"
      ? {
          ...item,
          subject: "Mathematics",
          topic: "Writing a second-degree expression as a product",
          detail: "Turn x² + 5x + 6 into (x + 2)(x + 3).",
        }
      : item,
  );
  await json(
    await student.post("/api/intake/confirm", {
      data: { id: draft.id, items },
    }),
  );
  const after = await json(await teacher.get("/api/state"));
  const need = after.needs.find((item) => item.studentId === initial.user.id);
  assert.ok(need);
  assert.equal(
    after.offers.filter((item) => item.studentId === initial.user.id).length,
    1,
  );
  assert.equal(
    matchesFor(
      need,
      after.offers,
      after.people,
      after.proposals,
      after.sessions,
    ).length,
    0,
    "The synthetic case should require semantic matching.",
  );
  const result = await json(await student.get(`/api/matches/${need.id}`));
  assert.equal(result.engine, "openai");
  assert.ok(result.matches.some((match) => match.offer.id === "offer-maya"));
  assert.ok(
    !result.matches.some((match) => match.offer.id === excludedId),
    "An explicitly excluded topic must not be recommended.",
  );
  assert.equal((await teacher.get(`/api/matches/${need.id}`)).status(), 403);
  assert.equal((await outsider.get(`/api/matches/${need.id}`)).status(), 404);
  writeFileSync(
    join(artifacts, "synthetic-recommendations.json"),
    JSON.stringify({ data: "synthetic", result }, null, 2),
  );

  browser = await chromium.launch({ channel: "chrome" });
  context = await browser.newContext({
    baseURL,
    storageState: await student.storageState(),
    viewport: { width: 1280, height: 900 },
  });
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  page = await context.newPage();
  page.on("console", (message) =>
    appendFileSync(
      join(artifacts, "browser-console.ndjson"),
      JSON.stringify({
        type: message.type(),
        text: message.text().replace(/sk-[A-Za-z0-9_-]{16,}/g, "[REDACTED]"),
      }) + "\n",
    ),
  );
  page.on("pageerror", (error) =>
    appendFileSync(
      join(artifacts, "browser-console.ndjson"),
      JSON.stringify({
        type: "pageerror",
        text: error.message.replace(/sk-[A-Za-z0-9_-]{16,}/g, "[REDACTED]"),
      }) + "\n",
    ),
  );
  await page.goto("/dashboard");
  await page
    .getByRole("button", { name: "Find a helper", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("AI suggestions", {
    timeout: 30000,
  });
  await expect(page.getByRole("dialog")).toContainText("Maya Chen");
  await expect(page.getByRole("dialog")).not.toContainText(
    "Formula-only Test Helper",
  );
  await page.screenshot({
    path: join(artifacts, "ai-match-dialog.png"),
    fullPage: false,
  });
  await context.tracing.stop({ path: join(artifacts, "browser-trace.zip") });
  await context.close();
  context = undefined;
  await browser.close();
  browser = undefined;

  db.prepare("UPDATE recommended_matches SET expiresAt=? WHERE needId=?").run(
    new Date(Date.now() - 1000).toISOString(),
    need.id,
  );
  assert.equal(
    (
      await student.post("/api/invite", {
        data: { needId: need.id, offerId: "offer-maya" },
      })
    ).status(),
    409,
  );
  const refreshed = await json(await student.get(`/api/matches/${need.id}`));
  assert.equal(refreshed.engine, "openai");
  assert.ok(refreshed.matches.some((match) => match.offer.id === "offer-maya"));
  await json(
    await helper.post("/api/availability", { data: { available: false } }),
  );
  assert.equal(
    (
      await student.post("/api/invite", {
        data: { needId: need.id, offerId: "offer-maya" },
      })
    ).status(),
    409,
  );
  await json(
    await helper.post("/api/availability", { data: { available: true } }),
  );
  await json(
    await student.post("/api/invite", {
      data: { needId: need.id, offerId: "offer-maya" },
    }),
  );
  const pending = await json(await helper.get("/api/state"));
  const proposal = pending.proposals.find(
    (item) => item.needId === need.id && item.status === "pending",
  );
  assert.ok(proposal);
  assert.ok(
    !pending.sessions.some((item) => item.needId === need.id),
    "Model recommendations and invitations must not auto-accept a session.",
  );
  const accepted = await json(
    await helper.post("/api/proposals/respond", {
      data: { id: proposal.id, accept: true },
    }),
  );
  assert.ok(accepted.sessionId);
  await json(
    await student.post(`/api/sessions/${accepted.sessionId}/outcome`, {
      data: { outcome: "resolved" },
    }),
  );
  const summary = {
    data: "synthetic",
    aiInterpretation: "passed",
    draftPrivacy: "passed",
    semanticMatchWithoutKeywordOverlap: "passed",
    excludedOfferRejected: "passed",
    teacherAndClassroomBoundaries: "passed",
    expiredRecommendationRejected: "passed",
    unavailableHelperRejected: "passed",
    mutualConsent: "passed",
    aiLabelInBrowser: "passed",
    traceIds,
    artifacts,
  };
  writeFileSync(
    join(artifacts, "result.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  if (page && !page.isClosed())
    await page
      .screenshot({ path: join(artifacts, "failure.png"), fullPage: true })
      .catch(() => {});
  throw error;
} finally {
  if (context) {
    await context.tracing
      .stop({ path: join(artifacts, "browser-trace.zip") })
      .catch(() => {});
    await context.close();
  }
  if (browser) await browser.close();
  db?.close();
  await Promise.all([
    student.dispose(),
    teacher.dispose(),
    helper.dispose(),
    outsider.dispose(),
  ]);
}
