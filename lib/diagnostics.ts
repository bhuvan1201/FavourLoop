import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

type Diagnostic = {
  event: "http.request" | "ai.matching" | "ai.interpretation";
  status: number | "success" | "fallback" | "skipped" | "error";
  durationMs: number;
  httpStatus?: number;
  route?: string;
  method?: string;
  engine?: "openai" | "local";
  model?: string;
  providerRequestId?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  candidates?: number;
  matches?: number;
  items?: number;
  reason?:
    | "not_configured"
    | "no_candidates"
    | "http_error"
    | "invalid_response"
    | "provider_error";
};
const state = globalThis as unknown as {
  flTraceContext?: AsyncLocalStorage<string>;
  flLogWarning?: boolean;
};
const context = (state.flTraceContext ||= new AsyncLocalStorage<string>());
export const withTrace = <T>(id: string, fn: () => T): T => context.run(id, fn);

export function recordDiagnostic(event: Diagnostic) {
  try {
    const dir =
      process.env.FAVOURLOOP_LOG_DIR || join(process.cwd(), ".logs", "runtime");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const entry = {
      timestamp: new Date().toISOString(),
      traceId: context.getStore() || randomUUID(),
      runId: process.env.FAVOURLOOP_RUN_ID,
      ...event,
    };
    const line = JSON.stringify(entry).replace(
      /sk-[A-Za-z0-9_-]{16,}/g,
      "[REDACTED]",
    );
    appendFileSync(join(dir, "events.ndjson"), line + "\n", { mode: 0o600 });
  } catch {
    if (!state.flLogWarning) {
      state.flLogWarning = true;
      console.warn("[FavourLoop] Local diagnostics could not be written.");
    }
  }
}
