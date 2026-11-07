"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X, ArrowUpRight, Sparkles } from "lucide-react";
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <a href="/" className="brand" aria-label="FavourLoop home">
      <svg
        width="34"
        height="34"
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden="true"
      >
        <rect width="40" height="40" rx="13" fill="currentColor" />
        <path
          d="M13 24c-5-6 1-15 7-9l7 8c5 6-1 15-7 9"
          transform="translate(0 -4)"
          stroke="#eee9ff"
          strokeWidth="3.8"
          strokeLinecap="round"
        />
        <path
          d="M27 16c5 6-1 15-7 9l-7-8"
          transform="translate(0 0)"
          stroke="#bde2bb"
          strokeWidth="3.8"
          strokeLinecap="round"
        />
      </svg>
      {!compact && (
        <span>
          favourloop<span className="brand-dot">.</span>
        </span>
      )}
    </a>
  );
}
export function Avatar({
  name,
  color = "#ded5f3",
  size = "md",
}: {
  name: string;
  color?: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span
      className={`avatar avatar-${size}`}
      style={{ background: color }}
      aria-label={name}
    >
      {name
        .split(" ")
        .filter(Boolean)
        .map((n) => n[0])
        .slice(0, 2)
        .join("")}
    </span>
  );
}
export function Subject({ name }: { name: string }) {
  const theme =
    name === "Mathematics"
      ? "violet"
      : name === "Chemistry"
        ? "peach"
        : name === "Biology"
          ? "green"
          : name === "English"
            ? "blue"
            : "neutral";
  return <span className={`subject ${theme}`}>{name}</span>;
}
export function Status({ value }: { value: string }) {
  const labels: Record<string, string> = {
    open: "Finding a helper",
    matched: "Session arranged",
    resolved: "Resolved",
    cancelled: "Closed",
    pending: "Awaiting reply",
    accepted: "Accepted",
    declined: "Declined",
    expired: "Expired",
    ready: "Ready to connect",
    active: "In progress",
    ended: "Session ended",
  };
  return (
    <span className={`status status-${value}`}>
      <i />
      {labels[value] || value}
    </span>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-symbol">
        <Sparkles size={24} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function SectionTitle({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const nodes = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input, textarea, select, a[href], [tabindex="0"]',
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal ${wide ? "modal-wide" : ""}`}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function TextLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a className="text-link" href={href}>
      {children}
      <ArrowUpRight size={16} />
    </a>
  );
}
export function timeAgo(value: string) {
  const n = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60000),
  );
  return n < 1
    ? "Just now"
    : n < 60
      ? `${n}m ago`
      : n < 1440
        ? `${Math.floor(n / 60)}h ago`
        : `${Math.floor(n / 1440)}d ago`;
}
export async function api<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Please try again.");
  return data;
}
