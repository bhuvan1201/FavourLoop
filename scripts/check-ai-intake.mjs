import { request } from "@playwright/test";
import assert from "node:assert/strict";
const baseURL = process.env.TEST_URL || "http://127.0.0.1:3002";
assert.ok(
  ["127.0.0.1", "localhost"].includes(new URL(baseURL).hostname),
  "Use a separate localhost test server.",
);
const student = await request.newContext({ baseURL }),
  teacher = await request.newContext({ baseURL });
async function json(response) {
  assert.equal(response.status(), 200, `Unexpected HTTP ${response.status()}`);
  return response.json();
}
try {
  const config = await json(await student.get("/api/config"));
  assert.ok(
    config.demo && config.ai,
    "The local test server must have demo access and OpenAI configured.",
  );
  await json(
    await student.post("/api/auth/signup", {
      data: {
        name: "AI Integration Test",
        email: `ai-check-${crypto.randomUUID()}@example.test`,
        password: "synthetic-test-only-123",
        role: "student",
        code: "LOOP10",
      },
    }),
  );
  await json(await teacher.post("/api/auth/demo", { data: { id: "rivera" } }));
  const initial = await json(await student.get("/api/state"));
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
  await json(
    await student.post("/api/intake/confirm", {
      data: { id: draft.id, items: draft.items },
    }),
  );
  const after = await json(await teacher.get("/api/state"));
  const needs = after.needs.filter(
      (item) => item.studentId === initial.user.id,
    ),
    offers = after.offers.filter((item) => item.studentId === initial.user.id);
  assert.equal(needs.length, 1);
  assert.equal(offers.length, 1);
  // With AI matching enabled, this compares the approved learning fields from synthetic classroom fixtures.
  const matches = await json(await student.get(`/api/matches/${needs[0].id}`));
  assert.ok(
    matches.matches.some((match) => match.student.id === "maya"),
    "The confirmed specific topic should match Maya’s factoring offer.",
  );
  console.log(
    JSON.stringify(
      {
        aiConnection: "verified",
        draftPrivateUntilConfirmed: true,
        confirmedNeeds: needs.length,
        confirmedOffers: offers.length,
        suitableHelperFound: true,
      },
      null,
      2,
    ),
  );
} finally {
  await student.dispose();
  await teacher.dispose();
}
