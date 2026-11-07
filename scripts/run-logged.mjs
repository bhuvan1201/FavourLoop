import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

const [label, ...args] = process.argv.slice(2);
if (!label || !/^[a-z0-9_-]+$/i.test(label) || args.length === 0) {
  console.error(
    "Usage: node scripts/run-logged.mjs <label> <command> [arguments...]",
  );
  process.exit(1);
}
const startedAt = new Date().toISOString();
const runId = `${startedAt.replace(/[:.]/g, "-")}-${label}`;
const dir = join(process.cwd(), ".logs", "runs", runId);
mkdirSync(dir, { recursive: true, mode: 0o700 });
const redact = (value) => {
  let text = String(value)
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, "[REDACTED]")
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]");
  if (process.env.OPENAI_API_KEY)
    text = text.split(process.env.OPENAI_API_KEY).join("[REDACTED]");
  return text;
};
const log = join(dir, "output.log");
writeFileSync(log, "", { mode: 0o600 });
const record = {
  runId,
  label,
  startedAt,
  command: args.map(redact),
  status: "running",
};
const save = () =>
  writeFileSync(join(dir, "run.json"), JSON.stringify(record, null, 2) + "\n", {
    mode: 0o600,
  });
save();
console.log(`Run log: ${dir}`);
const child = spawn(args[0], args.slice(1), {
  stdio: ["inherit", "pipe", "pipe"],
  detached: process.platform !== "win32",
  env: { ...process.env, FAVOURLOOP_RUN_ID: runId },
});
const output = (chunk, stream) => {
  const text = redact(chunk.toString());
  appendFileSync(log, text);
  stream.write(text);
};
child.stdout.on("data", (chunk) => output(chunk, process.stdout));
child.stderr.on("data", (chunk) => output(chunk, process.stderr));
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    record.stopRequestedAt = new Date().toISOString();
    record.stopSignal = signal;
    save();
    try {
      if (process.platform === "win32") child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch {
      /* Child may already have exited. */
    }
  });
}
child.on("error", (error) => {
  record.error = redact(error.message);
  output(`${record.error}\n`, process.stderr);
});
child.on("close", (code, signal) => {
  Object.assign(record, {
    endedAt: new Date().toISOString(),
    exitCode: code,
    signal,
    status: record.stopSignal || signal ? "stopped" : code === 0 ? "passed" : "failed",
  });
  save();
  process.exitCode = code ?? 1;
});
