# Traces and logs

Logging was added at the project owner’s request during the AI matching implementation on 7 November 2026. Earlier verification remains in the project documentation; subsequent command and test runs have separate retained artifacts.

| Location                         | Contents                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------- |
| `.logs/WORKLOG.md`               | Development actions, decisions and validation results                                               |
| `.logs/runs/<run-id>/run.json`   | Command, start/end timestamps and exit status                                                       |
| `.logs/runs/<run-id>/output.log` | Redacted stdout and stderr                                                                          |
| `.logs/runtime/events.ndjson`    | API and AI request metadata, one JSON record per line                                               |
| `.logs/browser/<run-id>/`        | Playwright HTML report, screenshots and traces for every test                                       |
| `.logs/integration/<run-id>/`    | Live synthetic OpenAI check, browser trace, console events when present, screenshot and result JSON |

## Correlate a request

Read `X-FavourLoop-Trace-Id` in the browser’s Network response headers, then find that `traceId` in `events.ndjson`. The matching HTTP event and model event share the identifier. The model event includes its OpenAI provider request ID, elapsed time, token usage when available, candidate count, result count and fallback reason. Dynamic record identifiers are omitted from route names.

Runtime diagnostics use an allowlist of metadata fields. They do not store API keys, authentication headers, account names/emails, raw learning text, model response bodies, call audio or transcripts. The command runner redacts OpenAI key patterns and bearer tokens. `.logs/` is excluded from Git and its top-level directory is private on this machine.

Browser trace files contain DOM and network evidence from the isolated synthetic test accounts, including their fictional learning content. The live-test result payload is also explicitly marked synthetic. These are local development artifacts; no logs or traces are uploaded by this implementation.

## Run with preserved output

```sh
node scripts/run-logged.mjs unit npm test
node scripts/run-logged.mjs build npm run build
node scripts/run-logged.mjs dev npm run dev
```

Use the dedicated test databases described in `README.md` for browser and API checks. Each invocation creates a new run directory. Runtime logging also works without the command wrapper; `FAVOURLOOP_LOG_DIR` can select a different local destination.

Open a saved browser trace with the installed Playwright command:

```sh
npm exec playwright show-trace /absolute/path/to/trace.zip
```

Logs currently remain on disk until removed manually. The app reports a local logging failure once without exposing the failing request’s contents or interrupting the student workflow.
