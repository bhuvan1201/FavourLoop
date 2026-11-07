# Vercel deployment

Deployment preparation started on 7 November 2026. The Vercel project is
`bhuvan-gowda/favourloop`. Production is available at
[favourloop.vercel.app](https://favourloop.vercel.app).

## Database prerequisite

The database adapter uses asynchronous queries with local SQLite when
`DATABASE_URL` is absent and Neon Postgres when it is configured. Vercel requires
the hosted database and fails explicitly if the connection setting is missing.
Accounts, authentication sessions, classroom activity, recommendations, and
voice-call signaling are shared across function instances.

The connected database is `favourloop-db`, using Neon's Free plan (`free_v3`),
in `iad1`. Built-in Neon authentication is disabled: FavourLoop retains its own
password hashing and session cookies. The account owner accepted the marketplace
terms and explicitly authorized uploading the existing OpenAI key to Vercel's
production environment.

Deployment configuration:

1. Node.js 24; Next.js production build; Vercel functions in `iad1` with a
   60-second maximum duration.
2. A shared Postgres advisory transaction lock serializes this demo's writes,
   preserving checks for acceptance, draft confirmation, and outcomes. Local
   SQLite uses a process-local transaction queue. This favors correctness for
   classroom demos over high-volume write throughput.
3. Schema initialization and synthetic seeding are protected by a separate
   Postgres transaction lock. Existing local account data is not uploaded.
4. `.vercelignore` excludes environment files, local databases, and private traces.
   Database credentials and the OpenAI key are server-side environment variables.
5. Secure HTTPS cookies and AI matching are enabled. `ALLOW_DEMO=true` enables
   the fictional classroom; do not enter real student information in this public demo.
6. Runtime logs contain the existing redacted metadata. Request rate limits
   remain per function instance; a real school rollout needs shared rate limiting
   and the enrollment safeguards listed in the README.

Verification before deployment passed: 23 unit tests, production build with
TypeScript, hosted database rollback/concurrency checks, and four browser tests
against Neon, including real WebRTC with synthetic microphone audio. The initial
standalone typecheck overlapped regenerated Next.js type files and failed on
missing generated files; the subsequent production build typecheck passed.
Live HTTPS checks confirm the landing page and configuration return 200, AI and
demo flags are enabled, and unauthenticated classroom access returns 401.

All five browser checks passed on the final public deployment, including password
sign-in with saved records, AI matching, permissions, WebRTC, and mobile layout.
An initial live run exposed native form submission before hydration; account
forms now use POST and keep submission disabled until JavaScript is ready. A
no-JavaScript regression check covers student signup, teacher signup, and login.
Standalone TypeScript verification also passed after generated types stabilized.

Final deployment: `dpl_82z4wBzSrQNRV7nkoTP9eB67en6h`.
The live browser report and traces are retained locally at
`.logs/browser/2026-11-07T21-08-56-571Z-vercel-live-browser-final/`.

Runtime diagnostics already support Vercel standard output. Trace identifiers
and the existing redacted metadata are available through Vercel Runtime Logs;
local runs continue to write `.logs/runtime/events.ndjson`.

## Account setup

Vercel CLI authorization succeeded. GitHub auto-deployment is not connected:
Vercel requires a GitHub Login Connection for the repository owner. Deployment
from the linked local folder can proceed independently of that connection.

The existing call implementation uses peer-to-peer WebRTC and STUN. Calls across
restrictive networks may need TURN credentials; basic hosting alone does not
provide a relay service.

CLI setup output and validation output are retained locally under `.logs/runs/`.
No cloud database credentials or authentication tokens belong in this document.
