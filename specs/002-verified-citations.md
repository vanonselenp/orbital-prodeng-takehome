# Verified Citations MVP

## Overview

Reduce hallucinated legal answers by requiring every assistant answer to include **validated, clickable citations** to uploaded documents. For the MVP, a citation is valid only if it points to exactly one uploaded document in the conversation and a real page within that document.

If the model cannot produce at least one valid citation, the product must **refuse the answer** and tell the user it cannot answer from the uploaded documents with a verifiable citation.

## Current State

- The LLM prompt asks the model to cite filenames and pages, but the backend does not validate that those citations are real.
- `sources_cited` is currently derived from regex matches like `section 1` or `page 3`, not from structured citation data.
- Messages store only plain text plus `sources_cited`; they do not persist structured citations.
- The frontend can only show a count like `3 sources cited`; it cannot render clickable citations or navigate the document viewer to a cited page.
- Uploaded document text already includes page markers such as `--- Page 3 ---`, and documents already store `page_count`.

## Product Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Behavior when no valid citations remain | Refuse answer | Trust is more important than partial but unsourced output |
| Citation granularity | Page only | Smallest useful clickable unit for MVP |
| Citation UI | Inline chips below the answer | Simple, explicit, easy to test |
| Validation strictness | Validate document + page now; leave snippet verification for later | Fastest path to trustworthy MVP |
| Duplicate filenames | Block duplicate filenames per conversation | Keeps citation-to-document mapping unambiguous |

## UX Design

### Assistant Message

Assistant answers keep their normal prose body, but gain a citation chip row beneath the answer:

```
+--------------------------------------------------+
| Assistant answer text ...                        |
|                                                  |
| [lease.pdf p.3] [addendum.pdf p.7]               |
+--------------------------------------------------+
```

- Each chip is clickable.
- Clicking a chip selects the cited document in the right panel and jumps the PDF viewer to the cited page.
- If the answer was refused because no valid citations were available, do not show citation chips.

### Refusal State

When the model response yields zero valid citations after validation, replace the assistant answer with grounded refusal copy:

`I can't answer that from the uploaded documents with a verifiable page citation.`

This refusal should be stored as the assistant message content so refreshes and later review preserve the same visible behavior.

---

## Architecture Changes

### Phase 1: Backend

#### 1.1 Message Citation Shape

Add a structured citation object for persisted assistant messages:

```python
class Citation(BaseModel):
    document_id: str
    filename: str
    page: int
    label: str
```

- `label` should be a UI-ready string such as `lease.pdf p.3`.
- `sources_cited` becomes `len(citations)` instead of regex-derived heuristics.

#### 1.2 Database Model (`backend/src/takehome/db/models.py`)

- Add a nullable JSON column to `messages` for structured `citations`.
- Keep `sources_cited` for summary/count display and backward-compatible sorting/filtering if needed.
- No new table is required for MVP.

#### 1.3 Alembic Migration

- Add a migration to introduce `messages.citations`.
- Make the field nullable so existing rows remain valid.

#### 1.4 LLM Service (`backend/src/takehome/services/llm.py`)

- Replace heuristic citation counting with structured citation extraction and validation helpers.
- Update the prompt so the model returns:
  - normal answer text
  - a machine-readable citation block that references uploaded filenames and page numbers
- Keep the machine-readable contract simple for MVP. Example shape:

```text
<citations>
[{"filename":"lease.pdf","page":3},{"filename":"addendum.pdf","page":7}]
</citations>
```

- Add helpers to:
  - parse the citation block from the final model output
  - map filenames to uploaded documents
  - reject citations when filename is missing, duplicated, unknown, malformed, or page is out of bounds
  - strip the machine-readable citation block from the user-visible answer text

#### 1.5 Document Service (`backend/src/takehome/services/document.py`)

- Reject uploads when a conversation already has a document with the same filename.
- Return a clear `ValueError` such as `A document named 'lease.pdf' already exists in this conversation.`

#### 1.6 Messages Router (`backend/src/takehome/web/routers/messages.py`)

- Load all uploaded documents with `id`, `filename`, and `page_count` before invoking validation.
- After the LLM stream completes:
  - parse citation candidates from the final response
  - validate them against uploaded documents
  - compute `sources_cited` from valid citations
  - if valid citation count is `0`, replace the answer text with the refusal message and persist `citations=[]`
- Return citations in both:
  - `GET /api/conversations/{conversation_id}/messages`
  - streamed SSE `message` event payload
  - streamed SSE `done` event payload if useful for consistency

#### 1.7 API Schema

Update `MessageOut` to include:

```python
class CitationOut(BaseModel):
    document_id: str
    filename: str
    page: int
    label: str

class MessageOut(BaseModel):
    # existing fields
    citations: list[CitationOut] = []
```

### Phase 2: Frontend

#### 2.1 Types (`frontend/src/types.ts`)

Add structured citations to the message type:

```typescript
export interface Citation {
	document_id: string;
	filename: string;
	page: number;
	label: string;
}

export interface Message {
	// existing fields
	citations: Citation[];
}
```

#### 2.2 Message Rendering (`frontend/src/components/MessageBubble.tsx`)

- Replace the current plain `sources_cited` count-only footer with clickable citation chips.
- Keep the count if desired, but derive it from `message.citations.length` or `sources_cited` only when the two are guaranteed consistent.
- Add a prop like:

```typescript
onCitationClick?: (citation: Citation) => void;
```

- Only assistant messages render citations.

#### 2.3 Chat Window (`frontend/src/components/ChatWindow.tsx`)

- Thread `onCitationClick` through to each `MessageBubble`.

#### 2.4 Document State (`frontend/src/hooks/use-documents.ts`)

- Add a helper that can select a document by ID when a citation is clicked.
- Preserve current selected document behavior for uploads/deletes.

#### 2.5 Document Viewer (`frontend/src/components/DocumentViewer.tsx`)

- Add a controlled seam for citation navigation, for example:

```typescript
targetPage?: number | null;
```

or an equivalent prop pair driven by `selectedDocument` + `targetPage`.

- When `selectedDocument` changes because of a citation click, open that document.
- When `targetPage` is provided, clamp it into `1..numPages` and navigate there.
- Maintain existing page reset behavior for normal document switching, but allow explicit citation navigation to override the default reset to page 1.

#### 2.6 App Wiring (`frontend/src/App.tsx`)

- Add a citation click handler that:
  - selects the cited document
  - sets the target page for the document viewer
- Pass the handler down to `ChatWindow` and the target page into `DocumentViewer`.

#### 2.7 API Client and Streaming Hook

- Update `frontend/src/lib/api.ts` message types to include `citations`.
- Update `frontend/src/hooks/use-messages.ts` to preserve citations from SSE `message` events and from canonical refresh fetches.
- Synthetic fallback assistant messages created client-side during incomplete streams should default to `citations: []`.

---

## Validation Rules

For MVP, a citation is valid only if all conditions pass:

1. `filename` exactly matches one uploaded document in the conversation.
2. The match is unique because duplicate filenames are disallowed.
3. `page` is an integer.
4. `page` is between `1` and the document's `page_count`, inclusive.

Invalid citations are silently dropped from the final citation list. The answer is refused if all citations are dropped.

## Non-Goals

- Snippet-level verification against extracted page text.
- Inline superscript citations inside the prose body.
- Cross-highlighting quoted text inside the PDF.
- Confidence scores or probabilistic trust indicators.
- Retroactively backfilling citations for old messages.

---

## Phase 3: Testing (TDD)

All implementation work must follow **red-green-refactor** and preserve **100% coverage** under the repo rules.

### Backend Tests

| Test File | New Tests |
|-----------|-----------|
| `backend/tests/test_services_llm.py` | Parse machine-readable citation block from model output |
| | Validate known filename + in-range page succeeds |
| | Unknown filename is dropped |
| | Non-integer page is dropped |
| | Out-of-range page is dropped |
| | User-visible answer text strips the citation block |
| | Zero valid citations triggers refusal result |
| `backend/tests/test_api_messages.py` | SSE final `message` payload includes `citations` |
| | `done` payload reports validated citation count |
| | Persisted assistant message stores citations and correct `sources_cited` |
| | Unsourced model answer is replaced by refusal copy |
| `backend/tests/test_services_document.py` | Duplicate filename upload is rejected |
| `backend/tests/test_api_documents.py` | Duplicate filename upload returns the chosen error status |

### Frontend Tests

| Test File | New Tests |
|-----------|-----------|
| `frontend/src/components/MessageBubble.test.tsx` | Assistant message renders clickable citation chips |
| | Clicking a chip calls `onCitationClick` with the citation |
| | No chips render for messages with empty citations |
| `frontend/src/components/DocumentViewer.test.tsx` | Viewer navigates to target page from props |
| | Target page clamps to valid bounds |
| | Citation-driven navigation selects the right page after document switch |
| `frontend/src/App.test.tsx` | Clicking a citation selects the cited document and navigates to the cited page |
| `frontend/src/hooks/use-messages.test.ts` | SSE final message with citations is preserved in state |
| | Synthetic fallback assistant message defaults to `citations: []` |
| `frontend/src/lib/api.test.ts` | Message payloads with `citations` deserialize correctly |

## Rollout Notes

- This MVP should treat missing verified citations as a product-level failure, not just a UI warning.
- The data model should leave room for a later Phase 2 enhancement that adds snippet or quote verification on top of the same structured citation objects.
- After launch, measure:
  - rate of refused answers
  - rate of answers with at least one valid citation
  - click-through on citation chips
  - thumbs down rate for cited vs refused vs uncited legacy behavior
