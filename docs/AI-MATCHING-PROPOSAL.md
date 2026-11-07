# AI matching data flow

Status: explicitly approved by the project owner on 7 November 2026, implemented and verified with synthetic classroom data.

OpenAI compares a confirmed request against eligible help offers in the classroom database. The normal configured-key path now uses this feature; `OPENAI_MATCHING_ENABLED=false` selects local matching. The data fields remain those in the approved proposal.

## Payload sent to OpenAI

For the requesting student: the confirmed subject, topic and free-text detail.
For up to 12 eligible offers: the offer identifier, subject, topic and free-text detail.

Account names, account email addresses, passwords, full profiles, call audio and conversation transcripts are not separate payload fields. Free-text details may nevertheless contain personal information entered by a student. The Responses API request uses `store: false`; that setting is not a promise of zero provider retention.

Example using synthetic data:

```json
{
  "request": {
    "subject": "Mathematics",
    "topic": "Factoring quadratic equations",
    "detail": "I get stuck choosing factors."
  },
  "offers": [
    {
      "offerId": "sample-offer",
      "subject": "Mathematics",
      "topic": "Quadratic equations",
      "detail": "I can help with factoring and the quadratic formula."
    }
  ]
}
```

## Result and boundaries

The model may return up to three supplied offer identifiers, each with one explanation. An empty list is valid. It cannot create invitations, accept on behalf of a student, join calls, or change records.

Server code filters classroom, student role, voluntary active offer, availability, self-matches, declined invitations and occupied students before calling the model. Returned identifiers are checked against that eligible set and eligibility is checked again after the response. Recommendations expire after 15 minutes and are checked again before an invitation is created. Both students still choose whether to connect.

Without a key, or if the provider is unavailable, clearly labeled local topic matching remains available. Ambiguous exclusions stay conservative in that fallback.

## Verification completed

- A request to write a second-degree expression as a product matched an offer to explain factoring, despite no keyword match.
- The live test rejected an offer that explicitly excluded factoring. Unit tests rejected invented and unsupplied offer IDs.
- Database-service tests changed availability, requests and offers during a lookup and rejected stale results.
- Browser/API tests preserved teacher read-only access, classroom isolation, expiration and mutual acceptance.
- All integration fixtures were synthetic. Results and traces are indexed in `VERIFICATION.md`.

## Implementation and diagnostics

`lib/recommend.ts` constructs the allowlisted payload and uses strict structured output. `lib/match-service.ts` checks current eligibility again after the response, retains accepted offer IDs for 15 minutes, and validates invitations against current eligibility. AI searches are limited to six per minute per student. A valid empty model result remains empty; provider failures use a labeled local fallback.

The implementation follows [OpenAI’s Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses). Runtime logs contain correlation IDs, provider request IDs, timing, token counts and result counts. They do not include the learning text or model response body. See `LOGGING.md`.
