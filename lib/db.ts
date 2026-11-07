import { AsyncLocalStorage } from "node:async_hooks";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { Pool, type PoolClient } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import {
  database,
  SQLITE_SCHEMA,
  seed,
  demoEnabled,
  uid,
  now,
} from "./sqlite.ts";
import { postgresSql } from "./postgres-sql.ts";
import type { User } from "./types.ts";
export { database, demoEnabled, uid, now, passwordHash } from "./sqlite.ts";

const state = globalThis as unknown as {
  flPool?: Pool;
  flDatabaseReady?: Promise<void>;
  flDbContext?: AsyncLocalStorage<PoolClient | "sqlite">;
  flSqliteQueue?: Promise<void>;
};
const context = (state.flDbContext ||= new AsyncLocalStorage());
const hosted = () => Boolean(process.env.DATABASE_URL);

async function pool(): Promise<Pool> {
  if (!state.flPool) {
    state.flPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 10000,
    });
    if (process.env.VERCEL === "1") attachDatabasePool(state.flPool);
    // Do not log connection strings or provider errors containing credentials.
    state.flPool.on("error", () =>
      console.error("[FavourLoop] Database connection interrupted."),
    );
  }
  const p = state.flPool;
  if (!state.flDatabaseReady) {
    state.flDatabaseReady = initialize(p).catch((error) => {
      state.flDatabaseReady = undefined;
      throw error;
    });
  }
  await state.flDatabaseReady;
  return p;
}

async function initialize(p: Pool) {
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(848489)");
    await client.query(postgresSql(SQLITE_SCHEMA));
    const existing = await client.query("SELECT id FROM classrooms LIMIT 1");
    if (!existing.rowCount && demoEnabled()) {
      // Seed only synthetic fixtures. No local accounts are uploaded.
      const memory = new DatabaseSync(":memory:");
      try {
        memory.exec(SQLITE_SCHEMA);
        seed(memory);
        for (const table of [
          "classrooms",
          "invitations",
          "users",
          "offers",
          "needs",
          "activity",
        ]) {
          for (const row of memory.prepare(`SELECT * FROM ${table}`).all()) {
            const keys = Object.keys(row);
            await client.query(
              postgresSql(
                `INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
              ),
              Object.values(row),
            );
          }
        }
      } finally {
        memory.close();
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function localLock<T>(fn: () => Promise<T> | T): Promise<T> {
  const previous = state.flSqliteQueue || Promise.resolve();
  let release!: () => void;
  state.flSqliteQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}

export async function all<T>(
  sql: string,
  ...args: SQLInputValue[]
): Promise<T[]> {
  if (hosted()) {
    const current = context.getStore();
    const connection = current && current !== "sqlite" ? current : await pool();
    const result = await connection.query(postgresSql(sql), args);
    return result.rows as T[];
  }
  if (process.env.VERCEL === "1")
    throw new Error("DATABASE_URL is required on Vercel.");
  const read = () =>
    database()
      .prepare(sql)
      .all(...args) as unknown as T[];
  return context.getStore() === "sqlite" ? read() : localLock(read);
}
export async function one<T>(
  sql: string,
  ...args: SQLInputValue[]
): Promise<T | undefined> {
  return (await all<T>(sql, ...args))[0];
}
export async function run(
  sql: string,
  ...args: SQLInputValue[]
): Promise<{ changes: number | bigint }> {
  if (!context.getStore()) return transaction(() => run(sql, ...args));
  const current = context.getStore();
  if (current && current !== "sqlite") {
    const result = await current.query(postgresSql(sql), args);
    return { changes: result.rowCount || 0 };
  }
  return database()
    .prepare(sql)
    .run(...args);
}
export async function transaction<T>(fn: () => Promise<T> | T): Promise<T> {
  if (context.getStore()) return fn();
  if (hosted()) {
    const client = await (await pool()).connect();
    try {
      await client.query("BEGIN");
      // Serialize this small classroom demo's writes across function instances.
      // Re-evaluate all acceptance/consent checks after obtaining the lock.
      await client.query("SELECT pg_advisory_xact_lock(848490)");
      const result = await context.run(client, fn);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  if (process.env.VERCEL === "1")
    throw new Error("DATABASE_URL is required on Vercel.");
  return localLock(async () => {
    const db = database();
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = await context.run("sqlite", fn);
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  });
}
export async function logEvent(user: User, kind: string, text: string) {
  await run(
    "INSERT INTO activity VALUES(?,?,?,?,?,?)",
    uid(),
    user.classroomId,
    user.id,
    kind,
    text,
    now(),
  );
}
export async function closeHostedDatabase() {
  if (state.flPool) await state.flPool.end();
  state.flPool = undefined;
  state.flDatabaseReady = undefined;
}
