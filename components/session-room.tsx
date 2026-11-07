"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  ShieldCheck,
  Headphones,
  Check,
  MessageCircle,
  Send,
  Flag,
  Volume2,
  Loader2,
  FileText,
  Radio,
} from "lucide-react";
import { Logo, Avatar, Subject, Status, api, timeAgo, Modal } from "./ui";
import { recognition, type Recognition } from "./speech";
import type { Session, Need, Person, Transcript, State } from "@/lib/types";
type Detail = {
  session: Session;
  need: Need;
  people: Person[];
  transcript: Transcript[];
};
type Signal = { id: number; senderId: string; kind: string; payload: string };
export function SessionRoom({ id }: { id: string }) {
  const [state, setState] = useState<State | null>(null),
    [detail, setDetail] = useState<Detail | null>(null),
    [error, setError] = useState(""),
    [connection, setConnection] = useState("not-joined"),
    [muted, setMuted] = useState(false),
    [acknowledged, setAcknowledged] = useState(false),
    [note, setNote] = useState(""),
    [transcribing, setTranscribing] = useState(false),
    [report, setReport] = useState(false),
    [reportText, setReportText] = useState(""),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState("");
  const pc = useRef<RTCPeerConnection | null>(null),
    stream = useRef<MediaStream | null>(null),
    audio = useRef<HTMLAudioElement | null>(null),
    poll = useRef<ReturnType<typeof setInterval> | null>(null),
    speech = useRef<Recognition | null>(null),
    joining = useRef(false),
    signalBusy = useRef(false),
    cursor = useRef(0),
    iceQueue = useRef<RTCIceCandidateInit[]>([]),
    offerBusy = useRef(false),
    activeRef = useRef(false),
    mutedRef = useRef(false),
    transcribeRef = useRef(false),
    speechTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = useCallback(async () => {
    try {
      const [s, d] = await Promise.all([
        api<State>("state"),
        api<Detail>(`sessions/${id}`),
      ]);
      setState(s);
      setDetail(d);
      if (d.session.status === "ended") stopMedia();
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  function stopMedia() {
    activeRef.current = false;
    transcribeRef.current = false;
    setTranscribing(false);
    if (speechTimer.current) clearTimeout(speechTimer.current);
    speech.current?.abort();
    speech.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    pc.current?.close();
    pc.current = null;
    if (poll.current) clearInterval(poll.current);
    poll.current = null;
    setConnection("not-joined");
    joining.current = false;
  }
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2500);
    return () => {
      clearInterval(t);
      activeRef.current = false;
      transcribeRef.current = false;
      speech.current?.abort();
      if (speechTimer.current) clearTimeout(speechTimer.current);
      stream.current?.getTracks().forEach((t) => t.stop());
      pc.current?.close();
      if (poll.current) clearInterval(poll.current);
    };
  }, [refresh]);
  const sendSignal = async (kind: string, payload: unknown) =>
    api(`sessions/${id}/signal`, { kind, payload: JSON.stringify(payload) });
  function startTranscript() {
    const r = recognition();
    if (!r) {
      setError(
        "Live transcription is unavailable in this browser. The call still works; you can share written notes.",
      );
      return;
    }
    r.lang = "en-US";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      if (mutedRef.current) return;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal)
          api(`sessions/${id}/transcript`, {
            text: e.results[i][0].transcript,
            source: "speech",
          }).catch(() => setError("A transcript segment could not be saved."));
      }
    };
    r.onerror = (e) => {
      if (e.error !== "no-speech") {
        transcribeRef.current = false;
        setTranscribing(false);
        setError(
          "Automatic transcription is interrupted. Audio and written notes are still available.",
        );
      }
    };
    r.onend = () => {
      if (activeRef.current && transcribeRef.current && !mutedRef.current) {
        speechTimer.current = setTimeout(() => {
          try {
            r.start();
          } catch {}
        }, 500);
      }
    };
    speech.current = r;
    try {
      r.start();
      transcribeRef.current = true;
      setTranscribing(true);
    } catch {
      setError("Could not start transcription. Your audio call can continue.");
    }
  }
  async function join() {
    if (!state || !detail || joining.current) return;
    joining.current = true;
    setBusy(true);
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Microphone access needs localhost or HTTPS and a supported browser.",
        );
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      stream.current = media;
      const result = await api<{ cursor: number }>(`sessions/${id}/join`, {
        acknowledged,
      });
      cursor.current = result.cursor;
      const peer = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      pc.current = peer;
      iceQueue.current = [];
      activeRef.current = true;
      setConnection("waiting");
      setMuted(false);
      mutedRef.current = false;
      for (const track of media.getTracks()) peer.addTrack(track, media);
      peer.onicecandidate = (e) => {
        if (e.candidate)
          sendSignal("candidate", e.candidate.toJSON()).catch(() => {});
      };
      peer.ontrack = (e) => {
        if (audio.current) {
          audio.current.srcObject = e.streams[0] || new MediaStream([e.track]);
          audio.current
            .play()
            .catch(() =>
              setToast(
                "Tap “Enable partner audio” if your browser blocks playback.",
              ),
            );
        }
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "connected") setConnection("connected");
        else if (["disconnected", "failed"].includes(peer.connectionState))
          setConnection("interrupted");
      };
      const makeOffer = async () => {
        if (offerBusy.current || peer.connectionState === "closed") return;
        offerBusy.current = true;
        try {
          if (
            peer.signalingState === "have-local-offer" &&
            peer.localDescription
          ) {
            await sendSignal("offer", peer.localDescription.toJSON());
          } else if (peer.signalingState === "stable") {
            await peer.setLocalDescription(await peer.createOffer());
            await sendSignal("offer", peer.localDescription!.toJSON());
          }
        } finally {
          offerBusy.current = false;
        }
      };
      const consume = async () => {
        if (signalBusy.current || !activeRef.current) return;
        signalBusy.current = true;
        try {
          const data = await api<{ status: string; signals: Signal[] }>(
            `sessions/${id}/signals?after=${cursor.current}`,
          );
          if (data.status === "ended") {
            stopMedia();
            return;
          }
          for (const signal of data.signals) {
            cursor.current = Math.max(cursor.current, signal.id);
            const payload = JSON.parse(signal.payload);
            if (signal.kind === "ready") {
              if (state.user.id === detail.session.requesterId)
                await makeOffer();
              else await sendSignal("ready", {});
            }
            if (
              signal.kind === "offer" &&
              state.user.id !== detail.session.requesterId
            ) {
              await peer.setRemoteDescription(payload);
              for (const candidate of iceQueue.current)
                await peer.addIceCandidate(candidate);
              iceQueue.current = [];
              await peer.setLocalDescription(await peer.createAnswer());
              await sendSignal("answer", peer.localDescription!.toJSON());
            }
            if (
              signal.kind === "answer" &&
              peer.signalingState === "have-local-offer"
            ) {
              await peer.setRemoteDescription(payload);
              for (const candidate of iceQueue.current)
                await peer.addIceCandidate(candidate);
              iceQueue.current = [];
            }
            if (signal.kind === "candidate") {
              if (peer.remoteDescription) await peer.addIceCandidate(payload);
              else iceQueue.current.push(payload);
            }
            if (signal.kind === "leave") setConnection("waiting");
          }
        } catch (e) {
          if (activeRef.current) setError((e as Error).message);
        } finally {
          signalBusy.current = false;
        }
      };
      await sendSignal("ready", {});
      poll.current = setInterval(consume, 800);
      startTranscript();
      await refresh();
    } catch (e) {
      stopMedia();
      setError(
        (e as Error).name === "NotAllowedError"
          ? "Microphone permission was denied. Enable it in your browser and try again."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
      joining.current = false;
    }
  }
  function toggleMute() {
    const value = !muted;
    stream.current?.getAudioTracks().forEach((t) => (t.enabled = !value));
    mutedRef.current = value;
    setMuted(value);
    if (value) {
      transcribeRef.current = false;
      speech.current?.abort();
      setTranscribing(false);
    } else startTranscript();
  }
  async function leave(end = false) {
    setBusy(true);
    try {
      if (end) await api(`sessions/${id}/end`, {});
      else if (activeRef.current) await sendSignal("leave", {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      stopMedia();
      setBusy(false);
      refresh();
    }
  }
  async function outcome(value: string) {
    setBusy(true);
    try {
      await api(`sessions/${id}/outcome`, { outcome: value });
      stopMedia();
      setToast(
        value === "resolved"
          ? "Your learning question is marked resolved."
          : "Your question is open again. You can look for another helper.",
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function addNote() {
    if (!note.trim()) return;
    try {
      await api(`sessions/${id}/transcript`, { text: note, source: "note" });
      setNote("");
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const closeReport = useCallback(() => setReport(false), []);
  if (!state || !detail)
    return (
      <div className="loading-page">
        <Logo />
        <p>{error || "Opening your learning session…"}</p>
        <a className="text-link" href="/dashboard">
          Back to classroom
        </a>
      </div>
    );
  const teacher = state.user.role === "teacher",
    ended = detail.session.status === "ended",
    partner = detail.people.find((p) => p.id !== state.user.id),
    requester = state.user.id === detail.session.requesterId;
  return (
    <div className="session-page">
      <header className="session-header">
        <Logo />
        <a className="text-link" href="/dashboard?view=sessions">
          <ArrowLeft size={16} /> Back to{" "}
          {teacher ? "classroom" : "my sessions"}
        </a>
        <span className="read-only">
          <ShieldCheck size={15} />
          {teacher ? "Teacher · read-only" : state.classroom.name}
        </span>
      </header>
      <main className="session-main">
        <div className="page-heading">
          <div>
            <span className="eyebrow">A LITTLE SPACE TO FIGURE IT OUT</span>
            <h1>{detail.need.topic}</h1>
            <p>{detail.need.detail}</p>
          </div>
          <Subject name={detail.need.subject} />
        </div>
        {error && (
          <div role="alert" className="error-message">
            {error}
          </div>
        )}
        {toast && (
          <div role="status" className="info-strip">
            {toast}
          </div>
        )}
        <div className="call-layout">
          <section>
            <div className="call-stage">
              <div className="row between">
                <span className="call-label">
                  <Headphones size={16} /> PEER LEARNING ROOM
                </span>
                <Status value={detail.session.status} />
              </div>
              <div className="call-people">
                {detail.people.map((p, i) => (
                  <div className="call-person" key={p.id}>
                    <div
                      className={`call-avatar-ring ${connection === "connected" ? "connected" : ""}`}
                    >
                      <Avatar name={p.name} color={p.color} size="lg" />
                    </div>
                    <h3>{p.name}</h3>
                    <span>
                      {p.id === state.user.id
                        ? "You"
                        : p.id === detail.session.requesterId
                          ? "Learning together"
                          : "Lending a hand"}
                    </span>
                  </div>
                ))}
              </div>
              <p className="connection-label">
                {teacher
                  ? "You’re viewing session activity. You are not listening to this call."
                  : ended
                    ? "This conversation has ended."
                    : connection === "connected"
                      ? "You’re connected. Take your time."
                      : connection === "waiting"
                        ? `Waiting for ${partner?.name.split(" ")[0]} to connect…`
                        : connection === "interrupted"
                          ? "Connection interrupted. Leave and rejoin to try again."
                          : "A fresh perspective is a conversation away."}
              </p>
              {!teacher && !ended && (
                <>
                  {connection === "not-joined" ? (
                    <div className="join-controls">
                      <label className="consent-check">
                        <input
                          type="checkbox"
                          checked={acknowledged}
                          onChange={(e) => setAcknowledged(e.target.checked)}
                        />
                        <span>
                          I understand automatic transcripts and shared notes
                          are visible to my classroom teacher. Audio is not
                          recorded by this app.
                        </span>
                      </label>
                      <button
                        className="button primary large"
                        disabled={!acknowledged || busy}
                        onClick={join}
                      >
                        {busy ? (
                          <Loader2 className="spin" size={19} />
                        ) : (
                          <Phone size={19} />
                        )}
                        Join voice call
                      </button>
                    </div>
                  ) : (
                    <div className="call-controls">
                      <button
                        className={`call-control ${muted ? "muted" : ""}`}
                        onClick={toggleMute}
                        aria-label={
                          muted ? "Unmute microphone" : "Mute microphone"
                        }
                      >
                        {muted ? <MicOff /> : <Mic />}
                        <span>{muted ? "Unmute" : "Mute"}</span>
                      </button>
                      <button
                        className="call-control"
                        onClick={() => audio.current?.play()}
                        aria-label="Enable partner audio"
                      >
                        <Volume2 />
                        <span>Hear partner</span>
                      </button>
                      <button
                        className="call-control end-call"
                        onClick={() => leave(false)}
                      >
                        <PhoneOff />
                        <span>Leave call</span>
                      </button>
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() => leave(true)}
                      >
                        End session
                      </button>
                    </div>
                  )}
                </>
              )}
              <audio ref={audio} autoPlay playsInline />
              <div className="transcription-state">
                <span
                  className={`tiny-dot ${transcribing ? "" : "inactive"}`}
                />
                {teacher
                  ? "Transcripts appear as participants share speech or notes."
                  : transcribing
                    ? "Automatic transcription active · may contain errors"
                    : connection === "not-joined"
                      ? "You choose when to turn on your microphone."
                      : "Transcription unavailable or paused · written notes available"}
              </div>
            </div>
            {!teacher && (
              <div className="session-below">
                <button
                  className="quiet-button"
                  onClick={() => setReport(true)}
                >
                  <Flag size={16} /> Ask my teacher to review
                </button>
                <span className="small muted">
                  You can leave whenever you need to.
                </span>
              </div>
            )}
            {requester &&
              (ended || connection === "connected") &&
              !detail.session.outcome && (
                <div className="outcome-card">
                  <span className="eyebrow">A LITTLE CHECK-IN</span>
                  <h2>Did that help things click?</h2>
                  <p>
                    Your answer updates your request. It doesn’t grade your
                    classmate.
                  </p>
                  <div className="row wrap">
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() => outcome("resolved")}
                    >
                      <Check size={18} /> Yes, that helped
                    </button>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => outcome("still_need_help")}
                    >
                      I still need help <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            {detail.session.outcome && (
              <div className="outcome-card">
                <Check size={23} />
                <h3>
                  {detail.session.outcome === "resolved"
                    ? "The requester reported that this helped."
                    : "The requester still needs help."}
                </h3>
                <p>
                  This reflects the student’s own report, not an assessment of
                  mastery.
                </p>
              </div>
            )}
          </section>
          <aside className="transcript-panel">
            <div className="transcript-heading">
              <div>
                <FileText size={20} />
                <h2>Conversation notes</h2>
              </div>
              <span>Automatic transcripts may contain errors.</span>
            </div>
            <div className="transcript-list" aria-live="polite">
              {detail.transcript.length ? (
                detail.transcript.map((t) => (
                  <div className="transcript-item" key={t.id}>
                    <div className="row between">
                      <strong>
                        {detail.people.find((p) => p.id === t.authorId)?.name}
                      </strong>
                      <small>
                        {new Date(t.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </small>
                    </div>
                    <p>{t.text}</p>
                    <span className="transcript-source">
                      {t.source === "speech"
                        ? "Automatic transcript"
                        : "Shared written note"}
                    </span>
                  </div>
                ))
              ) : (
                <div className="transcript-empty">
                  <MessageCircle size={28} />
                  <h3>A place for the conversation.</h3>
                  <p>
                    Shared notes and supported speech transcripts will appear
                    here. Missing transcripts do not mean no conversation
                    occurred.
                  </p>
                </div>
              )}
            </div>
            {!teacher && !ended && connection !== "not-joined" && (
              <form
                className="note-composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  addNote();
                }}
              >
                <label className="sr-only" htmlFor="session-note">
                  Share a written note
                </label>
                <input
                  id="session-note"
                  placeholder="Share a written note…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={2000}
                />
                <button
                  className="icon-button"
                  aria-label="Send note"
                  disabled={!note.trim()}
                >
                  <Send size={18} />
                </button>
              </form>
            )}
            <p className="transcript-footer">
              <ShieldCheck size={13} /> Visible to participants and their
              classroom teacher.
            </p>
          </aside>
        </div>
      </main>
      {report && (
        <Modal title="Ask your teacher to review" onClose={closeReport}>
          <p className="muted">
            Tell your teacher what you would like them to look at. You can leave
            the call first.
          </p>
          <label className="field">
            What happened?
            <textarea
              rows={4}
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              maxLength={1000}
            />
          </label>
          <button
            className="button primary full"
            disabled={reportText.trim().length < 3 || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api(`sessions/${id}/report`, { text: reportText });
                setReport(false);
                setToast("Your teacher can now see your request for review.");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Share with my teacher <ArrowRight size={17} />
          </button>
        </Modal>
      )}
    </div>
  );
}
