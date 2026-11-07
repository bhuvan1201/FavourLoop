import { test } from "node:test";
import assert from "node:assert/strict";
import { interpret } from "../lib/interpret.ts";
delete process.env.OPENAI_API_KEY;
test("keeps a need and a voluntary offer separate", async () => {
  const r = await interpret(
    "I need help with quadratic equations and I can help with balancing chemical equations.",
    "need",
  );
  assert.equal(r.engine, "local");
  assert.deepEqual(
    r.items.map((i) => [i.kind, i.topic]),
    [
      ["need", "Quadratic equations"],
      ["offer", "Balancing chemical equations"],
    ],
  );
});
test("ambiguous negation and excluded topics require clarification", async () => {
  for (const text of [
    "I cannot help with algebra.",
    "I used to struggle with fractions.",
    "Do not save that.",
    "I can help with chemistry except organic chemistry.",
  ]) {
    const r = await interpret(text, "offer");
    assert.equal(r.items.length, 0);
    assert.ok(r.clarification);
  }
});
test("unknown topic does not invent a learning fact", async () => {
  assert.equal((await interpret("um hello there", "need")).items.length, 0);
});
