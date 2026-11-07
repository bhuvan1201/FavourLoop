export type Role = "student" | "teacher";
export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  classroomId: string;
  color: string;
  available: number;
};
export type Person = Omit<User, "email" | "classroomId">;
export type Offer = {
  id: string;
  studentId: string;
  classroomId: string;
  subject: string;
  topic: string;
  detail: string;
  active: number;
};
export type Need = {
  id: string;
  studentId: string;
  classroomId: string;
  subject: string;
  topic: string;
  detail: string;
  status: "open" | "matched" | "resolved" | "cancelled";
  createdAt: string;
};
export type Proposal = {
  id: string;
  needId: string;
  helperId: string;
  offerId: string;
  status: "pending" | "accepted" | "declined" | "expired";
  createdAt: string;
};
export type Session = {
  id: string;
  needId: string;
  classroomId: string;
  requesterId: string;
  helperId: string;
  status: "ready" | "active" | "ended";
  outcome: string | null;
  createdAt: string;
  endedAt: string | null;
};
export type Activity = {
  id: string;
  classroomId: string;
  actorId: string;
  kind: string;
  text: string;
  createdAt: string;
};
export type Transcript = {
  id: number;
  sessionId: string;
  authorId: string;
  text: string;
  source: "speech" | "note";
  createdAt: string;
};
export type DraftItem = {
  kind: "need" | "offer";
  subject: string;
  topic: string;
  detail: string;
};
export type Draft = {
  id: string;
  items: DraftItem[];
  clarification: string;
  engine: "openai" | "local";
  expiresAt: string;
};
export type State = {
  user: User;
  classroom: { id: string; name: string; school: string };
  people: Person[];
  offers: Offer[];
  needs: Need[];
  proposals: Proposal[];
  sessions: Session[];
  activity: Activity[];
  demo: boolean;
  ai: boolean;
  aiMatching: boolean;
};
export type Match = {
  offer: Offer;
  student: Person;
  reason: string;
  score: number;
};
