# PRD: Verified Citations MVP

## 1. Introduction/Overview

Add verified, clickable citations to assistant answers so lawyers can trust that each answer is grounded in the uploaded documents. Today, the system can produce answers that sound authoritative without proving that the cited material actually exists in the document set. This creates a serious trust problem for lawyers working on high-value transactions.

The first release must ensure that an answer is only presented as grounded when the system can validate at least one real citation to an uploaded document page. If no valid citation remains after validation, the system should refuse the answer and show a clear warning state.

This PRD optimizes for both associates and partners. Associates need faster verification during review, and partners need confidence that the system is safe enough to rely on.

## 2. Goals

- Restore user trust by ensuring assistant answers are backed by at least one validated citation.
- Reduce thumbs down feedback on assistant answers, especially for answers that would previously have had no real source support.
- Let users click a citation and navigate directly to the cited PDF page.
- Make refusal behavior explicit when the system cannot ground an answer in the uploaded documents.
- Preserve a small, implementable MVP boundary: page-level citation validation only.

## 3. User Stories

### US-001: Persist structured citations on assistant messages
**Description:** As a developer, I want assistant messages to store structured citations so the frontend can render and reuse validated sources after refresh.

**Acceptance Criteria:**
- [ ] Add a structured `citations` field to persisted assistant messages.
- [ ] Each citation includes `document_id`, `filename`, `page`, and `label`.
- [ ] Existing messages remain valid if they have no citations.
- [ ] Typecheck/lint passes.

### US-002: Parse citation candidates from model output
**Description:** As a developer, I want the backend to parse machine-readable citation candidates from the model output so the system can validate them deterministically.

**Acceptance Criteria:**
- [ ] The LLM contract includes a machine-readable citation block in the final response format.
- [ ] The backend extracts citation candidates from that block.
- [ ] The user-visible answer text excludes the machine-readable citation block.
- [ ] Malformed citation blocks do not crash the request flow.
- [ ] Typecheck/lint passes.

### US-003: Validate citations against uploaded documents
**Description:** As a lawyer, I want the system to reject fake or invalid citations so I only see answers grounded in real uploaded pages.

**Acceptance Criteria:**
- [ ] A citation is accepted only when its filename matches exactly one uploaded document in the conversation.
- [ ] A citation is accepted only when its page is an integer between `1` and that document's `page_count`.
- [ ] Citations with unknown filenames are dropped.
- [ ] Citations with invalid or out-of-range pages are dropped.
- [ ] `sources_cited` is derived from the count of validated citations, not regex matches.
- [ ] Typecheck/lint passes.

### US-004: Refuse answers with no valid citations
**Description:** As a lawyer, I want the system to say it cannot verify an answer when no valid citation exists so I do not rely on unsupported output.

**Acceptance Criteria:**
- [ ] If zero valid citations remain after validation, the assistant message content is replaced with refusal copy.
- [ ] Refusal copy clearly states that the answer could not be verified from the uploaded documents.
- [ ] The refusal state does not include additional guidance or next-step suggestions.
- [ ] Refused answers persist as stored messages and survive page refresh.
- [ ] Refused answers have `citations: []` and `sources_cited: 0`.
- [ ] Typecheck/lint passes.

### US-005: Show clickable citation chips below assistant answers
**Description:** As a lawyer, I want to see and click citation chips below an answer so I can inspect the source material immediately.

**Acceptance Criteria:**
- [ ] Assistant messages with validated citations show one chip per citation below the answer text.
- [ ] Each chip label follows a consistent format such as `lease.pdf p.3`.
- [ ] Messages with no citations do not show citation chips.
- [ ] The warning/refusal state is visually distinct from a normal cited answer.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-006: Navigate the document viewer from citation clicks
**Description:** As a lawyer, I want clicking a citation chip to open the right document and page so I can verify the answer quickly.

**Acceptance Criteria:**
- [ ] Clicking a citation chip selects the cited document in the document viewer.
- [ ] The document viewer navigates to the cited page.
- [ ] Citation navigation clamps to valid page bounds if needed.
- [ ] Switching by citation does not leave the viewer on the wrong page from a prior document.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-007: Prevent ambiguous duplicate filenames in a conversation
**Description:** As a lawyer, I want document filenames within a conversation to be unique so citations always resolve to exactly one document.

**Acceptance Criteria:**
- [ ] Uploading a document whose filename already exists in the same conversation is rejected.
- [ ] The API returns a clear error message explaining that the filename already exists.
- [ ] Existing behavior for unique filenames remains unchanged.
- [ ] Typecheck/lint passes.

### US-008: Return citations consistently through API and streaming
**Description:** As a frontend developer, I want citations included in message APIs and SSE payloads so the UI can render verified citations consistently during and after streaming.

**Acceptance Criteria:**
- [ ] `GET /api/conversations/{conversation_id}/messages` returns `citations` for assistant messages.
- [ ] Final SSE `message` payload includes `citations`.
- [ ] Streaming completion metadata reflects the validated citation count only; the full citation list is sent in the final `message` payload.
- [ ] Frontend refresh after streaming preserves the same citation data shown during streaming.
- [ ] Typecheck/lint passes.

### US-009: Log dropped citation candidates
**Description:** As a product and engineering team, I want invalid citation candidates logged so we can measure model quality and investigate grounding failures.

**Acceptance Criteria:**
- [ ] The backend logs dropped citation candidates during validation.
- [ ] Each log entry includes enough context to diagnose the drop reason, such as filename, page, and validation failure reason.
- [ ] Logging dropped citations does not change the user-visible response.
- [ ] Typecheck/lint passes.

## 4. Functional Requirements

- FR-1: The system must require assistant answers to have at least one validated citation before they are treated as grounded answers.
- FR-2: The system must represent citations as structured data containing `document_id`, `filename`, `page`, and `label`.
- FR-3: The system must validate citations only against documents uploaded to the same conversation.
- FR-4: The system must reject any citation whose filename does not match exactly one uploaded document.
- FR-5: The system must reject any citation whose page is missing, non-numeric, less than `1`, or greater than the target document's `page_count`.
- FR-6: The system must compute `sources_cited` from the final validated citation list.
- FR-7: The system must replace the assistant answer with refusal copy when all citation candidates are invalid or missing.
- FR-8: The system must persist the final assistant message content and final citation list so the same result appears after refresh.
- FR-9: The system must expose structured citations in message list responses.
- FR-10: The system must expose structured citations in the final SSE message payload.
- FR-11: The frontend must render one clickable chip per validated citation below assistant messages.
- FR-12: When a user clicks a citation chip, the system must select the cited document and navigate the viewer to the cited page.
- FR-13: The frontend must show a distinct warning/refusal state when an answer cannot be verified.
- FR-14: The document upload flow must reject duplicate filenames within a single conversation.
- FR-15: The streaming `done` payload must include only completion metadata, while the final SSE `message` payload must include the full citation list.
- FR-16: The backend must log dropped citation candidates with validation failure reasons for internal monitoring.
- FR-17: The system must keep snippet verification and confidence scoring out of the MVP implementation.

## 5. Non-Goals (Out of Scope)

- Verifying quoted snippets against extracted page text.
- Showing inline superscript citations inside the body of the answer.
- Highlighting quoted text inside the PDF viewer.
- Adding confidence scores, probability scores, or confidence badges.
- Retrofitting old assistant messages with structured citations.
- Supporting ambiguous citations across duplicate filenames.

## 6. Design Considerations

- Reuse the existing assistant message layout and add citation chips beneath the answer body.
- Reuse the existing document viewer and document selection flow instead of creating a new citation panel.
- Warning/refusal UI should be clear enough that a lawyer can distinguish it from a normal cited answer at a glance.
- Citation chip labels should be short, stable, and readable in dense review workflows.
- The UI should continue to work on both desktop and smaller screens where the document viewer is narrower.

## 7. Technical Considerations

- The backend currently stores only `sources_cited`; it will need a structured `citations` field on messages.
- The current citation count is heuristic and must be replaced by deterministic validation logic.
- Uploaded documents already store `page_count`, which is sufficient for MVP page validation.
- The frontend currently renders only a source count and will need message type updates to include citations.
- Streaming payloads and canonical message fetches must return the same citation shape to avoid UI mismatch.
- The repo requires red-green-refactor TDD and 100% coverage for both backend and frontend.
- Frontend UI stories must include browser verification using the `dev-browser` skill.

## 8. Success Metrics

- Primary: reduce thumbs down feedback on assistant answers after launch.
- Reduce the share of displayed grounded answers that have zero validated citations to effectively zero.
- Increase the share of assistant answers that present at least one clickable citation.
- Achieve measurable citation click-through from users reviewing answers.
- Reduce qualitative feedback describing answers as authoritative but unsupported.

## 9. Open Questions

- Future phase: should snippet verification become required for all cited answers or only for certain answer types?
