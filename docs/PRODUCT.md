# FavourLoop: local implementation scope

## Accepted direction

High school students describe their current learning needs and optional help offers through voice. The app stores confirmed details and matches willing classmates in their classroom. Both students decide whether to connect. Help takes place in live in-app voice calls. Teachers have read-only oversight of published activity and disclosed transcripts.

## Implemented interaction model

The student controls recording, interpretation, confirmation, inviting, accepting, calling, reporting, and resolving their request. The coordinator filters current offers and availability, respects declines, prevents self/cross-class matches and overbooking, persists consent, and supports reopening unresolved questions. Matching runs immediately after a student confirms a request and when they ask to find a helper. The server requires the same subject and an eligible, available helper; the model compares the specific meaning and stated scope of up to 12 offers. It can connect equivalent wording that lacks shared keywords. A shared word such as “equations” cannot pair chemistry with algebra. At most three explained suggestions are shown, and the server rechecks them before display and invitation. If AI is unavailable, a labeled local topic matcher is used. Recorded outcomes are immutable, so an old session cannot overwrite a later request state. Matching is currently request-driven; there is no background outreach, automatic scheduling, or autonomous repeated invitation.

## Visual direction

Warm off-white canvas, charcoal-green typography, lavender voice surfaces, soft subject colors, calm spacing, and simple initials avatars. Student views emphasize asking and offering; teacher views emphasize factual classroom activity. Responsive sidebar, single-column mobile layout, visible focus states, reduced-motion support, keyboard-accessible dialogs, and text alternatives to speech.

## Current local choices

Next.js with TypeScript; SQLite central persistence; local password authentication; optional OpenAI interpretation and semantic recommendations; browser speech input and read-aloud; peer-to-peer WebRTC audio. These choices allow useful local operation without paid cloud credentials. The planned school deployment can substitute managed auth/database, LiveKit/TURN, and server-side streaming transcription behind the same application workflows.

## Next iteration

1. School-controlled enrollment, identity verification, account recovery, and retention/deletion rules.
2. Managed media admission/revocation and TURN for real school networks.
3. Disclosed server-side two-track transcription and corrections, replacing optional browser transcripts.
4. Time-window availability, request/offer editing with proposal-version invalidation, and wider semantic-matching evaluation across subjects.
5. Background matching notices, idempotent notification outbox, expiry jobs, and outcome follow-up prompts.
6. School-approved reporting/intervention process consistent with the teacher's read-only role.
7. Real-device microphone, accessibility, speech accuracy, and concurrent classroom load evaluation.

## Development evidence

The work log lives in `.logs/WORKLOG.md`. Logged commands preserve their output and exit status; browser runs retain traces and screenshots; API and model calls share trace IDs with metadata-only runtime diagnostics. See `LOGGING.md` and `VERIFICATION.md`.
