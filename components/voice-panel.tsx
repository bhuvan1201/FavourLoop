"use client";
import { useState, useRef, useEffect } from "react";
import {
  Mic,
  Square,
  ArrowRight,
  Check,
  Volume2,
  Keyboard,
  Plus,
  Trash2,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Modal, api, Subject } from "./ui";
import { recognition, speak, type Recognition } from "./speech";
import type { Draft, DraftItem } from "@/lib/types";
export function VoicePanel({
  mode: initialMode,
  onClose,
  onSaved,
}: {
  mode: "need" | "offer";
  onClose: () => void;
  onSaved: (ids: string[]) => void;
}) {
  const [mode, setMode] = useState(initialMode),
    [text, setText] = useState(""),
    [typed, setTyped] = useState(false),
    [listening, setListening] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [draft, setDraft] = useState<Draft | null>(null),
    [items, setItems] = useState<DraftItem[]>([]);
  const rec = useRef<Recognition | null>(null);
  useEffect(
    () => () => {
      rec.current?.abort();
      window.speechSynthesis?.cancel();
    },
    [],
  );
  function listen() {
    if (listening) {
      rec.current?.stop();
      setListening(false);
      return;
    }
    setError("");
    const r = recognition();
    if (!r) {
      setTyped(true);
      setError(
        "Speech input is not supported by this browser. You can type below or use Chrome.",
      );
      return;
    }
    r.lang = "en-US";
    r.continuous = false;
    r.interimResults = true;
    r.onresult = (e) => {
      let value = "";
      for (let i = 0; i < e.results.length; i++)
        value += e.results[i][0].transcript;
      setText(value);
    };
    r.onerror = (e) => {
      setError(
        e.error === "not-allowed"
          ? "Microphone access was denied. Enable it in your browser or type below."
          : "I couldn’t hear that clearly. Try again or type below.",
      );
      setListening(false);
      setTyped(true);
    };
    r.onend = () => setListening(false);
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setError("Please wait a moment and try the microphone again.");
    }
  }
  async function understand() {
    if (text.trim().length < 3) return;
    rec.current?.stop();
    setListening(false);
    setBusy(true);
    setError("");
    try {
      const d = await api<Draft>("intake", { text, mode });
      setDraft(d);
      setItems(d.items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ ids: string[] }>("intake/confirm", {
        id: draft.id,
        items,
      });
      onClose();
      onSaved(result.ids);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const change = (i: number, key: keyof DraftItem, value: string) =>
    setItems((old) =>
      old.map((item, j) => (j === i ? { ...item, [key]: value } : item)),
    );
  return (
    <Modal
      title={draft ? "Did I get that right?" : "Let’s talk it through"}
      onClose={onClose}
    >
      <div className="voice-intro">
        <span className="assistant-label">
          <Sparkles size={14} /> YOUR LEARNING COMPANION
        </span>
        <p>
          {draft
            ? "You’re in control. Review or edit these cards before anything is shared."
            : "A small question is a great place to start. Tell me what’s on your mind."}
        </p>
      </div>
      {!draft ? (
        <>
          <div className="segmented">
            <button
              className={mode === "need" ? "selected" : ""}
              onClick={() => setMode("need")}
            >
              I need a little help
            </button>
            <button
              className={mode === "offer" ? "selected" : ""}
              onClick={() => setMode("offer")}
            >
              I can lend a hand
            </button>
          </div>
          <div className={`voice-stage ${listening ? "listening" : ""}`}>
            <div className="voice-rings">
              <button
                className="record-button"
                onClick={listen}
                disabled={busy}
                aria-label={listening ? "Stop recording" : "Start voice input"}
              >
                {listening ? (
                  <Square size={27} fill="currentColor" />
                ) : (
                  <Mic size={32} />
                )}
              </button>
            </div>
            <h3>{listening ? "I’m listening…" : "Your voice is enough."}</h3>
            <p>
              {listening
                ? "Speak naturally. Tap to stop."
                : "Tap the microphone and tell me about one topic."}
            </p>
          </div>
          <div className="example-prompt">
            <span>TRY SOMETHING LIKE</span>
            <button
              onClick={() => {
                setText(
                  mode === "need"
                    ? "I need help with quadratic equations. I get stuck when factoring."
                    : "I can help with balancing chemical equations.",
                );
                setTyped(true);
              }}
            >
              “
              {mode === "need"
                ? "I get stuck when factoring quadratic equations."
                : "I can help with balancing chemical equations."}
              ”<ArrowRight size={15} />
            </button>
          </div>
          <button
            className="quiet-button typing-toggle"
            onClick={() => setTyped(!typed)}
          >
            <Keyboard size={16} />
            {typed ? "Hide text input" : "Prefer to type?"}
          </button>
          {(typed || text) && (
            <label className="field">
              Your words
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Tell me what you need or can offer…"
                rows={3}
                maxLength={3000}
              />
            </label>
          )}
          <button
            className="button primary full"
            disabled={busy || text.trim().length < 3}
            onClick={understand}
          >
            {busy ? (
              <Loader2 className="spin" size={18} />
            ) : (
              <Sparkles size={17} />
            )}{" "}
            {busy ? "Understanding your words…" : "Help me put it into words"}
            <ArrowRight size={17} />
          </button>
          <p className="privacy-note">
            Your teacher and classmates only see the learning needs and offers
            you confirm.
          </p>
        </>
      ) : (
        <>
          <p className="callout">{draft.clarification}</p>
          {draft.engine === "local" && (
            <p className="small muted">
              Basic topic recognition is active. You can edit every field below.
            </p>
          )}
          <div className="draft-items">
            {items.map((item, i) => (
              <div className="draft-card" key={i}>
                <div className="row between">
                  <span className="eyebrow">
                    {item.kind === "need"
                      ? "I NEED HELP WITH"
                      : "I CAN HELP WITH"}
                  </span>
                  <button
                    className="icon-button"
                    aria-label="Remove this item"
                    onClick={() => setItems(items.filter((_, j) => i !== j))}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <label className="field">
                  Subject
                  <input
                    value={item.subject}
                    onChange={(e) => change(i, "subject", e.target.value)}
                    maxLength={60}
                  />
                </label>
                <label className="field">
                  Specific topic
                  <input
                    value={item.topic}
                    onChange={(e) => change(i, "topic", e.target.value)}
                    maxLength={120}
                  />
                </label>
                <label className="field">
                  In your words
                  <textarea
                    value={item.detail}
                    onChange={(e) => change(i, "detail", e.target.value)}
                    rows={2}
                    maxLength={1200}
                  />
                </label>
              </div>
            ))}
          </div>
          {items.length === 0 && (
            <button
              className="button secondary full"
              onClick={() =>
                setItems([
                  {
                    kind: mode,
                    subject: "Mathematics",
                    topic: "",
                    detail: text,
                  },
                ])
              }
            >
              <Plus size={17} /> Add a topic manually
            </button>
          )}
          <div className="row between review-actions">
            <button
              className="quiet-button"
              onClick={() => {
                setDraft(null);
                setTyped(true);
              }}
            >
              Make a correction
            </button>
            <button
              className="quiet-button"
              onClick={() =>
                speak(
                  items
                    .map(
                      (i) =>
                        `${i.kind === "need" ? "You need help with" : "You can help with"} ${i.topic}. ${i.detail}`,
                    )
                    .join(" "),
                )
              }
            >
              <Volume2 size={17} /> Read back
            </button>
          </div>
          <button
            className="button primary full"
            onClick={save}
            disabled={
              busy ||
              !items.length ||
              items.some(
                (i) => i.topic.trim().length < 2 || i.detail.trim().length < 2,
              )
            }
          >
            {busy ? (
              <Loader2 size={18} className="spin" />
            ) : (
              <Check size={18} />
            )}
            Confirm and {mode === "need" ? "find help" : "share my offer"}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
    </Modal>
  );
}
