"use client";
import { useState, useEffect, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Sparkles,
  Loader2,
} from "lucide-react";
import { Logo, api } from "./ui";
export function Auth({
  role,
  login = false,
}: {
  role: "student" | "teacher";
  login?: boolean;
}) {
  const [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [demo, setDemo] = useState(false);
  useEffect(() => {
    setReady(true);
    api<{ demo: boolean }>("config")
      .then((v) => setDemo(v.demo))
      .catch(() => {});
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await api(
        login ? "auth/login" : "auth/signup",
        login
          ? { email: f.get("email"), password: f.get("password") }
          : {
              name: f.get("name"),
              email: f.get("email"),
              password: f.get("password"),
              code: f.get("code"),
              role,
            },
      );
      window.location.href = "/dashboard";
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <aside className="auth-story">
        <Logo />
        <div>
          <span className="eyebrow">
            YOUR NEXT CHAPTER STARTS WITH A CONVERSATION
          </span>
          <h1>
            {role === "teacher"
              ? "Give them space to grow."
              : "You don’t have to figure it all out alone."}
          </h1>
          <p>
            {role === "teacher"
              ? "Stay connected to your classroom’s learning, while your students find their own voices."
              : "A question you ask today could become something you help someone with tomorrow."}
          </p>
          <div className="auth-quote">
            <Sparkles size={23} />
            <p>
              Different strengths.
              <br />
              <strong>One learning community.</strong>
            </p>
          </div>
        </div>
        <span className="small">A little help goes a long way.</span>
      </aside>
      <section className="auth-form-area">
        <a className="quiet-button" href="/">
          <ArrowLeft size={16} /> Back home
        </a>
        <div className="auth-form">
          <span className="eyebrow">
            {login
              ? "WELCOME BACK"
              : role === "teacher"
                ? "FOR TEACHERS"
                : "FOR STUDENTS"}
          </span>
          <h2>
            {login
              ? "Back in the loop."
              : role === "teacher"
                ? "See your classroom grow."
                : "Find your learning circle."}
          </h2>
          <p>
            {login
              ? "Sign in to pick up where you left off."
              : "Create your account with your classroom invitation."}
          </p>
          <form method="post" onSubmit={submit}>
            {!login && (
              <label className="field">
                Your name
                <input
                  name="name"
                  autoComplete="name"
                  placeholder={
                    role === "teacher" ? "Ms. Rivera" : "Alex Morgan"
                  }
                  required
                  minLength={2}
                  maxLength={60}
                />
              </label>
            )}
            <label className="field">
              Email
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@school.edu"
                required
              />
            </label>
            <label className="field">
              Password
              <input
                name="password"
                type="password"
                autoComplete={login ? "current-password" : "new-password"}
                placeholder={login ? "Your password" : "At least 10 characters"}
                minLength={login ? 1 : 10}
                maxLength={128}
                required
              />
            </label>
            {!login && (
              <label className="field">
                {role === "teacher"
                  ? "Teacher invitation"
                  : "Classroom invitation"}
                <input
                  name="code"
                  placeholder="Enter your invitation code"
                  required
                />
                {demo && (
                  <span className="field-hint">
                    For the sample classroom, use{" "}
                    <strong>{role === "teacher" ? "TEACH10" : "LOOP10"}</strong>
                    .
                  </span>
                )}
              </label>
            )}
            {error && (
              <p role="alert" className="error-message">
                {error}
              </p>
            )}
            <button className="button primary full" disabled={busy || !ready}>
              {busy ? <Loader2 className="spin" size={18} /> : null}
              {busy ? "One moment…" : login ? "Sign in" : "Join my classroom"}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="auth-switch">
            {login ? (
              <>
                New here? <a href="/signup/student">Join as a student</a> or{" "}
                <a href="/signup/teacher">teacher</a>.
              </>
            ) : (
              <>
                Already have an account? <a href="/login">Sign in</a>
              </>
            )}
          </p>
          <div className="auth-notice">
            <ShieldCheck size={18} />
            <span>
              {role === "teacher"
                ? "Your invitation gives access only to your assigned classroom. Student interactions are read-only."
                : "Your classroom teacher can view published requests and session transcripts. You review your learning profile before sharing."}
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
