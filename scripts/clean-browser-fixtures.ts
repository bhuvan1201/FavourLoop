import { all, run, transaction, closeHostedDatabase } from "../lib/db.ts";

if (!process.env.DATABASE_URL)
  throw new Error("Hosted verification database required.");
try {
  await transaction(async () => {
    const users = await all<{ id: string }>(
      "SELECT id FROM users WHERE email LIKE ? AND name IN (?,?,?)",
      "%@example.test",
      "Avery Test",
      "Test Student",
      "Test Teacher",
    );
    for (const { id } of users) {
      const sessions = await all<{ id: string }>(
        "SELECT id FROM help_sessions WHERE requesterId=? OR helperId=?",
        id,
        id,
      );
      for (const session of sessions) {
        for (const table of [
          "reports",
          "transcript",
          "signals",
          "call_consents",
        ])
          await run(`DELETE FROM ${table} WHERE sessionId=?`, session.id);
        await run("DELETE FROM help_sessions WHERE id=?", session.id);
      }
      await run(
        "DELETE FROM recommended_matches WHERE needId IN (SELECT id FROM needs WHERE studentId=?) OR offerId IN (SELECT id FROM offers WHERE studentId=?)",
        id,
        id,
      );
      await run(
        "DELETE FROM proposals WHERE helperId=? OR needId IN (SELECT id FROM needs WHERE studentId=?)",
        id,
        id,
      );
      await run("DELETE FROM needs WHERE studentId=?", id);
      await run("DELETE FROM offers WHERE studentId=?", id);
      await run("DELETE FROM activity WHERE actorId=?", id);
      await run("DELETE FROM drafts WHERE userId=?", id);
      await run("DELETE FROM auth_sessions WHERE userId=?", id);
      await run("DELETE FROM users WHERE id=?", id);
    }
    console.log(
      `Removed ${users.length} synthetic browser-test accounts and their records.`,
    );
  });
} finally {
  await closeHostedDatabase();
}
