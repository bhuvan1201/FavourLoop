import type { Need, Offer, Person, Proposal, Session, Match } from "./types.ts";

const genericWords = new Set([
  "help",
  "with",
  "need",
  "understand",
  "explain",
  "can",
  "the",
  "and",
  "equation",
  "equations",
  "problem",
  "problems",
  "introduction",
  "basics",
  "practice",
  "lesson",
  "lessons",
  "solving",
]);
function tokens(text: string) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !genericWords.has(word))
      .map((word) =>
        word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word,
      ),
  );
}
function subjectKey(subject: string) {
  const key = subject.toLowerCase().trim().replace(/\s+/g, " ");
  const aliases: Record<string, string> = {
    mathematics: "math",
    maths: "math",
    "english language arts": "english",
    "language arts": "english",
    "computer science": "computing",
    programming: "computing",
    coding: "computing",
    language: "languages",
    spanish: "languages",
    french: "languages",
  };
  return aliases[key] || key;
}

export function canonicalSubject(subject: string) {
  const labels: Record<string, string> = {
    math: "Mathematics",
    english: "English",
    computing: "Computer science",
    languages: "Languages",
    chemistry: "Chemistry",
    biology: "Biology",
    physics: "Physics",
    history: "History",
  };
  return labels[subjectKey(subject)] || subject;
}

export type EligibleMatch = Pick<Match, "offer" | "student">;

export function eligibleFor(
  need: Need,
  offers: Offer[],
  people: Person[],
  proposals: Proposal[],
  sessions: Session[],
): EligibleMatch[] {
  if (
    need.status !== "open" ||
    sessions.some(
      (session) =>
        session.status !== "ended" &&
        [session.requesterId, session.helperId].includes(need.studentId),
    )
  )
    return [];
  return offers.flatMap((offer) => {
    const student = people.find((person) => person.id === offer.studentId);
    if (
      !student ||
      !student.available ||
      student.role !== "student" ||
      !offer.active ||
      offer.classroomId !== need.classroomId ||
      student.id === need.studentId ||
      subjectKey(offer.subject) !== subjectKey(need.subject)
    )
      return [];
    if (
      proposals.some(
        (proposal) =>
          proposal.needId === need.id &&
          proposal.helperId === student.id &&
          ["declined", "pending", "accepted"].includes(proposal.status),
      ) ||
      sessions.some(
        (session) =>
          session.status !== "ended" &&
          [session.requesterId, session.helperId].includes(student.id),
      )
    )
      return [];
    return [{ offer, student }];
  });
}

export function matchesFor(
  need: Need,
  offers: Offer[],
  people: Person[],
  proposals: Proposal[],
  sessions: Session[],
): Match[] {
  const needWords = tokens(need.topic);
  if (!needWords.size) return [];
  return eligibleFor(need, offers, people, proposals, sessions)
    .flatMap(({ offer, student }) => {
      const topicWords = tokens(offer.topic);
      if (![...needWords].some((word) => topicWords.has(word))) return [];
      if (/\b(don't|do not|can't|cannot|except|only|not)\b/i.test(offer.detail))
        return [];
      const offerWords = tokens(`${offer.topic} ${offer.detail}`);
      const coverage =
        [...needWords].filter((word) => offerWords.has(word)).length /
        needWords.size;
      // A shared generic word such as "equations" does not establish a suitable topic.
      if (coverage < 0.6) return [];
      return [
        {
          offer,
          student,
          score: Math.round(coverage * 100),
          reason: `${student.name.split(" ")[0]} offered help with ${offer.topic.toLowerCase()} and is available. Review the scope together before starting.`,
        },
      ];
    })
    .sort((a, b) => b.score - a.score)
    .filter(
      (match, index, results) =>
        results.findIndex(
          (result) => result.student.id === match.student.id,
        ) === index,
    );
}
