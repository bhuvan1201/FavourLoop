import { test } from "node:test";
import assert from "node:assert/strict";
import { postgresSql } from "../lib/postgres-sql.ts";

test("Postgres conversion preserves literals and camel-case row fields", () => {
  assert.equal(
    postgresSql(
      "SELECT classroomId FROM users WHERE userId=? AND name='why? classroomId'",
    ),
    'SELECT "classroomId" FROM users WHERE "userId"=$1 AND name=\'why? classroomId\'',
  );
});
test("Postgres consent writes remain idempotent", () => {
  assert.equal(
    postgresSql("INSERT OR IGNORE INTO call_consents VALUES(?,?,?)"),
    "INSERT INTO call_consents VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
  );
});
