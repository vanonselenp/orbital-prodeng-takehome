# Multi-Document Conversations

## Overview

Extend the application so conversations can contain **multiple documents** (up to 10). Users can upload additional documents to an existing conversation, view any document in the reader panel, and ask questions that reference any or all uploaded documents.

## Current State

- Three-panel layout: conversation list (left), chat (center), document viewer (right)
- One document per conversation, enforced in the service layer (`document.py` lines 29-31), not by DB constraint
- DB schema already supports one-to-many (`documents.conversation_id` FK, no unique constraint)
- LLM receives the full `extracted_text` of the single document in every prompt
- Upload entry points: EmptyState drag-drop zone + ChatInput paperclip button (disabled after first upload)

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Document thumbnails | Filename cards with PDF icon | Simpler to implement, reliable, no canvas rendering overhead |
| Auto-switch on upload | Yes | User just uploaded it, likely wants to see it |
| Document deletion | Allowed with confirmation dialog | Users need to manage their docs, but deletion is destructive |
| LLM context strategy | Send all docs, truncate if total > ~150k chars | Balances completeness with context window limits |
| Document limit | 10 per conversation | Prevents abuse, keeps UI manageable, avoids context overflow |
| `has_document` field | Replace with `document_count: int` | More useful than a boolean with multi-doc |

## UX Design

### Right Panel (Document Viewer)

```
+------------------------------------------+
|  [doc1.pdf] [doc2.pdf] [lease.pdf] [+]   |  <-- Thumbnail strip (horizontal scroll)
+------------------------------------------+
|                                          |
|                                          |
|            PDF Viewer                    |
|         (selected document)              |
|                                          |
|                                          |
+------------------------------------------+
|       < Page 3 of 12 >                  |  <-- Page controls
+------------------------------------------+
```

- **Thumbnail strip**: Horizontal row of small cards at the top. Each card shows a PDF icon + truncated filename. Selected card has highlighted border. Each card has a small delete (X) button. A `+` button at the end opens file picker for additional uploads.
- **PDF viewer**: Shows the currently selected document. Resets to page 1 when switching documents.
- **Page controls**: Bottom bar with prev/next and page indicator, scoped to the currently selected document.
- **Empty state**: When no documents exist, shows the existing "No document uploaded" placeholder.

### ChatInput Changes

- Paperclip button is **always active** (no more "Document already uploaded" disabled state)
- Disabled only when the 10-document limit is reached, with tooltip "Maximum documents reached"

### EmptyState

- Still shows when no messages exist AND no documents exist (same logic, using `documents.length === 0`)

---

## Architecture Changes

### Phase 1: Backend

#### 1.1 Document Service (`backend/src/takehome/services/document.py`)

- **Remove** the single-document constraint (lines 29-31: `existing` check + `ValueError`)
- **Add** `MAX_DOCUMENTS_PER_CONVERSATION = 10` constant
- **Add** check in `upload_document()`: count existing docs, reject with `ValueError` if >= 10
- **Add** `get_documents_for_conversation(session, conversation_id) -> list[Document]` -- returns all documents ordered by `uploaded_at`
- **Add** `delete_document(session, document_id) -> bool` -- deletes DB record and file from disk, returns whether it existed
- **Keep** `get_document_for_conversation()` for backward compatibility (or remove if unused after refactor)

#### 1.2 Conversations Router (`backend/src/takehome/web/routers/conversations.py`)

- **Change** `ConversationListItem.has_document: bool` to `document_count: int`
- **Change** `ConversationDetail.document: DocumentInfo | None` to `documents: list[DocumentInfo]`
- **Update** serialization in list and detail endpoints

#### 1.3 Documents Router (`backend/src/takehome/web/routers/documents.py`)

- **Add** `GET /api/conversations/{conversation_id}/documents` -- list all documents for a conversation
- **Add** `DELETE /api/conversations/{conversation_id}/documents/{document_id}` -- delete a document
- **Update** upload endpoint: remove 409 "already has a document" response, add 409 for "maximum documents reached"

#### 1.4 LLM Service (`backend/src/takehome/services/llm.py`)

- **Rename** `chat_with_document()` to `chat_with_documents()`
- **Change** parameter: `document_text: str | None` becomes `documents: list[tuple[str, str]]` (list of `(filename, extracted_text)` pairs)
- **Construct** prompt with multiple labeled document blocks:
  ```
  <document filename="lease-agreement.pdf">
  --- Page 1 ---
  ...
  </document>

  <document filename="addendum.pdf">
  --- Page 1 ---
  ...
  </document>
  ```
- **Update** system prompt to instruct the AI to always cite document filenames when referencing content (e.g., "In lease-agreement.pdf, page 3...")
- **Add** truncation logic: if combined text exceeds ~150,000 characters, truncate from the end of the largest documents with a note `[Document truncated due to length]`

#### 1.5 Messages Router (`backend/src/takehome/web/routers/messages.py`)

- **Update** `send_message()`: load all documents for conversation via `get_documents_for_conversation()`
- **Collect** `(filename, extracted_text)` pairs for each document
- **Pass** to `chat_with_documents()` instead of single text

#### 1.6 Alembic Migration

- **Not required** for schema changes (DB already supports multiple docs per conversation)
- **Optional**: Add an index on `documents.conversation_id` for query performance

---

### Phase 2: Frontend

#### 2.1 Types (`frontend/src/types.ts`)

```typescript
// Before
export interface Conversation {
    has_document: boolean;
    // ...
}
export interface ConversationDetail extends Conversation {
    document?: Document;
}

// After
export interface Conversation {
    document_count: number;
    // ...
}
export interface ConversationDetail extends Conversation {
    documents: Document[];
}
```

#### 2.2 API Client (`frontend/src/lib/api.ts`)

- **Add** `fetchDocuments(conversationId: string): Promise<Document[]>` -- `GET /api/conversations/:id/documents`
- **Add** `deleteDocument(conversationId: string, documentId: string): Promise<void>` -- `DELETE /api/conversations/:id/documents/:id`
- **Update** `fetchConversation()` response type (now has `documents[]`)

#### 2.3 `useDocuments` Hook (rename from `useDocument`)

New file: `frontend/src/hooks/use-documents.ts`

State:
- `documents: Document[]`
- `selectedDocumentId: string | null`
- `uploading: boolean`
- `error: string | null`

Derived:
- `selectedDocument: Document | null` -- looked up from `selectedDocumentId` in the array
- `canUpload: boolean` -- `documents.length < 10`

Actions:
- `refresh()` -- fetches conversation detail, extracts `documents` array
- `selectDocument(id: string)` -- sets `selectedDocumentId`
- `upload(file: File)` -- calls API, appends new doc to array, auto-selects it
- `remove(id: string)` -- calls delete API, removes from array, auto-selects next doc or null

Behavior:
- On `conversationId` change: refresh and auto-select first document
- On upload success: auto-select the newly uploaded document
- On delete of selected doc: auto-select the next doc in the list, or the previous, or null

#### 2.4 DocumentViewer Component (`frontend/src/components/DocumentViewer.tsx`)

New props:
```typescript
interface DocumentViewerProps {
    documents: Document[];
    selectedDocument: Document | null;
    onSelectDocument: (id: string) => void;
    onDeleteDocument: (id: string) => void;
    onUpload: (file: File) => void;
    canUpload: boolean;
}
```

New elements:
- **Thumbnail strip** at top: horizontal row of cards, scrollable
  - Each card: PDF icon + truncated filename (max ~15 chars) + small X delete button
  - Selected card: highlighted border (e.g., `ring-2 ring-primary`)
  - `+` button at the end (disabled when `!canUpload`)
- **Delete confirmation dialog**: Radix Dialog triggered by the X button, asks "Delete {filename}? This cannot be undone."
- **Page reset**: When `selectedDocument` changes, reset `currentPage` to 1

#### 2.5 ChatInput Component (`frontend/src/components/ChatInput.tsx`)

- **Replace** `hasDocument: boolean` prop with `canUpload: boolean`
- Paperclip button: disabled when `!canUpload` (tooltip: "Maximum documents reached"), otherwise always active

#### 2.6 App.tsx

- Wire `useDocuments(selectedId)` instead of `useDocument(selectedId)`
- Pass `documents`, `selectedDocument`, `selectDocument`, `canUpload` to DocumentViewer
- Pass `canUpload` to ChatInput
- Update `handleUpload` and add `handleDeleteDocument` callbacks
- Update `handleSend` if needed (likely no change -- the backend handles multi-doc context)

#### 2.7 ChatSidebar Component

- Replace `has_document` indicator with `document_count` display (e.g., small badge showing "3 docs")

---

### Phase 3: Testing (TDD)

All changes follow **red-green-refactor**. Write a failing test first, make it pass, then refactor.

#### Backend Tests

| Test File | New Tests |
|-----------|-----------|
| `test_services_document.py` | Upload multiple docs to same conversation succeeds |
| | Upload at max limit (10) is rejected with ValueError |
| | `get_documents_for_conversation` returns all docs ordered by `uploaded_at` |
| | `delete_document` removes record and file, returns True |
| | `delete_document` with nonexistent ID returns False |
| `test_api_documents.py` | Upload second doc returns 201 (no more 409) |
| | Upload at limit returns 409 |
| | `GET /conversations/:id/documents` returns list |
| | `DELETE /conversations/:id/documents/:id` returns 204 |
| | `DELETE` nonexistent returns 404 |
| `test_api_conversations.py` | Detail response has `documents: list` |
| | List response has `document_count: int` |
| `test_services_llm.py` | `chat_with_documents` constructs prompt with multiple `<document>` blocks |
| | Truncation logic when combined text exceeds threshold |
| | No documents case (tells user to upload) |
| `test_api_messages.py` | Streaming with multiple documents' text passed to LLM |

#### Frontend Tests

| Test File | New Tests |
|-----------|-----------|
| `use-documents.test.ts` | Manages document array, initial fetch populates list |
| | `selectDocument` updates selected state |
| | `upload` appends to array and auto-selects |
| | `remove` deletes and auto-selects next doc |
| | `canUpload` is false when at 10 docs |
| | Error handling for upload and delete |
| `DocumentViewer.test.tsx` | Renders thumbnail strip with multiple documents |
| | Clicking thumbnail switches selected document |
| | Delete button triggers confirmation dialog |
| | Confirming delete calls `onDeleteDocument` |
| | `+` button disabled when `!canUpload` |
| | Page resets to 1 when switching documents |
| `ChatInput.test.tsx` | Paperclip enabled when `canUpload` is true |
| | Paperclip disabled when `canUpload` is false |
| | Tooltip shows "Maximum documents reached" |
| `api.test.ts` | `fetchDocuments` calls correct endpoint |
| | `deleteDocument` calls correct endpoint |
| `App.test.tsx` | Integration with multi-document state |

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM context overflow with many large documents | AI errors or degraded responses | Truncation at 150k chars with clear note; 10-doc limit |
| AI responses become ambiguous with multiple docs | User confusion about which document is being referenced | Updated system prompt requiring filename citations |
| Breaking API change (`document` -> `documents`) | Frontend/backend version mismatch during deploy | Both deploy together in Docker; no external consumers |
| File storage growth with more docs per conversation | Disk space | Already handled by 25MB per-file limit; 10-doc limit caps at 250MB per conversation |
| Thumbnail strip overflow with 10 documents | UI clutter | Horizontal scrolling with overflow-x-auto |
| Delete confirmation fatigue | Slower workflow | Keep dialog minimal; consider "Don't ask again" in future |

## Implementation Order

1. Backend service layer changes (remove constraint, add multi-doc functions, add delete)
2. Backend router changes (new endpoints, response schema changes)
3. Backend LLM changes (multi-doc prompt construction)
4. Backend message router changes (pass multi-doc to LLM)
5. Frontend types and API client updates
6. Frontend `useDocuments` hook
7. Frontend DocumentViewer with thumbnail strip
8. Frontend ChatInput and App wiring
9. End-to-end testing and coverage verification
