import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { database, one, run } from "../lib/db.ts";
import {
  findMatchesFor,
  matchingContext,
  invitableMatch,
} from "../lib/match-service.ts";
import type { RecommendationResult } from "../lib/recommend.ts";
import type { Need } from "../lib/types.ts";
const dir = mkdtempSync(join(tmpdir(), "favourloop-match-service-"));
process.env.FAVOURLOOP_DB = join(dir, "synthetic.sqlite");
process.env.ALLOW_DEMO = "false";
process.env.FAVOURLOOP_LOG_DIR = dir;
after(() => {
  database().close();
  rmSync(dir, { recursive: true, force: true });
});
let number = 0;
async function fixture() {
  const prefix = `case-${++number}`;
  const classroom = `${prefix}-class`,
    requester = `${prefix}-requester`,
    helper = `${prefix}-helper`,
    offerId = `${prefix}-offer`;
  await run(
    "INSERT INTO classrooms VALUES(?,?,?)",
    classroom,
    "Synthetic class",
    "Synthetic school",
  );
  for (const id of [requester, helper])
    await run(
      "INSERT INTO users VALUES(?,?,?,?,?,?,?,?)",
      id,
      `${id}@example.test`,
      "unused-test-password",
      "Synthetic student",
      "student",
      classroom,
      "#fff",
      1,
    );
  const need: Need = {
    id: `${prefix}-need`,
    studentId: requester,
    classroomId: classroom,
    subject: "Mathematics",
    topic: "Writing a second-degree expression as a product",
    detail: "Turn x² + 5x + 6 into (x + 2)(x + 3).",
    status: "open",
    createdAt: new Date().toISOString(),
  };
  await run(
    "INSERT INTO needs VALUES(?,?,?,?,?,?,?,?)",
    need.id,
    requester,
    classroom,
    need.subject,
    need.topic,
    need.detail,
    need.status,
    need.createdAt,
  );
  await run(
    "INSERT INTO offers VALUES(?,?,?,?,?,?,?)",
    offerId,
    helper,
    classroom,
    "Mathematics",
    "Quadratic equations",
    "I can help with factoring quadratic polynomials.",
    1,
  );
  return { need, helper, offerId, classroom, requester };
}
async function suggestion(need: Need): Promise<RecommendationResult> {
  const candidate = (await matchingContext(need)).eligible[0];
  assert.ok(candidate);
  return {
    engine: "openai",
    notice: "AI suggestions.",
    matches: [
      {
        ...candidate,
        reason: "The factoring offer fits the example.",
        score: 0,
      },
    ],
  };
}
test("semantic recommendations authorize invitations for 15 minutes, with no keyword-only bypass", async () => {
  const { need, offerId } = await fixture();
  assert.equal((await matchingContext(need)).local.length, 0);
  assert.equal(await invitableMatch(need, offerId), undefined);
  const result = await findMatchesFor(need, async () => await suggestion(need));
  assert.equal(result.matches.length, 1);
  const stored = (await one<{
    expiresAt: string;
  }>(
    "SELECT expiresAt FROM recommended_matches WHERE needId=? AND offerId=?",
    need.id,
    offerId,
  ))!;
  const remaining = Date.parse(stored.expiresAt) - Date.now();
  assert.ok(remaining > 14 * 60000 && remaining <= 15 * 60000);
  assert.ok(await invitableMatch(need, offerId));
  await run(
    "UPDATE recommended_matches SET expiresAt=? WHERE needId=?",
    new Date(Date.now() - 1000).toISOString(),
    need.id,
  );
  assert.equal(await invitableMatch(need, offerId), undefined);
});
test("rechecks availability after the model responds before returning or caching a match", async () => {
  const { need, helper } = await fixture();
  const modelResult = await suggestion(need);
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const pending = findMatchesFor(need, async () => {
    entered();
    await gate;
    return modelResult;
  });
  await started;
  await run("UPDATE users SET available=0 WHERE id=?", helper);
  release();
  const result = await pending;
  assert.equal(result.matches.length, 0);
  assert.match(result.notice, /changed/);
  assert.equal(
    await one("SELECT * FROM recommended_matches WHERE needId=?", need.id),
    undefined,
  );
});
test("closed requests and withdrawn offers invalidate in-flight recommendations", async () => {
  for (const change of ["request", "offer"]) {
    const { need, offerId } = await fixture();
    const modelResult = await suggestion(need);
    const result = await findMatchesFor(need, async () => {
      if (change === "request")
        await run("UPDATE needs SET status='cancelled' WHERE id=?", need.id);
      else await run("UPDATE offers SET active=0 WHERE id=?", offerId);
      return modelResult;
    });
    assert.equal(result.matches.length, 0);
    assert.equal(
      await one("SELECT * FROM recommended_matches WHERE needId=?", need.id),
      undefined,
    );
  }
});
test("a cached model recommendation never overrides current availability, consent or session capacity", async () => {
  const { need, helper, offerId, classroom, requester } = await fixture();
  await findMatchesFor(need, async () => await suggestion(need));
  await run("UPDATE users SET available=0 WHERE id=?", helper);
  assert.equal(await invitableMatch(need, offerId), undefined);
  await run("UPDATE users SET available=1 WHERE id=?", helper);
  await run(
    "INSERT INTO proposals VALUES(?,?,?,?,?,?)",
    `declined-${need.id}`,
    need.id,
    helper,
    offerId,
    "declined",
    need.createdAt,
  );
  assert.equal(await invitableMatch(need, offerId), undefined);
  await run("DELETE FROM proposals WHERE needId=?", need.id);
  await run(
    "INSERT INTO help_sessions VALUES(?,?,?,?,?,?,?,?,?)",
    `session-${need.id}`,
    need.id,
    classroom,
    requester,
    helper,
    "ready",
    null,
    need.createdAt,
    null,
  );
  assert.equal(await invitableMatch(need, offerId), undefined);
});
test("classroom and student-role restrictions apply before any model receives candidates", async () => {
  const { need, classroom, offerId } = await fixture();
  const other = `${classroom}-other`;
  await run(
    "INSERT INTO classrooms VALUES(?,?,?)",
    other,
    "Other class",
    "Synthetic school",
  );
  for (const [id, role, classId] of [
    [`${classroom}-outsider`, "student", other],
    [`${classroom}-teacher`, "teacher", classroom],
  ]) {
    await run(
      "INSERT INTO users VALUES(?,?,?,?,?,?,?,?)",
      id,
      `${id}@example.test`,
      "unused-test-password",
      "Synthetic person",
      role,
      classId,
      "#fff",
      1,
    );
    await run(
      "INSERT INTO offers VALUES(?,?,?,?,?,?,?)",
      `${id}-offer`,
      id,
      classId,
      "Mathematics",
      "Quadratic equations",
      "Factoring quadratics",
      1,
    );
  }
  await findMatchesFor(need, async (_need, eligible) => {
    assert.deepEqual(
      eligible.map((match) => match.offer.id),
      [offerId],
    );
    return await suggestion(need);
  });
});
