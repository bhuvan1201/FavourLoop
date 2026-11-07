import { all, one, run, now, transaction } from "./db.ts";
import { eligibleFor, matchesFor } from "./matching.ts";
import { recommendMatches, type RecommendationResult } from "./recommend.ts";
import type { Need, Offer, Person, Proposal, Session } from "./types.ts";

export function matchingContext(need: Need) {
  const offers = all<Offer>(
    "SELECT * FROM offers WHERE classroomId=? AND active=1 ORDER BY id",
    need.classroomId,
  );
  const people = all<Person>(
    "SELECT id,name,role,color,available FROM users WHERE classroomId=?",
    need.classroomId,
  );
  const proposals = all<Proposal>(
    "SELECT * FROM proposals WHERE needId=?",
    need.id,
  );
  const sessions = all<Session>(
    "SELECT * FROM help_sessions WHERE status!='ended'",
  );
  return {
    eligible: eligibleFor(need, offers, people, proposals, sessions),
    local: matchesFor(need, offers, people, proposals, sessions),
  };
}

export async function findMatchesFor(
  need: Need,
  recommend: typeof recommendMatches = recommendMatches,
): Promise<RecommendationResult> {
  const context = matchingContext(need);
  const result = await recommend(need, context.eligible, context.local);
  return transaction(() => {
    const currentNeed = one<Need>(
      "SELECT * FROM needs WHERE id=? AND studentId=? AND classroomId=?",
      need.id,
      need.studentId,
      need.classroomId,
    );
    const sameRequest =
      currentNeed &&
      ["subject", "topic", "detail"].every(
        (field) =>
          currentNeed[field as "subject" | "topic" | "detail"] ===
          need[field as "subject" | "topic" | "detail"],
      );
    const current = sameRequest ? matchingContext(currentNeed!).eligible : [];
    const originalById = new Map(
      context.eligible.map((match) => [match.offer.id, match]),
    );
    const currentById = new Map(
      current.map((match) => [match.offer.id, match]),
    );
    const helpers = new Set<string>();
    const matches = result.matches
      .flatMap((match) => {
        const candidate = currentById.get(match.offer.id);
        const original = originalById.get(match.offer.id);
        if (
          !candidate ||
          !original ||
          candidate.student.id !== match.student.id ||
          helpers.has(candidate.student.id)
        )
          return [];
        if (
          ["subject", "topic", "detail"].some(
            (field) =>
              candidate.offer[field as "subject" | "topic" | "detail"] !==
              original.offer[field as "subject" | "topic" | "detail"],
          )
        )
          return [];
        helpers.add(candidate.student.id);
        return [{ ...match, ...candidate }];
      })
      .slice(0, 3);
    run(
      "DELETE FROM recommended_matches WHERE needId=? OR expiresAt<=?",
      need.id,
      now(),
    );
    const expiresAt = new Date(Date.now() + 15 * 60000).toISOString();
    for (const match of matches) {
      run(
        "INSERT INTO recommended_matches(needId,offerId,expiresAt) VALUES(?,?,?)",
        need.id,
        match.offer.id,
        expiresAt,
      );
    }
    return {
      ...result,
      matches,
      notice:
        matches.length < result.matches.length
          ? "Availability changed while we looked. These suggestions reflect who can help now."
          : result.notice,
    };
  });
}

export function invitableMatch(need: Need, offerId: string) {
  const context = matchingContext(need);
  const candidate = context.eligible.find(
    (match) => match.offer.id === offerId,
  );
  if (!candidate) return undefined;
  const locallySuitable = context.local.some(
    (match) => match.offer.id === offerId,
  );
  const recommendation = one<{ offerId: string }>(
    "SELECT offerId FROM recommended_matches WHERE needId=? AND offerId=? AND expiresAt>?",
    need.id,
    offerId,
    now(),
  );
  return locallySuitable || recommendation ? candidate : undefined;
}
