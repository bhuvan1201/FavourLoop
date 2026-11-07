import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesFor } from "../lib/matching.ts";
import type { Need, Offer, Person, Session, Proposal } from "../lib/types.ts";
const need: Need = {
  id: "n",
  studentId: "alex",
  classroomId: "a",
  subject: "Mathematics",
  topic: "Quadratic equations",
  detail: "Help factoring",
  status: "open",
  createdAt: "2026-11-07",
};
const maya: Person = {
  id: "maya",
  name: "Maya",
  role: "student",
  color: "#fff",
  available: 1,
};
const offer: Offer = {
  id: "o",
  studentId: "maya",
  classroomId: "a",
  subject: "Mathematics",
  topic: "Quadratic equations",
  detail: "Factoring and formulas",
  active: 1,
};
test("finds a willing same-class helper without requiring reciprocity", () => {
  const found = matchesFor(need, [offer], [maya], [], []);
  assert.equal(found.length, 1);
  assert.equal(found[0].student.id, "maya");
  assert.match(found[0].reason, /offered help/);
});
test("rejects cross-classroom, unavailable, withdrawn, unrelated and self offers", () => {
  assert.equal(
    matchesFor(need, [{ ...offer, classroomId: "b" }], [maya], [], []).length,
    0,
  );
  assert.equal(
    matchesFor(need, [offer], [{ ...maya, available: 0 }], [], []).length,
    0,
  );
  assert.equal(
    matchesFor(need, [{ ...offer, active: 0 }], [maya], [], []).length,
    0,
  );
  assert.equal(
    matchesFor(need, [{ ...offer, topic: "Essay structure" }], [maya], [], [])
      .length,
    0,
  );
  assert.equal(
    matchesFor(
      need,
      [{ ...offer, studentId: "alex" }],
      [{ ...maya, id: "alex" }],
      [],
      [],
    ).length,
    0,
  );
});
test("does not re-invite a declining helper or overbook an active participant", () => {
  const p: Proposal = {
    id: "p",
    needId: "n",
    helperId: "maya",
    offerId: "o",
    status: "declined",
    createdAt: "",
  };
  assert.equal(matchesFor(need, [offer], [maya], [p], []).length, 0);
  const session: Session = {
    id: "s",
    needId: "other",
    classroomId: "a",
    requesterId: "maya",
    helperId: "sam",
    status: "ready",
    outcome: null,
    createdAt: "",
    endedAt: null,
  };
  assert.equal(matchesFor(need, [offer], [maya], [], [session]).length, 0);
});
test("closed requests never match and one person is suggested only once", () => {
  assert.equal(
    matchesFor({ ...need, status: "resolved" }, [offer], [maya], [], []).length,
    0,
  );
  assert.equal(
    matchesFor(need, [offer, { ...offer, id: "other" }], [maya], [], []).length,
    1,
  );
});

test("requires the specific concept, not just a generic shared word or subject", () => {
  assert.equal(
    matchesFor(need, [{ ...offer, topic: "Linear equations" }], [maya], [], [])
      .length,
    0,
  );
  assert.equal(
    matchesFor(
      need,
      [
        {
          ...offer,
          subject: "Chemistry",
          topic: "Balancing chemical equations",
        },
      ],
      [maya],
      [],
      [],
    ).length,
    0,
  );
  assert.equal(
    matchesFor(
      need,
      [{ ...offer, subject: "Math", topic: "Solving quadratics" }],
      [maya],
      [],
      [],
    ).length,
    1,
  );
  assert.equal(
    matchesFor(
      { ...need, topic: "Factoring quadratic polynomials" },
      [{ ...offer, topic: "Factoring linear expressions" }],
      [maya],
      [],
      [],
    ).length,
    0,
  );
});

test("uses positive offered scope for subtopics and stays conservative about exclusions", () => {
  const specific = {
    ...need,
    subject: "math",
    topic: "Factoring quadratic equations",
  };
  assert.equal(matchesFor(specific, [offer], [maya], [], []).length, 1);
  assert.equal(
    matchesFor(
      specific,
      [
        {
          ...offer,
          detail: "I can only help with the formula, not factoring.",
        },
      ],
      [maya],
      [],
      [],
    ).length,
    0,
  );
});
