import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import type { User } from "./types";
const globalDb = globalThis as unknown as { favourDb?: DatabaseSync };
export const demoEnabled = () =>
  process.env.ALLOW_DEMO === "true" ||
  (process.env.NODE_ENV !== "production" && process.env.ALLOW_DEMO !== "false");
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function database() {
  if (globalDb.favourDb) return globalDb.favourDb;
  const path =
    process.env.FAVOURLOOP_DB ||
    join(process.cwd(), ".data", "favourloop.sqlite");
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS classrooms (id TEXT PRIMARY KEY, name TEXT NOT NULL, school TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('student','teacher')), classroomId TEXT NOT NULL REFERENCES classrooms(id), color TEXT NOT NULL, available INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS invitations (code TEXT PRIMARY KEY, classroomId TEXT NOT NULL REFERENCES classrooms(id), role TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS auth_sessions (token TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id), expiresAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS offers (id TEXT PRIMARY KEY, studentId TEXT NOT NULL REFERENCES users(id), classroomId TEXT NOT NULL REFERENCES classrooms(id), subject TEXT NOT NULL, topic TEXT NOT NULL, detail TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS needs (id TEXT PRIMARY KEY, studentId TEXT NOT NULL REFERENCES users(id), classroomId TEXT NOT NULL REFERENCES classrooms(id), subject TEXT NOT NULL, topic TEXT NOT NULL, detail TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', createdAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS recommended_matches (needId TEXT NOT NULL REFERENCES needs(id), offerId TEXT NOT NULL REFERENCES offers(id), expiresAt TEXT NOT NULL, PRIMARY KEY(needId,offerId));
 CREATE TABLE IF NOT EXISTS proposals (id TEXT PRIMARY KEY, needId TEXT NOT NULL REFERENCES needs(id), helperId TEXT NOT NULL REFERENCES users(id), offerId TEXT NOT NULL REFERENCES offers(id), status TEXT NOT NULL DEFAULT 'pending', createdAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS help_sessions (id TEXT PRIMARY KEY, needId TEXT NOT NULL REFERENCES needs(id), classroomId TEXT NOT NULL REFERENCES classrooms(id), requesterId TEXT NOT NULL REFERENCES users(id), helperId TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL DEFAULT 'ready', outcome TEXT, createdAt TEXT NOT NULL, endedAt TEXT);
 CREATE UNIQUE INDEX IF NOT EXISTS one_active_session ON help_sessions(needId) WHERE status != 'ended';
 CREATE TABLE IF NOT EXISTS activity (id TEXT PRIMARY KEY, classroomId TEXT NOT NULL REFERENCES classrooms(id), actorId TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, text TEXT NOT NULL, createdAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS drafts (id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id), data TEXT NOT NULL, consumed INTEGER NOT NULL DEFAULT 0, expiresAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS signals (id INTEGER PRIMARY KEY AUTOINCREMENT, sessionId TEXT NOT NULL REFERENCES help_sessions(id), senderId TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, payload TEXT NOT NULL, createdAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS transcript (id INTEGER PRIMARY KEY AUTOINCREMENT, sessionId TEXT NOT NULL REFERENCES help_sessions(id), authorId TEXT NOT NULL REFERENCES users(id), text TEXT NOT NULL, source TEXT NOT NULL, createdAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS call_consents (sessionId TEXT NOT NULL REFERENCES help_sessions(id), userId TEXT NOT NULL REFERENCES users(id), createdAt TEXT NOT NULL, PRIMARY KEY(sessionId,userId));
 CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, sessionId TEXT NOT NULL REFERENCES help_sessions(id), authorId TEXT NOT NULL REFERENCES users(id), text TEXT NOT NULL, createdAt TEXT NOT NULL);
 `);
  globalDb.favourDb = db;
  if (!db.prepare("SELECT id FROM classrooms LIMIT 1").get() && demoEnabled())
    seed(db);
  return db;
}
export function all<T>(sql: string, ...args: SQLInputValue[]): T[] {
  return database()
    .prepare(sql)
    .all(...args) as unknown as T[];
}
export function one<T>(sql: string, ...args: SQLInputValue[]): T | undefined {
  return database()
    .prepare(sql)
    .get(...args) as T | undefined;
}
export function run(sql: string, ...args: SQLInputValue[]) {
  return database()
    .prepare(sql)
    .run(...args);
}
export const uid = () => randomBytes(12).toString("hex");
export const now = () => new Date().toISOString();
export function transaction<T>(fn: () => T): T {
  const db = database();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export function logEvent(user: User, kind: string, text: string) {
  run(
    "INSERT INTO activity VALUES(?,?,?,?,?,?)",
    uid(),
    user.classroomId,
    user.id,
    kind,
    text,
    now(),
  );
}
function seed(db: DatabaseSync) {
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO classrooms VALUES(?,?,?)").run(
      "class-10b",
      "Class 10B",
      "Ridgeview High School",
    );
    db.prepare("INSERT INTO classrooms VALUES(?,?,?)").run(
      "class-11a",
      "Class 11A",
      "Ridgeview High School",
    );
    for (const [code, c, r] of [
      ["LOOP10", "class-10b", "student"],
      ["TEACH10", "class-10b", "teacher"],
      ["LOOP11", "class-11a", "student"],
      ["TEACH11", "class-11a", "teacher"],
    ])
      db.prepare("INSERT INTO invitations VALUES(?,?,?)").run(code, c, r);
    const password = passwordHash(randomBytes(32).toString("hex"));
    const students = [
      ["alex", "Alex Morgan", "student", "#dcd4f8"],
      ["maya", "Maya Chen", "student", "#f7d9b9"],
      ["jordan", "Jordan Ellis", "student", "#c7e8d8"],
      ["sam", "Sam Taylor", "student", "#e9d3df"],
      ["rivera", "Ms. Rivera", "teacher", "#cddff2"],
    ];
    for (const [id, name, role, color] of students)
      db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?,?,?)").run(
        id,
        `${id}@demo.favourloop.local`,
        password,
        name,
        role,
        "class-10b",
        color,
        1,
      );
    db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?,?,?)").run(
      "outside",
      "outside@demo.favourloop.local",
      password,
      "Casey Brooks",
      "student",
      "class-11a",
      "#eee",
      1,
    );
    const offers = [
      [
        "offer-alex",
        "alex",
        "Chemistry",
        "Balancing chemical equations",
        "I can walk through balancing simple chemical equations.",
      ],
      [
        "offer-maya",
        "maya",
        "Mathematics",
        "Quadratic equations",
        "Happy to explain factoring and the quadratic formula, step by step.",
      ],
      [
        "offer-jordan",
        "jordan",
        "English",
        "Essay structure",
        "I can help you build a thesis and organize an argument.",
      ],
      [
        "offer-sam",
        "sam",
        "Biology",
        "Cell division",
        "Let’s untangle mitosis and meiosis together.",
      ],
    ];
    for (const [id, studentId, subject, topic, detail] of offers)
      db.prepare("INSERT INTO offers VALUES(?,?,?,?,?,?,1)").run(
        id,
        studentId,
        "class-10b",
        subject,
        topic,
        detail,
      );
    for (const [id, studentId, subject, topic, detail, minutes] of [
      [
        "need-alex",
        "alex",
        "Mathematics",
        "Quadratic equations",
        "I understand the formula, but I get stuck choosing when to factor.",
        "32",
      ],
      [
        "need-jordan",
        "jordan",
        "Chemistry",
        "Balancing chemical equations",
        "Could someone walk me through balancing a chemical equation?",
        "18",
      ],
    ]) {
      const created = new Date(
        Date.now() - Number(minutes) * 60000,
      ).toISOString();
      db.prepare("INSERT INTO needs VALUES(?,?,?,?,?,?,?,?)").run(
        id,
        studentId,
        "class-10b",
        subject,
        topic,
        detail,
        "open",
        created,
      );
      db.prepare("INSERT INTO activity VALUES(?,?,?,?,?,?)").run(
        uid(),
        "class-10b",
        studentId,
        "request",
        `Asked for help with ${topic.toLowerCase()}`,
        created,
      );
    }
    for (const [, studentId, , topic] of offers)
      db.prepare("INSERT INTO activity VALUES(?,?,?,?,?,?)").run(
        uid(),
        "class-10b",
        studentId,
        "offer",
        `Offered help with ${topic.toLowerCase()}`,
        new Date(Date.now() - 3600000).toISOString(),
      );
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
