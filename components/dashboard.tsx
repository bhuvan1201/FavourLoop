"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  HandHeart,
  MessageCircle,
  Headphones,
  Users,
  BookOpen,
  Sparkles,
  ArrowRight,
  ArrowUpRight,
  Plus,
  ChevronRight,
  ChevronDown,
  Bell,
  Search,
  Settings,
  LogOut,
  Mic,
  Check,
  Clock3,
  CircleHelp,
  ShieldCheck,
  Activity as ActivityIcon,
  X,
  Loader2,
  GraduationCap,
  SlidersHorizontal,
  CheckCircle2,
  Leaf,
} from "lucide-react";
import {
  Logo,
  Avatar,
  Subject,
  Status,
  Empty,
  Modal,
  SectionTitle,
  timeAgo,
  api,
} from "./ui";
import { VoicePanel } from "./voice-panel";
import type { State, Need, Match, Person, Session } from "@/lib/types";
type ExtendedState = State & {
  reports: {
    id: string;
    sessionId: string;
    authorId: string;
    text: string;
    createdAt: string;
  }[];
};
export function Dashboard() {
  const router = useRouter(),
    searchParams = useSearchParams();
  const view = searchParams.get("view") || "overview";
  const matchSequence = useRef(0);
  const [state, setState] = useState<ExtendedState | null>(null),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [voice, setVoice] = useState<"need" | "offer" | null>(null),
    [selected, setSelected] = useState<Need | null>(null),
    [matches, setMatches] = useState<Match[]>([]),
    [matchBusy, setMatchBusy] = useState(false),
    [matchEngine, setMatchEngine] = useState<"openai" | "local">("local"),
    [matchNotice, setMatchNotice] = useState(""),
    [matchError, setMatchError] = useState(""),
    [busy, setBusy] = useState(""),
    [settings, setSettings] = useState(false),
    [person, setPerson] = useState<Person | null>(null),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [mobileMenu, setMobileMenu] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const s = await api<ExtendedState>("state");
      setState(s);
      setError("");
    } catch (e) {
      const message = (e as Error).message;
      if (message.includes("sign in") || message.includes("expired"))
        window.location.href = "/login";
      else setError(message);
    }
  }, []);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 3500);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    setQuery("");
    setFilter("all");
    setMobileMenu(false);
  }, [view]);
  const closeVoice = useCallback(() => setVoice(null), []),
    closeMatch = useCallback(() => {
      matchSequence.current += 1;
      setSelected(null);
    }, []),
    closeSettings = useCallback(() => setSettings(false), []),
    closePerson = useCallback(() => setPerson(null), []);
  async function action(
    path: string,
    body: unknown,
    key: string,
    message: string,
  ) {
    setBusy(key);
    try {
      await api(path, body);
      setToast(message);
      await refresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy("");
    }
  }
  async function find(need: Need) {
    const sequence = ++matchSequence.current;
    setSelected(need);
    setMatches([]);
    setMatchNotice("");
    setMatchError("");
    setMatchBusy(true);
    try {
      const result = await api<{
        matches: Match[];
        engine: "openai" | "local";
        notice: string;
      }>(`matches/${need.id}`);
      if (sequence !== matchSequence.current) return;
      setMatches(result.matches);
      setMatchEngine(result.engine);
      setMatchNotice(result.notice);
    } catch (e) {
      if (sequence === matchSequence.current)
        setMatchError((e as Error).message);
    } finally {
      if (sequence === matchSequence.current) setMatchBusy(false);
    }
  }
  async function invite(match: Match) {
    if (!selected) return;
    const sent = await action(
      "invite",
      { needId: selected.id, offerId: match.offer.id },
      match.offer.id,
      "Invitation sent. Your classmate can choose whether to help.",
    );
    if (sent) setSelected(null);
  }
  async function confirmed(ids: string[]) {
    setToast("Saved to your learning profile. You choose who to invite.");
    try {
      const fresh = await api<ExtendedState>("state");
      setState(fresh);
      const need = fresh.needs.find(
        (n) =>
          ids.includes(n.id) &&
          n.studentId === fresh.user.id &&
          n.status === "open",
      );
      if (need) await find(need);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!state)
    return (
      <div className="loading-page">
        <Logo />
        <Loader2 className="spin" size={25} />
        <p>{error || "Opening your learning circle…"}</p>
      </div>
    );
  const {
    user,
    people,
    needs,
    offers,
    proposals,
    sessions,
    activity,
    classroom,
  } = state;
  const teacher = user.role === "teacher";
  const first = user.name.split(" ")[0];
  const p = (id: string) => people.find((x) => x.id === id);
  const ownNeeds = teacher
    ? needs
    : needs.filter((n) => n.studentId === user.id);
  const ownOffers = offers.filter((o) => o.studentId === user.id);
  const pending = proposals.filter(
    (x) => x.status === "pending" && x.helperId === user.id,
  );
  const active = sessions.filter((s) => s.status !== "ended");
  const tabs = teacher
    ? [
        { id: "overview", label: "Classroom overview", icon: LayoutDashboard },
        { id: "students", label: "Students", icon: Users },
        { id: "requests", label: "Learning requests", icon: MessageCircle },
        { id: "sessions", label: "Peer sessions", icon: Headphones },
        { id: "activity", label: "Activity & reports", icon: ActivityIcon },
      ]
    : [
        { id: "overview", label: "My overview", icon: LayoutDashboard },
        { id: "requests", label: "My requests", icon: MessageCircle },
        { id: "help", label: "Lend a hand", icon: HandHeart },
        { id: "sessions", label: "My sessions", icon: Headphones },
        { id: "profile", label: "Learning profile", icon: BookOpen },
      ];
  const navigate = (id: string) => router.push(`/dashboard?view=${id}`);
  const matchPending = (needId: string) =>
    proposals.find((x) => x.needId === needId && x.status === "pending");
  const filteredNeeds = ownNeeds.filter(
    (n) =>
      (filter === "all" || n.status === filter) &&
      `${n.topic} ${n.subject} ${n.detail} ${p(n.studentId)?.name}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  function requestCard(n: Need) {
    const inviter = matchPending(n.id);
    const owner = p(n.studentId);
    return (
      <article className="request-card" key={n.id}>
        <div className="row between">
          <Subject name={n.subject} />
          <span className="small muted">{timeAgo(n.createdAt)}</span>
        </div>
        <h3>{n.topic}</h3>
        <p className="request-detail">{n.detail}</p>
        {teacher && owner && (
          <div className="row small">
            <Avatar name={owner.name} color={owner.color} size="sm" />
            {owner.name}
          </div>
        )}
        <div className="request-footer">
          <Status value={inviter ? "pending" : n.status} />
          {!teacher && n.status === "open" && !inviter && (
            <button className="text-link" onClick={() => find(n)}>
              Find a helper <ArrowUpRight size={16} />
            </button>
          )}
          {!teacher && n.status === "matched" && (
            <a
              className="text-link"
              href={`/session/${sessions.find((s) => s.needId === n.id && s.status !== "ended")?.id || sessions.find((s) => s.needId === n.id)?.id}`}
            >
              Open session <ArrowUpRight size={16} />
            </a>
          )}
        </div>
        {inviter && (
          <p className="invitation-caption">
            Waiting for{" "}
            {p(inviter.helperId)?.name.split(" ")[0] || "your classmate"} to
            reply. They can freely decline.
          </p>
        )}
        {!teacher && n.status === "open" && view === "requests" && (
          <button
            className="quiet-button small"
            onClick={() =>
              action("needs/cancel", { id: n.id }, n.id, "Request closed.")
            }
            disabled={busy === n.id}
          >
            Close request
          </button>
        )}
      </article>
    );
  }
  function sessionCard(s: Session) {
    const other = p(s.requesterId === user.id ? s.helperId : s.requesterId),
      need = needs.find((n) => n.id === s.needId);
    return (
      <a href={`/session/${s.id}`} key={s.id} className="session-card">
        <div className="row">
          <span className="session-icon">
            <Headphones size={21} />
          </span>
          <div>
            <h3>{need?.topic || "Peer learning session"}</h3>
            <p>
              {teacher
                ? `${p(s.requesterId)?.name} & ${p(s.helperId)?.name}`
                : `With ${other?.name || "your classmate"}`}
            </p>
          </div>
        </div>
        <div className="row">
          <Status value={s.status} />
          <ArrowUpRight size={18} />
        </div>
      </a>
    );
  }
  const incoming = (
    <>
      {pending.length > 0 && (
        <section className="incoming-panel">
          <span className="eyebrow">SOMEONE COULD USE YOUR HELP</span>
          {pending.map((inv) => {
            const need = needs.find((n) => n.id === inv.needId),
              student = need ? p(need.studentId) : undefined;
            return (
              <div className="incoming-row" key={inv.id}>
                <Avatar
                  name={student?.name || "Classmate"}
                  color={student?.color}
                />
                <div className="grow">
                  <strong>{student?.name} has a question</strong>
                  <p>
                    {need?.topic} · {need?.detail}
                  </p>
                </div>
                <button
                  className="button secondary small"
                  disabled={!!busy}
                  onClick={() =>
                    action(
                      "proposals/respond",
                      { id: inv.id, accept: false },
                      inv.id,
                      "Invitation declined. It’s always okay to say no.",
                    )
                  }
                >
                  Not this time
                </button>
                <button
                  className="button primary small"
                  disabled={!!busy}
                  onClick={() =>
                    action(
                      "proposals/respond",
                      { id: inv.id, accept: true },
                      inv.id,
                      "You’re connected! Open your session when you’re ready.",
                    )
                  }
                >
                  I can help <ArrowRight size={15} />
                </button>
              </div>
            );
          })}
        </section>
      )}
    </>
  );
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <Logo />
        <div className="workspace-chip">
          <span className="workspace-icon">
            <GraduationCap size={19} />
          </span>
          <div>
            <strong>{classroom.name}</strong>
            <small>{classroom.school}</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-caption">
          {teacher ? "YOUR CLASSROOM" : "YOUR SPACE"}
        </div>
        <nav className="side-nav">
          {tabs.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`/dashboard?view=${id}`}
              onClick={(e) => {
                e.preventDefault();
                navigate(id);
              }}
              className={view === id ? "active" : ""}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === "sessions" && pending.length > 0 && (
                <b className="nav-badge">{pending.length}</b>
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="community-note">
            <span className="note-icon">✦</span>
            <p>
              {teacher
                ? "A little visibility. A lot of room to grow."
                : "You don’t have to know everything to help someone."}
            </p>
            <span>
              {teacher
                ? "OBSERVE. ENCOURAGE. SUPPORT."
                : "THAT’S THE BEAUTY OF A LOOP."}
            </span>
          </div>
          <button className="sidebar-setting" onClick={() => setSettings(true)}>
            <Settings size={18} /> Settings & classroom
          </button>
          <div className="account">
            <Avatar name={user.name} color={user.color} />
            <div>
              <strong>{user.name}</strong>
              <small>{teacher ? "Teacher · read-only" : "Student"}</small>
            </div>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={async () => {
                await api("auth/logout", {});
                window.location.href = "/";
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <div className="row">
            <button
              className="icon-button mobile-menu-button"
              onClick={() => setMobileMenu(!mobileMenu)}
              aria-label="Toggle navigation"
            >
              <BookOpen size={21} />
            </button>
            <span className="breadcrumb">
              My classroom <ChevronRight size={13} />{" "}
              <strong>
                {tabs.find((t) => t.id === view)?.label || "Overview"}
              </strong>
            </span>
          </div>
          <div className="row topbar-right">
            <span className="topbar-date">
              {new Intl.DateTimeFormat("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              }).format(new Date())}
            </span>
            <button
              className="icon-button notification-button"
              aria-label={
                teacher ? "View classroom activity" : "View session invitations"
              }
              onClick={() => navigate(teacher ? "activity" : "sessions")}
            >
              <Bell size={19} />
              {pending.length > 0 && <i />}
            </button>
            <Avatar name={user.name} color={user.color} size="sm" />
          </div>
        </header>
        <main className="dashboard-content">
          {state.demo && (
            <div className="demo-banner">
              <span>
                <span className="tiny-dot" /> Sample classroom · fictional
                students
              </span>
              <button onClick={() => setSettings(true)}>
                Switch demo account <ArrowUpRight size={13} />
              </button>
            </div>
          )}
          {error && (
            <div role="alert" className="error-message row between">
              {error}
              <button
                aria-label="Dismiss error"
                className="icon-button"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {view === "overview" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    {teacher
                      ? "A WINDOW INTO YOUR CLASSROOM"
                      : "A GOOD DAY TO LEARN SOMETHING TOGETHER"}
                  </span>
                  <h1>
                    {teacher
                      ? "Your classroom, connected."
                      : `Hey ${first}, welcome to your loop.`}
                    <span className="heading-spark">✳</span>
                  </h1>
                  <p>
                    {teacher
                      ? "See the questions, connections, and small wins happening in your classroom."
                      : "A little curiosity. A little kindness. A whole lot you can figure out together."}
                  </p>
                </div>
                {teacher && (
                  <span className="read-only">
                    <ShieldCheck size={16} /> Read-only view
                  </span>
                )}
              </div>
              {!teacher ? (
                <section className="voice-hero">
                  <div className="voice-hero-copy">
                    <span className="eyebrow">
                      <Sparkles size={14} /> YOUR NEXT CONNECTION STARTS HERE
                    </span>
                    <h2>What’s on your mind?</h2>
                    <p>
                      A tricky question? Something you love explaining?
                      <br />
                      Just say it. We’ll help you find your person.
                    </p>
                    <button
                      className="button dark"
                      onClick={() => setVoice("need")}
                    >
                      <Mic size={19} /> Talk to FavourLoop{" "}
                      <ArrowUpRight size={18} />
                    </button>
                    <span className="hero-footnote">
                      Your voice. Your pace. Your choice.
                    </span>
                  </div>
                  <div className="hero-orbit" aria-hidden="true">
                    <div className="hero-orbit-ring ring-1" />
                    <div className="hero-orbit-ring ring-2" />
                    <div className="orbital-avatar oa-1">
                      <Avatar name="Maya Chen" color="#efc69f" size="lg" />
                      <span>Let’s figure it out.</span>
                    </div>
                    <div className="orbital-avatar oa-2">
                      <Avatar name="Jordan Ellis" color="#b7d9c6" size="lg" />
                    </div>
                    <div className="hero-mic">
                      <Mic size={36} />
                    </div>
                    <span className="hero-doodle">✧</span>
                    <div className="voice-wave">
                      {Array.from({ length: 17 }, (_, i) => (
                        <i
                          key={i}
                          style={{ height: `${8 + ((i * 11) % 27)}px` }}
                        />
                      ))}
                    </div>
                  </div>
                </section>
              ) : (
                <section className="teacher-hero">
                  <div>
                    <span className="eyebrow">
                      <ShieldCheck size={14} /> STUDENT-LED. TEACHER-SUPPORTED.
                    </span>
                    <h2>
                      Small connections.
                      <br />
                      Meaningful progress.
                    </h2>
                    <p>
                      Your students lead the conversation.
                      <br />
                      You have a clear view of the journey.
                    </p>
                  </div>
                  <div className="teacher-hero-graphic">
                    <Users size={60} />
                    <span>
                      {people.filter((x) => x.role === "student").length}{" "}
                      students in your circle
                    </span>
                  </div>
                </section>
              )}
              <div className="stats-grid">
                {[
                  {
                    icon: MessageCircle,
                    label: teacher
                      ? "Open learning requests"
                      : "My open questions",
                    value: ownNeeds.filter((n) => n.status === "open").length,
                    note: teacher
                      ? "Opportunities to connect"
                      : "Every question is a good start",
                    color: "violet",
                  },
                  {
                    icon: HandHeart,
                    label: teacher ? "Active help offers" : "Ways I can help",
                    value: teacher ? offers.length : ownOffers.length,
                    note: teacher
                      ? "Strengths being shared"
                      : "Something you know can make a difference",
                    color: "peach",
                  },
                  {
                    icon: Headphones,
                    label: teacher
                      ? "Active peer sessions"
                      : "My active sessions",
                    value: active.length,
                    note: teacher
                      ? "Students learning together"
                      : "A conversation makes the difference",
                    color: "green",
                  },
                ].map(({ icon: Icon, label, value, note, color }) => (
                  <div className="stat-card" key={label}>
                    <div className="row between">
                      <span className={`stat-icon ${color}`}>
                        <Icon size={18} />
                      </span>
                      <ArrowUpRight size={16} className="muted" />
                    </div>
                    <div className="stat-value">
                      {value}
                      <span>{label}</span>
                    </div>
                    <p>{note}</p>
                  </div>
                ))}
              </div>
              {incoming}
              {active.length > 0 && (
                <section className="dashboard-section">
                  <SectionTitle
                    title={
                      teacher
                        ? "Happening in your classroom"
                        : "Your next conversations"
                    }
                    action={
                      <button
                        className="text-link"
                        onClick={() => navigate("sessions")}
                      >
                        All sessions <ArrowRight size={15} />
                      </button>
                    }
                  />
                  <div className="session-list">{active.map(sessionCard)}</div>
                </section>
              )}
              <div className="overview-columns">
                <section>
                  <SectionTitle
                    title={
                      teacher
                        ? "Learning requests"
                        : "A little help I’m looking for"
                    }
                    action={
                      <button
                        className="text-link"
                        onClick={() => navigate("requests")}
                      >
                        View all <ArrowRight size={15} />
                      </button>
                    }
                  />
                  <div className="request-list">
                    {ownNeeds
                      .filter(
                        (n) => n.status === "open" || n.status === "matched",
                      )
                      .slice(0, 2)
                      .map(requestCard)}
                    {ownNeeds.filter(
                      (n) => n.status === "open" || n.status === "matched",
                    ).length === 0 && (
                      <Empty title="A fresh start">
                        {teacher
                          ? "New classroom questions will appear here."
                          : "Have something on your mind? Ask your first question."}
                      </Empty>
                    )}
                  </div>
                  {!teacher && (
                    <button
                      className="add-request"
                      onClick={() => setVoice("need")}
                    >
                      <Plus size={17} /> Ask another little question
                    </button>
                  )}
                </section>
                <section>
                  <SectionTitle
                    title={
                      teacher
                        ? "Recent classroom activity"
                        : "Good things to share"
                    }
                    action={
                      !teacher ? (
                        <button
                          className="text-link"
                          onClick={() => navigate("help")}
                        >
                          Meet your circle <ArrowRight size={15} />
                        </button>
                      ) : (
                        <button
                          className="text-link"
                          onClick={() => navigate("activity")}
                        >
                          View activity <ArrowRight size={15} />
                        </button>
                      )
                    }
                  />
                  {teacher ? (
                    <div className="activity-card">
                      {activity.slice(0, 5).map((a) => (
                        <div className="activity-row" key={a.id}>
                          <Avatar
                            name={p(a.actorId)?.name || "Student"}
                            color={p(a.actorId)?.color}
                            size="sm"
                          />
                          <div>
                            <strong>{p(a.actorId)?.name}</strong>
                            <p>{a.text}</p>
                            <small>{timeAgo(a.createdAt)}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="offer-preview">
                      {offers
                        .filter((o) => o.studentId !== user.id)
                        .slice(0, 3)
                        .map((o) => (
                          <div className="offer-preview-row" key={o.id}>
                            <Avatar
                              name={p(o.studentId)?.name || "Classmate"}
                              color={p(o.studentId)?.color}
                            />
                            <div className="grow">
                              <strong>
                                {p(o.studentId)?.name.split(" ")[0]}
                              </strong>
                              <p>Can help with {o.topic.toLowerCase()}</p>
                            </div>
                            <span
                              className="availability-dot"
                              title="Offered to help"
                            />
                          </div>
                        ))}
                      <div className="offer-preview-footer">
                        <Leaf size={18} />
                        <span>
                          Helping is always a choice. A little goes a long way.
                        </span>
                      </div>
                    </div>
                  )}
                  {!teacher && (
                    <div className="my-offer-card">
                      <div className="row between">
                        <span className="eyebrow">
                          YOUR STRENGTHS HAVE A PLACE HERE
                        </span>
                        <HandHeart size={22} />
                      </div>
                      <h3>Something you love explaining?</h3>
                      <p>
                        You don’t have to be an expert. Share a topic you feel
                        comfortable with.
                      </p>
                      <button
                        className="text-link"
                        onClick={() => setVoice("offer")}
                      >
                        Offer a little help <ArrowUpRight size={16} />
                      </button>
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
          {view === "requests" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">EVERY QUESTION IS WELCOME</span>
                  <h1>
                    {teacher ? "Classroom questions." : "My little questions."}
                  </h1>
                  <p>
                    {teacher
                      ? "Follow what your students are learning and where they need a hand."
                      : "Track your requests, find a willing classmate, and take the next step."}
                  </p>
                </div>
                {!teacher && (
                  <button
                    className="button primary"
                    onClick={() => setVoice("need")}
                  >
                    <Plus size={17} /> Ask for help
                  </button>
                )}
              </div>
              <div className="list-toolbar">
                <div className="filter-tabs">
                  {[
                    ["all", "All questions"],
                    ["open", "Open"],
                    ["matched", "Connected"],
                    ["resolved", "Resolved"],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      className={filter === id ? "selected" : ""}
                      onClick={() => setFilter(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="search-field">
                  <Search size={17} />
                  <input
                    aria-label="Search requests"
                    placeholder="Find a question…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              <div className="requests-grid">
                {filteredNeeds.map(requestCard)}
              </div>
              {!filteredNeeds.length && (
                <Empty title="No questions here yet">
                  {query
                    ? "Try a different search."
                    : "When a question comes up, this is its home."}
                </Empty>
              )}
            </>
          )}
          {view === "help" && !teacher && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    DIFFERENT STRENGTHS. ONE CIRCLE.
                  </span>
                  <h1>A little help goes a long way.</h1>
                  <p>
                    Meet the classmates sharing what they know. Add your own
                    offer whenever you’re ready.
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => setVoice("offer")}
                >
                  <HandHeart size={18} /> Offer help
                </button>
              </div>
              <div className="list-toolbar">
                <span className="small muted">
                  {offers.length} shared learning offers
                </span>
                <label className="search-field">
                  <Search size={17} />
                  <input
                    aria-label="Search offers"
                    placeholder="Search a topic or classmate…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              <div className="people-grid">
                {offers
                  .filter((o) =>
                    `${o.topic} ${o.subject} ${p(o.studentId)?.name}`
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((o) => (
                    <article className="person-card" key={o.id}>
                      <div className="row between">
                        <Avatar
                          name={p(o.studentId)?.name || "Student"}
                          color={p(o.studentId)?.color}
                          size="lg"
                        />
                        <span
                          className={`availability ${p(o.studentId)?.available ? "is-available" : ""}`}
                        >
                          <i />
                          {p(o.studentId)?.available
                            ? "Open to helping"
                            : "Taking a pause"}
                        </span>
                      </div>
                      <h3>
                        {p(o.studentId)?.name}
                        {o.studentId === user.id && (
                          <span className="you-tag">You</span>
                        )}
                      </h3>
                      <Subject name={o.subject} />
                      <h4>{o.topic}</h4>
                      <p>{o.detail}</p>
                      <div className="person-card-footer">
                        {o.studentId === user.id ? (
                          <button
                            className="quiet-button"
                            disabled={busy === o.id}
                            onClick={() =>
                              action(
                                "offers/withdraw",
                                { id: o.id },
                                o.id,
                                "Your offer has been withdrawn.",
                              )
                            }
                          >
                            Withdraw offer
                          </button>
                        ) : (
                          <button
                            className="text-link"
                            onClick={() => setVoice("need")}
                          >
                            Ask about this topic <ArrowUpRight size={16} />
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
              </div>
            </>
          )}
          {view === "sessions" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">LEARN THROUGH CONVERSATION</span>
                  <h1>
                    {teacher
                      ? "Peer learning, in motion."
                      : "Your conversations."}
                  </h1>
                  <p>
                    {teacher
                      ? "View session activity and disclosed transcripts."
                      : "A safe space to ask, explain, and figure things out together."}
                  </p>
                </div>
                {teacher && (
                  <span className="read-only">
                    <ShieldCheck size={16} /> Read-only
                  </span>
                )}
              </div>
              {incoming}
              <SectionTitle title="Ready & in progress" />
              <div className="session-list">{active.map(sessionCard)}</div>
              {!active.length && (
                <Empty title="Your next conversation is ahead">
                  {teacher
                    ? "Accepted peer connections will appear here."
                    : "Accept an invitation or find a helper to start a session."}
                </Empty>
              )}
              <div className="dashboard-section">
                <SectionTitle title="Past conversations" />
                <div className="session-list">
                  {sessions
                    .filter((s) => s.status === "ended")
                    .map(sessionCard)}
                </div>
                {!sessions.some((s) => s.status === "ended") && (
                  <p className="muted small">
                    Completed sessions will appear here, along with reported
                    outcomes.
                  </p>
                )}
              </div>
            </>
          )}
          {view === "profile" && !teacher && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">A LITTLE MORE YOU, EVERY DAY</span>
                  <h1>My learning profile.</h1>
                  <p>
                    These are the things you’ve confirmed. You can change them
                    as you learn.
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => setVoice("offer")}
                >
                  <Mic size={17} /> Update by voice
                </button>
              </div>
              <div className="profile-header">
                <Avatar name={user.name} color={user.color} size="lg" />
                <div className="grow">
                  <h2>{user.name}</h2>
                  <p>
                    {classroom.name} · {classroom.school}
                  </p>
                </div>
                <label className="availability-control">
                  <span>Open to help invitations</span>
                  <input
                    type="checkbox"
                    checked={Boolean(user.available)}
                    onChange={(e) =>
                      action(
                        "availability",
                        { available: e.target.checked },
                        "available",
                        e.target.checked
                          ? "You’re open to invitations."
                          : "Your availability is paused.",
                      )
                    }
                    disabled={busy === "available"}
                  />
                </label>
              </div>
              <div className="overview-columns">
                <section>
                  <SectionTitle
                    title="What I can help with"
                    action={
                      <button
                        className="text-link"
                        onClick={() => setVoice("offer")}
                      >
                        <Plus size={16} /> Add
                      </button>
                    }
                  />
                  {ownOffers.map((o) => (
                    <div className="profile-item" key={o.id}>
                      <Subject name={o.subject} />
                      <h3>{o.topic}</h3>
                      <p>{o.detail}</p>
                      <button
                        className="quiet-button"
                        onClick={() =>
                          action(
                            "offers/withdraw",
                            { id: o.id },
                            o.id,
                            "Offer removed from your profile.",
                          )
                        }
                      >
                        Remove offer
                      </button>
                    </div>
                  ))}
                  {!ownOffers.length && (
                    <Empty title="Your strengths belong here">
                      Offering help is optional. Add a topic whenever you feel
                      ready.
                    </Empty>
                  )}
                </section>
                <section>
                  <SectionTitle
                    title="What I’m learning"
                    action={
                      <button
                        className="text-link"
                        onClick={() => setVoice("need")}
                      >
                        <Plus size={16} /> Add
                      </button>
                    }
                  />
                  {ownNeeds
                    .filter(
                      (n) => n.status === "open" || n.status === "matched",
                    )
                    .map(requestCard)}
                  {!ownNeeds.some(
                    (n) => n.status === "open" || n.status === "matched",
                  ) && (
                    <Empty title="A little room for curiosity">
                      Add something you would like a classmate’s help with.
                    </Empty>
                  )}
                </section>
              </div>
              <div className="info-strip">
                <ShieldCheck size={20} />
                <p>
                  Your profile reflects what you’ve chosen to share. It is not a
                  grade or an assessment of your abilities.
                </p>
              </div>
            </>
          )}
          {view === "students" && teacher && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">YOUR CLASSROOM COMMUNITY</span>
                  <h1>Every student brings something.</h1>
                  <p>
                    View confirmed learning needs and offers. Students manage
                    their own profiles.
                  </p>
                </div>
              </div>
              <label className="search-field standalone-search">
                <Search size={17} />
                <input
                  aria-label="Search students"
                  placeholder="Find a student…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <div className="people-grid">
                {people
                  .filter(
                    (s) =>
                      s.role === "student" &&
                      s.name.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((s) => (
                    <button
                      className="person-card student-button"
                      key={s.id}
                      onClick={() => setPerson(s)}
                    >
                      <div className="row between">
                        <Avatar name={s.name} color={s.color} size="lg" />
                        <ArrowUpRight size={19} />
                      </div>
                      <h3>{s.name}</h3>
                      <p>
                        {
                          needs.filter(
                            (n) => n.studentId === s.id && n.status === "open",
                          ).length
                        }{" "}
                        open questions ·{" "}
                        {offers.filter((o) => o.studentId === s.id).length} help
                        offers
                      </p>
                      <div className="row wrap">
                        {offers
                          .filter((o) => o.studentId === s.id)
                          .map((o) => (
                            <Subject key={o.id} name={o.subject} />
                          ))}
                      </div>
                    </button>
                  ))}
              </div>
            </>
          )}
          {view === "activity" && teacher && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">THE CLASSROOM, IN CONTEXT</span>
                  <h1>Little moments. A bigger picture.</h1>
                  <p>
                    Published learning activity and student-raised concerns, in
                    one place.
                  </p>
                </div>
              </div>
              {state.reports.length > 0 && (
                <section className="reports-panel">
                  <SectionTitle title="Students asking for your attention" />
                  {state.reports.map((r) => (
                    <a
                      href={`/session/${r.sessionId}`}
                      className="report-row"
                      key={r.id}
                    >
                      <ShieldCheck size={20} />
                      <div>
                        <strong>{p(r.authorId)?.name}</strong>
                        <p>{r.text}</p>
                        <small>{timeAgo(r.createdAt)}</small>
                      </div>
                      <ArrowUpRight size={18} />
                    </a>
                  ))}
                </section>
              )}
              <div className="activity-card full-activity">
                {activity.map((a) => (
                  <div className="activity-row" key={a.id}>
                    <Avatar
                      name={p(a.actorId)?.name || "Student"}
                      color={p(a.actorId)?.color}
                    />
                    <div className="grow">
                      <strong>{p(a.actorId)?.name}</strong>
                      <p>{a.text}</p>
                    </div>
                    <small>{timeAgo(a.createdAt)}</small>
                  </div>
                ))}
                {!activity.length && (
                  <Empty title="A quiet moment">
                    Published classroom activity will appear here.
                  </Empty>
                )}
              </div>
            </>
          )}
          <footer className="dashboard-footer">
            <span>
              <span className="tiny-dot" /> Learning is a team effort.
            </span>
            <span>{classroom.name} · FavourLoop</span>
          </footer>
        </main>
      </div>
      {toast && (
        <div role="status" className="toast">
          <CheckCircle2 size={19} />
          {toast}
        </div>
      )}
      {voice && (
        <VoicePanel mode={voice} onClose={closeVoice} onSaved={confirmed} />
      )}
      {selected && (
        <Modal title="A classmate who could help" onClose={closeMatch}>
          <Subject name={selected.subject} />
          <h3 className="match-question">{selected.topic}</h3>
          <p className="muted">An invitation is a choice, for both of you.</p>
          {!matchBusy && !matchError && (
            <div className="info-strip">
              {matchEngine === "openai" ? (
                <Sparkles size={20} />
              ) : (
                <BookOpen size={20} />
              )}
              <div>
                <strong>
                  {matchEngine === "openai"
                    ? "AI suggestions"
                    : "Topic suggestions"}
                </strong>
                <p>{matchNotice}</p>
              </div>
            </div>
          )}
          {matchBusy ? (
            <div className="empty-state" role="status">
              <Loader2 className="spin" />
              <p>Looking through classmates’ offers…</p>
            </div>
          ) : matchError ? (
            <p role="alert" className="error-text">
              {matchError}
            </p>
          ) : matches.length ? (
            matches.map((m) => (
              <div className="match-card" key={m.offer.id}>
                <div className="row">
                  <Avatar
                    name={m.student.name}
                    color={m.student.color}
                    size="lg"
                  />
                  <div>
                    <h3>{m.student.name}</h3>
                    <span className="availability is-available">
                      <i /> Open to invitations
                    </span>
                  </div>
                </div>
                <p>{m.reason}</p>
                <div className="match-scope">
                  <span className="eyebrow">THEIR OFFER</span>
                  <p>{m.offer.detail}</p>
                </div>
                <button
                  className="button primary full"
                  disabled={!!busy}
                  onClick={() => invite(m)}
                >
                  Invite {m.student.name.split(" ")[0]} <ArrowRight size={17} />
                </button>
              </div>
            ))
          ) : (
            <Empty title="No suitable helper just yet">
              Your question stays open. We’ll check current offers whenever you
              look for a match. No need to offer help in return.
            </Empty>
          )}
        </Modal>
      )}
      {settings && (
        <Modal title="Your classroom & settings" onClose={closeSettings}>
          <div className="info-strip">
            <GraduationCap size={22} />
            <div>
              <strong>{classroom.name}</strong>
              <p>{classroom.school}</p>
            </div>
          </div>
          <p className="muted">
            {teacher
              ? "You can view published activity in this classroom. Students control their own requests, offers, and sessions."
              : "Your teacher can see confirmed learning requests and session transcripts. Unsent drafts are not shared."}
          </p>
          <div className="settings-row">
            <span>Understanding your voice</span>
            <strong>
              {state.ai
                ? "AI interpretation configured"
                : "Basic topic recognition"}
            </strong>
          </div>
          <div className="settings-row">
            <span>Finding a classmate</span>
            <strong>
              {state.aiMatching ? "AI matching enabled" : "Topic matching"}
            </strong>
          </div>
          {state.aiMatching && (
            <p className="small muted">
              AI compares your confirmed question with classmates’ help offers.
              You both choose whether to connect.
            </p>
          )}
          {state.demo && (
            <>
              <h3 className="settings-subtitle">
                Explore a different perspective
              </h3>
              <p className="small muted">
                These accounts contain fictional classroom data. Use separate
                browser profiles to act as two students at once.
              </p>
              <div className="demo-account-grid">
                {[
                  ["alex", "Alex · student"],
                  ["maya", "Maya · student"],
                  ["jordan", "Jordan · student"],
                  ["rivera", "Ms. Rivera · teacher"],
                ].map(([id, label]) => (
                  <button
                    className="button secondary"
                    key={id}
                    onClick={async () => {
                      await api("auth/demo", { id });
                      window.location.href = "/dashboard";
                    }}
                  >
                    {label}
                    <ArrowUpRight size={14} />
                  </button>
                ))}
              </div>
            </>
          )}
          <button
            className="button secondary full settings-logout"
            onClick={async () => {
              await api("auth/logout", {});
              window.location.href = "/";
            }}
          >
            <LogOut size={17} /> Sign out
          </button>
        </Modal>
      )}
      {person && (
        <Modal title={person.name} onClose={closePerson}>
          <Avatar name={person.name} color={person.color} size="lg" />
          <h3 className="settings-subtitle">Confirmed help offers</h3>
          {offers
            .filter((o) => o.studentId === person.id)
            .map((o) => (
              <div className="profile-item" key={o.id}>
                <Subject name={o.subject} />
                <h3>{o.topic}</h3>
                <p>{o.detail}</p>
              </div>
            ))}
          <h3 className="settings-subtitle">Learning requests</h3>
          {needs
            .filter((n) => n.studentId === person.id)
            .map((n) => (
              <div className="profile-item" key={n.id}>
                <h3>{n.topic}</h3>
                <p>{n.detail}</p>
                <Status value={n.status} />
              </div>
            ))}
          <p className="small muted">
            These are student-confirmed statements, not ability assessments.
          </p>
        </Modal>
      )}
    </div>
  );
}
