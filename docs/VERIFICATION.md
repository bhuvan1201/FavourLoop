# Local verification — 7 November 2026

AI matching is enabled in `/Users/bhuvan/Documents/FavourLoop` after the project owner approved the data flow. The API key remains in `.env.local` and is never included in this report.

| Check | Result | Evidence |
| --- | --- | --- |
| Production build and TypeScript | Passed | Detailed log retained locally |
| Unit tests | 21 passed | Detailed log retained locally |
| Production browser suite | All 4 passed, with a trace for each | Report and traces retained locally |
| Live OpenAI integration | Passed using synthetic classroom fixtures | Result and trace retained locally |
| Intentional server shutdown logging | Passed, including exit code 143 | Detailed log retained locally |
| API-key leak scan | No key found in 73 artifacts or 718 decompressed trace entries | Detailed log retained locally |

## What the live AI check demonstrated

A synthetic student statement produced a separate Mathematics request and Chemistry offer. The teacher could see neither before confirmation and both afterward.

The student then confirmed a private draft with the wording “Writing a second-degree expression as a product,” illustrated by `x² + 5x + 6 → (x + 2)(x + 3)`. The local keyword matcher found no match. OpenAI connected it with Maya’s stated factoring offer and explained the connection. It rejected another available helper whose offer explicitly excluded factoring. The browser displayed the AI suggestion and the original help offer for review.

The test also rejected teacher and cross-classroom matching access, an expired recommendation, and an invitation after the helper paused availability. A fresh, eligible recommendation allowed an invitation, and the helper still had to accept before a session existed. The synthetic session was completed afterward so subsequent runs can reuse the fixture helper.

All four live model operations (one interpretation and three matching calls) have OpenAI request IDs, timing and token metadata, and corresponding HTTP trace IDs in `.logs/runtime/events.ndjson`.

## Other checks

Unit tests cover payload allowlisting, the 12-candidate limit, invented IDs, duplicate helpers, IDs outside the supplied set, empty recommendations, provider errors/refusals, local fallback, expiration and eligibility changes while a model call is pending. Provider failure cases are simulated; the successful semantic match was checked against the live API.

Browser checks cover signup, confirmation and persistence, classroom/role boundaries, mutual acceptance, a real WebRTC peer connection using synthetic audio, mute controls, teacher-visible notes, outcomes, closed-session rejection and mobile layout. Current student, teacher and AI match views were visually inspected.

## Screenshots and logs

- [AI matching](screenshots/ai-matching.png)
- [Student dashboard](screenshots/student-desktop.png)
- [Teacher dashboard](screenshots/teacher-desktop.png)
- [Mobile dashboard](screenshots/student-mobile.png)
- [Live call](screenshots/live-call.png)
- Local `.logs/INDEX.md` — all command runs, reports, and traces; intentionally excluded from Git
- Local `.logs/WORKLOG.md` — development work log; intentionally excluded from Git

The API-key scan covered the saved artifacts and decompressed trace contents; it checked for the configured key without printing its value. Runtime logs are metadata-only. Browser trace content comes from synthetic test accounts. Both owned test servers were stopped after verification, and all run artifacts were retained.

## Remaining limits

- Real-microphone quality and browser speech-recognition accuracy still need a manual check. Written notes remain available when browser transcription is unavailable.
- Matching considers up to 12 eligible offers per lookup. Its semantic judgments are suggestions for students to review; it does not measure ability or guarantee a successful session.
- Reliable calls across restricted networks need TURN infrastructure, and non-localhost microphone access needs HTTPS.
- This is a local classroom demo. School enrollment, account recovery, retention and production operations remain later work.
