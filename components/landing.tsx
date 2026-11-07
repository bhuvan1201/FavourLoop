"use client";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Mic,
  Sparkles,
  ShieldCheck,
  Headphones,
  BookOpen,
  Check,
  GraduationCap,
  HeartHandshake,
} from "lucide-react";
import { Logo, Avatar, Subject, api } from "./ui";
export function Landing() {
  const [demo, setDemo] = useState(false),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    api<{ demo: boolean }>("config")
      .then((v) => setDemo(v.demo))
      .catch(() => {});
  }, []);
  async function explore(id: string) {
    setBusy(id);
    try {
      await api("auth/demo", { id });
      window.location.href = "/dashboard";
    } catch (e) {
      setError((e as Error).message);
      setBusy("");
    }
  }
  return (
    <div className="landing">
      <header className="landing-nav">
        <Logo />
        <nav>
          <a href="#how-it-works">How it works</a>
          <a href="/signup/teacher">For teachers</a>
          <a className="button secondary" href="/login">
            Sign in <ArrowUpRight size={16} />
          </a>
        </nav>
      </header>
      <main>
        <section className="landing-hero">
          <div className="landing-copy">
            <span className="eyebrow">
              <span className="tiny-dot" /> A CLASSROOM, A LITTLE MORE CONNECTED
            </span>
            <h1>
              A little help.
              <br />A lot of <em>possibility.</em>
            </h1>
            <p>
              You have something to share. Someone has just the help you need.
              Find each other, one conversation at a time.
            </p>
            <div className="hero-actions">
              <a className="button primary large" href="/signup/student">
                Find your learning circle <ArrowRight size={19} />
              </a>
              <a className="text-link" href="/signup/teacher">
                I’m a teacher <ArrowUpRight size={17} />
              </a>
            </div>
            <div className="landing-trust">
              <div className="avatar-stack">
                <Avatar name="Alex Morgan" color="#dcd4f8" size="sm" />
                <Avatar name="Maya Chen" color="#f7d9b9" size="sm" />
                <Avatar name="Jordan Ellis" color="#c7e8d8" size="sm" />
              </div>
              <span>Different strengths. Better together.</span>
            </div>
          </div>
          <div
            className="connection-art"
            aria-label="An illustration of classmates helping each other"
          >
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="art-spark spark-one">✦</div>
            <div className="art-spark spark-two">✧</div>
            <div className="art-card art-question">
              <div className="row">
                <Avatar name="Alex Morgan" />
                <div>
                  <strong>Alex’s little question</strong>
                  <small>Mathematics · Quadratic equations</small>
                </div>
              </div>
              <p>
                “Could someone explain this
                <br />a different way?”
              </p>
              <div className="mini-wave">
                {Array.from({ length: 22 }, (_, i) => (
                  <i key={i} style={{ height: `${8 + ((i * 13) % 29)}px` }} />
                ))}
                <Mic size={16} />
              </div>
            </div>
            <div className="connection-center">
              <Sparkles size={30} />
            </div>
            <div className="art-card art-answer">
              <span className="green-tag">
                <Check size={13} /> A LITTLE HELP IS HERE
              </span>
              <div className="row">
                <Avatar name="Maya Chen" color="#f7d9b9" />
                <div>
                  <strong>Meet Maya</strong>
                  <small>Happy to help with quadratics</small>
                </div>
              </div>
              <div className="art-call">
                <Headphones size={17} /> A conversation away{" "}
                <ArrowUpRight size={16} />
              </div>
            </div>
            <div className="floating-note">
              <HeartHandshake size={18} />
              <span>Everyone has something to offer.</span>
            </div>
          </div>
        </section>
        <section id="how-it-works" className="how-section">
          <div className="section-title">
            <div>
              <span className="eyebrow">LEARNING IS BETTER TOGETHER</span>
              <h2>A small question can start something good.</h2>
            </div>
            <p>
              Speak freely. Connect thoughtfully.
              <br />
              Learn at your own pace.
            </p>
          </div>
          <div className="how-grid">
            {[
              {
                icon: Mic,
                n: "01",
                title: "Say it your way",
                text: "Talk about what’s tricky or what you love explaining. Review what FavourLoop understood.",
              },
              {
                icon: Sparkles,
                n: "02",
                title: "Find your person",
                text: "Meet a willing classmate with a relevant offer. You both decide when a connection feels right.",
              },
              {
                icon: Headphones,
                n: "03",
                title: "Figure it out together",
                text: "Hop on a voice call, ask the little questions, and make a little progress.",
              },
            ].map(({ icon: Icon, n, title, text }) => (
              <article key={n}>
                <div className="row between">
                  <span className="how-icon">
                    <Icon size={22} />
                  </span>
                  <span className="step-number">{n}</span>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="teacher-strip">
          <div className="teacher-icon">
            <GraduationCap size={30} />
          </div>
          <div>
            <h2>Student-led. Teacher-supported.</h2>
            <p>
              A shared classroom view keeps teachers in the loop, while students
              lead the learning.
            </p>
          </div>
          <a className="button secondary" href="/signup/teacher">
            Explore teacher access <ArrowUpRight size={17} />
          </a>
        </section>
        {demo && (
          <section className="demo-entry">
            <span className="eyebrow">TAKE A LOOK AROUND</span>
            <h2>A classroom you can explore.</h2>
            <p>
              Try a student or teacher view using clearly labeled sample
              accounts.
            </p>
            <div className="row wrap">
              {[
                ["alex", "Alex · student"],
                ["maya", "Maya · student"],
                ["sam", "Sam · student"],
                ["jordan", "Jordan · student"],
                ["rivera", "Ms. Rivera · teacher"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className="button secondary"
                  onClick={() => explore(id)}
                  disabled={!!busy}
                >
                  {busy === id ? "Opening…" : label}
                  <ArrowUpRight size={15} />
                </button>
              ))}
            </div>
            {error && (
              <p role="alert" className="error-message">
                {error}
              </p>
            )}
          </section>
        )}
      </main>
      <footer className="landing-footer">
        <Logo />
        <span>Built for the small moments that make learning click.</span>
        <span>
          <ShieldCheck size={14} /> Your classroom. Your circle.
        </span>
      </footer>
    </div>
  );
}
