import { NextRequest, NextResponse } from "next/server";
import {
  scryptSync,
  timingSafeEqual,
  randomBytes,
  createHash,
} from "node:crypto";
import { z } from "zod";
import {
  all,
  one,
  run,
  transaction,
  uid,
  now,
  logEvent,
  passwordHash,
  demoEnabled,
} from "@/lib/db";
import { interpret, itemSchema } from "@/lib/interpret";
import { findMatchesFor, invitableMatch } from "@/lib/match-service";
import { aiMatchingEnabled } from "@/lib/recommend";
import { recordDiagnostic, withTrace } from "@/lib/diagnostics";
import type {
  User,
  Person,
  Offer,
  Need,
  Proposal,
  Session,
  Activity,
  Transcript,
  DraftItem,
} from "@/lib/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};
const ok = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const limitStore = globalThis as unknown as {
  flLimits?: Map<string, { n: number; reset: number }>;
};
function rateLimit(key: string, max = 30) {
  const map = (limitStore.flLimits ||= new Map());
  const hit = map.get(key);
  if (!hit || hit.reset < Date.now()) {
    map.set(key, { n: 1, reset: Date.now() + 60000 });
    return;
  }
  if (++hit.n > max) fail(429, "Please wait a moment before trying again.");
}
function userFor(req: NextRequest): User {
  const token = req.cookies.get("fl_session")?.value;
  if (!token) return fail(401, "Please sign in to continue.");
  const user = one<User>(
    "SELECT u.id,u.email,u.name,u.role,u.classroomId,u.color,u.available FROM users u JOIN auth_sessions s ON s.userId=u.id WHERE s.token=? AND s.expiresAt>?",
    digest(token),
    now(),
  );
  return user || fail(401, "Your session has expired. Please sign in again.");
}
function student(user: User) {
  if (user.role !== "student")
    fail(403, "Teachers have read-only access to learning interactions.");
}
function sessionFor(user: User, id: string, participant = false): Session {
  const session = one<Session>(
    "SELECT * FROM help_sessions WHERE id=? AND classroomId=?",
    id,
    user.classroomId,
  );
  if (
    !session ||
    (user.role !== "teacher" &&
      ![session.requesterId, session.helperId].includes(user.id))
  )
    return fail(404, "Session not found.");
  if (
    participant &&
    (user.role !== "student" ||
      ![session.requesterId, session.helperId].includes(user.id))
  )
    fail(
      403,
      "Only the two participating students can join or change this session.",
    );
  return session;
}
function authResponse(userId: string) {
  const token = randomBytes(32).toString("hex");
  run(
    "INSERT INTO auth_sessions VALUES(?,?,?)",
    digest(token),
    userId,
    new Date(Date.now() + 7 * 86400000).toISOString(),
  );
  const response = ok({ success: true });
  response.cookies.set("fl_session", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: 7 * 86400,
  });
  return response;
}
function stateFor(user: User) {
  const c = user.classroomId;
  const people = all<Person>(
    "SELECT id,name,role,color,available FROM users WHERE classroomId=?",
    c,
  );
  const offers = all<Offer>(
    "SELECT * FROM offers WHERE classroomId=? AND active=1",
    c,
  );
  const needs = all<Need>(
    user.role === "teacher"
      ? "SELECT * FROM needs WHERE classroomId=? ORDER BY createdAt DESC"
      : "SELECT * FROM needs WHERE classroomId=? AND (studentId=? OR status='open' OR id IN (SELECT needId FROM help_sessions WHERE requesterId=? OR helperId=?)) ORDER BY createdAt DESC",
    ...(user.role === "teacher" ? [c] : [c, user.id, user.id, user.id]),
  );
  const proposals = all<Proposal>(
    `SELECT p.* FROM proposals p JOIN needs n ON p.needId=n.id WHERE n.classroomId=? ${user.role === "teacher" ? "" : "AND (n.studentId=? OR p.helperId=?)"}`,
    ...(user.role === "teacher" ? [c] : [c, user.id, user.id]),
  );
  const sessions = all<Session>(
    `SELECT * FROM help_sessions WHERE classroomId=? ${user.role === "teacher" ? "" : "AND (requesterId=? OR helperId=?)"} ORDER BY createdAt DESC`,
    ...(user.role === "teacher" ? [c] : [c, user.id, user.id]),
  );
  const activity = all<Activity>(
    `SELECT * FROM activity WHERE classroomId=? ${user.role === "teacher" ? "" : "AND actorId=?"} ORDER BY createdAt DESC LIMIT 80`,
    ...(user.role === "teacher" ? [c] : [c, user.id]),
  );
  const reports =
    user.role === "teacher"
      ? all(
          "SELECT r.* FROM reports r JOIN help_sessions s ON s.id=r.sessionId WHERE s.classroomId=? ORDER BY r.createdAt DESC",
          c,
        )
      : [];
  return {
    user,
    classroom: one("SELECT * FROM classrooms WHERE id=?", c),
    people,
    offers,
    needs,
    proposals,
    sessions,
    activity,
    reports,
    demo: demoEnabled(),
    ai: Boolean(process.env.OPENAI_API_KEY),
    aiMatching: aiMatchingEnabled(),
  };
}
async function handler(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  try {
    const segments = (await ctx.params).path;
    const path = segments.join("/");
    if (req.method === "GET" && path === "config")
      return ok({
        demo: demoEnabled(),
        ai: Boolean(process.env.OPENAI_API_KEY),
        aiMatching: aiMatchingEnabled(),
      });
    if (req.method !== "GET") {
      const origin = req.headers.get("origin");
      const requestedUrl = new URL(req.url);
      const expectedOrigin =
        process.env.FAVOURLOOP_ORIGIN ||
        `${requestedUrl.protocol}//${req.headers.get("host") || requestedUrl.host}`;
      if (origin && origin !== expectedOrigin)
        fail(403, "This request must come from the app.");
    }
    if (Number(req.headers.get("content-length") || 0) > 100000)
      fail(413, "This message is too large.");
    const body = req.method === "POST" ? await req.json() : {};
    if (path.startsWith("auth/") && req.method === "POST") {
      rateLimit(`auth:${req.headers.get("x-forwarded-for") || "local"}`, 40);
      if (path === "auth/logout") {
        const token = req.cookies.get("fl_session")?.value;
        if (token)
          run("DELETE FROM auth_sessions WHERE token=?", digest(token));
        const r = ok({ success: true });
        r.cookies.delete("fl_session");
        return r;
      }
      if (path === "auth/demo") {
        if (!demoEnabled()) fail(404, "Demo access is disabled.");
        const { id } = z
          .object({
            id: z.enum(["alex", "maya", "jordan", "sam", "rivera", "outside"]),
          })
          .parse(body);
        if (!one("SELECT id FROM users WHERE id=?", id))
          fail(404, "Demo account not found.");
        return authResponse(id);
      }
      if (path === "auth/signup") {
        const data = z
          .object({
            name: z.string().trim().min(2).max(60),
            email: z.email().max(160),
            password: z.string().min(10).max(128),
            role: z.enum(["student", "teacher"]),
            code: z.string().trim().min(2).max(40),
          })
          .parse(body);
        const invitation = one<{ classroomId: string; role: string }>(
          "SELECT * FROM invitations WHERE code=?",
          data.code.toUpperCase(),
        );
        if (!invitation || invitation.role !== data.role)
          fail(403, "Use a valid classroom invitation for your selected role.");
        if (one("SELECT id FROM users WHERE email=?", data.email.toLowerCase()))
          fail(409, "This email already has an account. Please sign in.");
        const id = uid();
        run(
          "INSERT INTO users VALUES(?,?,?,?,?,?,?,1)",
          id,
          data.email.toLowerCase(),
          passwordHash(data.password),
          data.name,
          data.role,
          invitation!.classroomId,
          "#dcd4f8",
        );
        return authResponse(id);
      }
      if (path === "auth/login") {
        const data = z
          .object({ email: z.email(), password: z.string().max(128) })
          .parse(body);
        const u = one<User & { password: string }>(
          "SELECT * FROM users WHERE email=?",
          data.email.toLowerCase(),
        );
        const [salt, expected] = (
          u?.password || passwordHash("unavailable")
        ).split(":");
        const actual = scryptSync(data.password, salt, 64);
        if (!u || !timingSafeEqual(actual, Buffer.from(expected, "hex")))
          fail(401, "The email or password is incorrect.");
        return authResponse(u!.id);
      }
      fail(404, "Unknown account action.");
    }
    const user = userFor(req);
    if (req.method === "GET" && path === "state") return ok(stateFor(user));
    if (req.method === "GET" && segments[0] === "matches") {
      student(user);
      const need = one<Need>(
        "SELECT * FROM needs WHERE id=? AND studentId=? AND classroomId=?",
        segments[1],
        user.id,
        user.classroomId,
      );
      if (!need) fail(404, "Request not found.");
      rateLimit(`matches:${user.id}`, 6);
      return ok(await findMatchesFor(need!));
    }
    if (req.method === "GET" && segments[0] === "sessions") {
      const s = sessionFor(user, segments[1], segments[2] === "signals");
      if (segments[2] === "signals") {
        const after = z.coerce
          .number()
          .int()
          .nonnegative()
          .parse(req.nextUrl.searchParams.get("after") || "0");
        return ok({
          status: s.status,
          signals: all(
            "SELECT * FROM signals WHERE sessionId=? AND id>? AND senderId!=? ORDER BY id LIMIT 100",
            s.id,
            after,
            user.id,
          ),
        });
      }
      return ok({
        session: s,
        need: one<Need>("SELECT * FROM needs WHERE id=?", s.needId),
        transcript: all<Transcript>(
          "SELECT * FROM transcript WHERE sessionId=? ORDER BY id",
          s.id,
        ),
        people: all<Person>(
          "SELECT id,name,role,color,available FROM users WHERE id IN (?,?)",
          s.requesterId,
          s.helperId,
        ),
      });
    }
    if (req.method !== "POST") fail(404, "Page not found.");
    student(user);
    rateLimit(`user:${user.id}`, 180);
    if (path === "intake") {
      const data = z
        .object({
          text: z.string().trim().min(3).max(3000),
          mode: z.enum(["need", "offer"]),
        })
        .parse(body);
      rateLimit(`intake:${user.id}`, 10);
      const result = await interpret(data.text, data.mode);
      const id = uid(),
        expiresAt = new Date(Date.now() + 30 * 60000).toISOString();
      run(
        "INSERT INTO drafts VALUES(?,?,?,0,?)",
        id,
        user.id,
        JSON.stringify(result),
        expiresAt,
      );
      return ok({ id, ...result, expiresAt });
    }
    if (path === "intake/confirm") {
      const data = z
        .object({ id: z.string(), items: z.array(itemSchema).min(1).max(6) })
        .parse(body);
      return ok(
        transaction(() => {
          const draft = one<{ consumed: number; expiresAt: string }>(
            "SELECT * FROM drafts WHERE id=? AND userId=?",
            data.id,
            user.id,
          );
          if (!draft || draft.consumed || draft.expiresAt < now())
            fail(
              409,
              "This draft has expired or was already saved. Start a new draft.",
            );
          const ids: string[] = [];
          for (const item of data.items) {
            const id = uid();
            if (item.kind === "need")
              run(
                "INSERT INTO needs VALUES(?,?,?,?,?,?,?,?)",
                id,
                user.id,
                user.classroomId,
                item.subject,
                item.topic,
                item.detail,
                "open",
                now(),
              );
            else
              run(
                "INSERT INTO offers VALUES(?,?,?,?,?,?,1)",
                id,
                user.id,
                user.classroomId,
                item.subject,
                item.topic,
                item.detail,
              );
            ids.push(id);
            logEvent(
              user,
              item.kind === "need" ? "request" : "offer",
              `${item.kind === "need" ? "Asked for" : "Offered"} help with ${item.topic.toLowerCase()}`,
            );
          }
          run("UPDATE drafts SET consumed=1 WHERE id=?", data.id);
          return { success: true, ids };
        }),
      );
    }
    if (path === "availability") {
      const { available } = z.object({ available: z.boolean() }).parse(body);
      run(
        "UPDATE users SET available=? WHERE id=?",
        Number(available),
        user.id,
      );
      if (!available)
        run(
          "UPDATE proposals SET status='expired' WHERE helperId=? AND status='pending'",
          user.id,
        );
      return ok({ success: true });
    }
    if (path === "offers/withdraw") {
      const { id } = z.object({ id: z.string() }).parse(body);
      if (!one("SELECT id FROM offers WHERE id=? AND studentId=?", id, user.id))
        fail(404, "Offer not found.");
      transaction(() => {
        run("UPDATE offers SET active=0 WHERE id=?", id);
        run(
          "UPDATE proposals SET status='expired' WHERE offerId=? AND status='pending'",
          id,
        );
        logEvent(user, "offer", "Withdrew a help offer");
      });
      return ok({ success: true });
    }
    if (path === "needs/cancel") {
      const { id } = z.object({ id: z.string() }).parse(body);
      if (
        !one(
          "SELECT id FROM needs WHERE id=? AND studentId=? AND status='open'",
          id,
          user.id,
        )
      )
        fail(409, "Only an open request can be closed here.");
      transaction(() => {
        run("UPDATE needs SET status='cancelled' WHERE id=?", id);
        run(
          "UPDATE proposals SET status='expired' WHERE needId=? AND status='pending'",
          id,
        );
        logEvent(user, "closed", "Closed a help request");
      });
      return ok({ success: true });
    }
    if (path === "invite") {
      const { needId, offerId } = z
        .object({ needId: z.string(), offerId: z.string() })
        .parse(body);
      return ok(
        transaction(() => {
          const need = one<Need>(
            "SELECT * FROM needs WHERE id=? AND studentId=?",
            needId,
            user.id,
          );
          if (!need) fail(404, "Request not found.");
          if (
            one(
              "SELECT id FROM proposals WHERE needId=? AND status='pending'",
              needId,
            )
          )
            fail(
              409,
              "You already have a pending invitation for this request.",
            );
          const match = invitableMatch(need!, offerId);
          if (!match)
            fail(409, "This helper is no longer available for this request.");
          run(
            "INSERT INTO proposals VALUES(?,?,?,?,?,?)",
            uid(),
            needId,
            match!.student.id,
            offerId,
            "pending",
            now(),
          );
          logEvent(
            user,
            "invite",
            `Invited ${match!.student.name.split(" ")[0]} to help with ${need!.topic.toLowerCase()}`,
          );
          return { success: true };
        }),
      );
    }
    if (path === "proposals/respond") {
      const { id, accept } = z
        .object({ id: z.string(), accept: z.boolean() })
        .parse(body);
      return ok(
        transaction(() => {
          const p = one<Proposal>(
            "SELECT * FROM proposals WHERE id=? AND helperId=? AND status='pending'",
            id,
            user.id,
          );
          if (!p) fail(409, "This invitation is no longer pending.");
          const need = one<Need>(
            "SELECT * FROM needs WHERE id=? AND classroomId=?",
            p!.needId,
            user.classroomId,
          );
          const offer = one<Offer>(
            "SELECT * FROM offers WHERE id=? AND studentId=? AND active=1",
            p!.offerId,
            user.id,
          );
          if (!need || need.status !== "open" || !offer)
            fail(409, "The request or offer is no longer available.");
          if (!accept) {
            run("UPDATE proposals SET status='declined' WHERE id=?", id);
            logEvent(
              user,
              "declined",
              `Declined an invitation for ${need!.topic.toLowerCase()}`,
            );
            return { success: true };
          }
          if (
            !user.available ||
            one(
              "SELECT id FROM help_sessions WHERE status!='ended' AND (requesterId IN (?,?) OR helperId IN (?,?))",
              user.id,
              need!.studentId,
              user.id,
              need!.studentId,
            )
          )
            fail(409, "One participant already has an active session.");
          const sessionId = uid();
          run(
            "INSERT INTO help_sessions VALUES(?,?,?,?,?,?,?,?,?)",
            sessionId,
            need!.id,
            user.classroomId,
            need!.studentId,
            user.id,
            "ready",
            null,
            now(),
            null,
          );
          run("UPDATE needs SET status='matched' WHERE id=?", need!.id);
          run("UPDATE proposals SET status='accepted' WHERE id=?", id);
          run(
            "UPDATE proposals SET status='expired' WHERE needId=? AND id!=? AND status='pending'",
            need!.id,
            id,
          );
          logEvent(
            user,
            "accepted",
            `Accepted a session for ${need!.topic.toLowerCase()}`,
          );
          return { success: true, sessionId };
        }),
      );
    }
    if (segments[0] === "sessions") {
      const s = sessionFor(user, segments[1], true);
      const action = segments[2];
      if (action === "outcome") {
        if (user.id !== s.requesterId)
          fail(
            403,
            "Only the student who asked can report their learning outcome.",
          );
        const { outcome } = z
          .object({ outcome: z.enum(["resolved", "still_need_help"]) })
          .parse(body);
        if (s.outcome) {
          if (s.outcome === outcome) return ok({ success: true });
          fail(
            409,
            "This session already has a recorded outcome. Your current request has not been changed.",
          );
        }
        transaction(() => {
          const currentNeed = one<Need>(
            "SELECT * FROM needs WHERE id=?",
            s.needId,
          );
          if (
            currentNeed?.status !== "matched" ||
            one(
              "SELECT id FROM help_sessions WHERE needId=? AND id!=? AND status!='ended'",
              s.needId,
              s.id,
            )
          )
            fail(409, "This session no longer controls the current request.");
          run(
            "UPDATE help_sessions SET status='ended',endedAt=COALESCE(endedAt,?),outcome=? WHERE id=?",
            now(),
            outcome,
            s.id,
          );
          run(
            "UPDATE needs SET status=? WHERE id=?",
            outcome === "resolved" ? "resolved" : "open",
            s.needId,
          );
          run(
            "UPDATE proposals SET status='expired' WHERE needId=? AND status='accepted'",
            s.needId,
          );
          logEvent(
            user,
            "outcome",
            outcome === "resolved"
              ? "Reported that their learning question was resolved"
              : "Still needs help after a session",
          );
        });
        return ok({ success: true });
      }
      if (action === "report") {
        const { text } = z
          .object({ text: z.string().trim().min(3).max(1000) })
          .parse(body);
        run(
          "INSERT INTO reports VALUES(?,?,?,?,?)",
          uid(),
          s.id,
          user.id,
          text,
          now(),
        );
        logEvent(
          user,
          "report",
          "Asked the classroom teacher to review a session",
        );
        return ok({ success: true });
      }
      if (s.status === "ended") fail(409, "This session has ended.");
      if (action === "join") {
        z.object({ acknowledged: z.literal(true) }).parse(body);
        run(
          "INSERT OR IGNORE INTO call_consents VALUES(?,?,?)",
          s.id,
          user.id,
          now(),
        );
        if (s.status === "ready") {
          run("UPDATE help_sessions SET status='active' WHERE id=?", s.id);
          logEvent(user, "call", "Started a peer learning call");
        }
        return ok({
          success: true,
          cursor: one<{ n: number }>(
            "SELECT COALESCE(MAX(id),0) AS n FROM signals WHERE sessionId=?",
            s.id,
          )!.n,
        });
      }
      if (action === "signal") {
        if (
          !one(
            "SELECT userId FROM call_consents WHERE sessionId=? AND userId=?",
            s.id,
            user.id,
          )
        )
          fail(403, "Review the call notice before joining.");
        const { kind, payload } = z
          .object({
            kind: z.enum(["ready", "offer", "answer", "candidate", "leave"]),
            payload: z.string().max(60000),
          })
          .parse(body);
        JSON.parse(payload);
        run(
          "INSERT INTO signals(sessionId,senderId,kind,payload,createdAt) VALUES(?,?,?,?,?)",
          s.id,
          user.id,
          kind,
          payload,
          now(),
        );
        return ok({ success: true });
      }
      if (action === "transcript") {
        if (
          !one(
            "SELECT userId FROM call_consents WHERE sessionId=? AND userId=?",
            s.id,
            user.id,
          )
        )
          fail(403, "Join the session before sharing notes.");
        const { text, source } = z
          .object({
            text: z.string().trim().min(1).max(2000),
            source: z.enum(["speech", "note"]),
          })
          .parse(body);
        run(
          "INSERT INTO transcript(sessionId,authorId,text,source,createdAt) VALUES(?,?,?,?,?)",
          s.id,
          user.id,
          text,
          source,
          now(),
        );
        return ok({ success: true });
      }
      if (action === "end") {
        run(
          "UPDATE help_sessions SET status='ended',endedAt=? WHERE id=?",
          now(),
          s.id,
        );
        logEvent(user, "call", "Ended a peer learning call; outcome pending");
        return ok({ success: true });
      }
    }
    return fail(404, "Action not found.");
  } catch (error) {
    if (error instanceof HttpError)
      return ok({ error: error.message }, error.status);
    if (error instanceof z.ZodError)
      return ok(
        {
          error:
            error.issues[0]?.message ||
            "Please check the information you entered.",
        },
        400,
      );
    if (error instanceof SyntaxError)
      return ok({ error: "Invalid request data." }, 400);
    console.error(
      "[FavourLoop]",
      error instanceof Error ? error.message : "Unknown error",
    );
    return ok(
      {
        error:
          "Something went wrong. Your saved information is safe. Please try again.",
      },
      500,
    );
  }
}
async function tracedHandler(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const traceId = randomBytes(12).toString("hex");
  return withTrace(traceId, async () => {
    const startedAt = Date.now();
    const segments = (await ctx.params).path;
    const known = new Set([
      "config",
      "state",
      "auth/signup",
      "auth/login",
      "auth/logout",
      "auth/demo",
      "intake",
      "intake/confirm",
      "availability",
      "offers/withdraw",
      "needs/cancel",
      "invite",
      "proposals/respond",
    ]);
    const actions = new Set([
      "signals",
      "join",
      "signal",
      "transcript",
      "end",
      "outcome",
      "report",
    ]);
    const path = segments.join("/");
    const route =
      segments[0] === "matches"
        ? "matches/:id"
        : segments[0] === "sessions"
          ? `sessions/:id${actions.has(segments[2]) ? `/${segments[2]}` : ""}`
          : known.has(path)
            ? path
            : "unknown";
    const response = await handler(req, ctx);
    response.headers.set("X-FavourLoop-Trace-Id", traceId);
    recordDiagnostic({
      event: "http.request",
      status: response.status,
      durationMs: Date.now() - startedAt,
      method: req.method,
      route,
    });
    return response;
  });
}
export const GET = tracedHandler;
export const POST = tracedHandler;
