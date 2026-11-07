import assert from "node:assert/strict";
import {
  all,
  one,
  run,
  transaction,
  closeHostedDatabase,
  uid,
} from "../lib/db.ts";

if (!process.env.DATABASE_URL)
  throw new Error("A hosted DATABASE_URL is required.");
const id = `verification-${uid()}`;
try {
  const alex = await one<{ classroomId: string }>(
    "SELECT classroomId FROM users WHERE id=?",
    "alex",
  );
  assert.equal(alex?.classroomId, "class-10b");
  await assert.rejects(
    transaction(async () => {
      await run(
        "INSERT INTO classrooms VALUES(?,?,?)",
        id,
        "Synthetic rollback check",
        "Synthetic",
      );
      assert.ok(await one("SELECT id FROM classrooms WHERE id=?", id));
      throw new Error("intentional rollback");
    }),
    /intentional rollback/,
  );
  assert.equal(
    await one("SELECT id FROM classrooms WHERE id=?", id),
    undefined,
  );
  await run("INSERT INTO classrooms VALUES(?,?,?)", id, "0", "Synthetic");
  await Promise.all(
    Array.from({ length: 6 }, () =>
      transaction(async () => {
        const row = await one<{ name: string }>(
          "SELECT name FROM classrooms WHERE id=?",
          id,
        );
        await new Promise((resolve) => setTimeout(resolve, 10));
        await run(
          "UPDATE classrooms SET name=? WHERE id=?",
          String(Number(row!.name) + 1),
          id,
        );
      }),
    ),
  );
  assert.equal(
    (await one<{ name: string }>("SELECT name FROM classrooms WHERE id=?", id))
      ?.name,
    "6",
  );
  assert.ok(
    (await all("SELECT * FROM offers WHERE classroomId=?", "class-10b"))
      .length >= 4,
  );
  console.log(
    "PASS: hosted schema, synthetic seed, camel-case fields, rollback, concurrent transaction serialization.",
  );
} finally {
  await run("DELETE FROM classrooms WHERE id=?", id);
  await closeHostedDatabase();
}
