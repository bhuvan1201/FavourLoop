// Preserve the existing SQLite query contract while using parameterized Postgres SQL.
const camelColumns = new Set([
  "classroomId",
  "userId",
  "expiresAt",
  "studentId",
  "createdAt",
  "needId",
  "offerId",
  "helperId",
  "requesterId",
  "endedAt",
  "actorId",
  "sessionId",
  "senderId",
  "authorId",
]);
export function postgresSql(sql: string): string {
  let parameter = 0;
  const ignore = /INSERT OR IGNORE/i.test(sql);
  const converted = sql
    .replace(/PRAGMA[^;]*;/g, "")
    .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, "SERIAL PRIMARY KEY")
    .replace(/INSERT OR IGNORE/gi, "INSERT")
    .replace(
      /'(?:''|[^'])*'|"(?:""|[^"])*"|[A-Za-z_][A-Za-z0-9_]*|\?/g,
      (token) => {
        if (token === "?") return `$${++parameter}`;
        return camelColumns.has(token) ? `"${token}"` : token;
      },
    );
  return ignore
    ? converted.replace(/;?\s*$/, " ON CONFLICT DO NOTHING")
    : converted;
}
