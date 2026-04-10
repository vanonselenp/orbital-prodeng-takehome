# PRD: Multi-Document Conversations

## Introduction

Commercial real estate lawyers frequently need to review multiple related documents during due diligence -- leases, addenda, amendments, title reports, surveys, and more. Currently, the application restricts each conversation to a single document, forcing lawyers to start separate chats for each file and mentally cross-reference across conversations.

This feature lifts that restriction, allowing up to 10 documents per conversation. Users can upload documents at any point, view any uploaded document in the reader panel, and ask questions that the AI answers by considering all loaded documents simultaneously -- citing specific filenames and page numbers, and explicitly noting when information spans multiple documents.

## Goals

- Allow users to upload up to 10 PDF documents per conversation
- Enable uploading at any point during a conversation (before or mid-chat) from both the chat input paperclip and the document panel
- Provide a document switcher (thumbnail strip) in the right panel so users can view any uploaded document
- Allow deletion of individual documents with confirmation
- Update the AI to consider all uploaded documents when answering, always citing document filenames and page numbers
- Have the AI explicitly highlight cross-document observations (e.g., conflicting clauses, related provisions across documents)
- Maintain or improve response quality compared to single-document mode
- Track user engagement with multi-document features (upload counts, document switches)

## User Stories

### US-001: Remove single-document constraint (Backend Service)
**Description:** As a developer, I need the backend to accept multiple document uploads per conversation so that the one-document limit is lifted.

**Acceptance Criteria:**
- [ ] The `upload_document()` service function no longer rejects uploads when a document already exists
- [ ] A new `MAX_DOCUMENTS_PER_CONVERSATION = 10` constant is enforced; uploads beyond 10 return a descriptive `ValueError`
- [ ] Existing `get_document_for_conversation()` still works for backward compatibility
- [ ] New `get_documents_for_conversation()` returns all documents ordered by `uploaded_at`
- [ ] Typecheck/lint passes
- [ ] All existing tests updated; new tests for multi-upload and limit enforcement

### US-002: Add document deletion (Backend Service)
**Description:** As a developer, I need a service function to delete a document so users can remove documents from a conversation.

**Acceptance Criteria:**
- [ ] New `delete_document(session, document_id)` function removes the DB record and the file from disk
- [ ] Returns `True` if the document existed and was deleted, `False` if not found
- [ ] Deleting a non-existent document ID does not raise an error
- [ ] Typecheck/lint passes
- [ ] Tests cover success, not-found, and file-already-missing-on-disk edge cases

### US-003: Update conversation API responses for multi-document (Backend Router)
**Description:** As a frontend developer, I need the conversation API to return document arrays instead of a single document so the UI can display all uploaded documents.

**Acceptance Criteria:**
- [ ] `GET /api/conversations` returns `document_count: int` instead of `has_document: bool` for each conversation
- [ ] `GET /api/conversations/{id}` returns `documents: DocumentInfo[]` instead of `document: DocumentInfo | null`
- [ ] Typecheck/lint passes
- [ ] Tests verify the new response shapes

### US-004: Add document list and delete endpoints (Backend Router)
**Description:** As a frontend developer, I need endpoints to list all documents for a conversation and delete individual documents.

**Acceptance Criteria:**
- [ ] `GET /api/conversations/{conversation_id}/documents` returns a list of all documents for the conversation
- [ ] `DELETE /api/conversations/{conversation_id}/documents/{document_id}` deletes the document and returns 204
- [ ] DELETE on a non-existent document returns 404
- [ ] Upload endpoint returns 409 when the 10-document limit is reached (instead of old "already has a document" 409)
- [ ] Upload endpoint still returns 201 for second, third, etc. documents (no longer 409)
- [ ] Typecheck/lint passes
- [ ] Tests cover all new endpoints and updated upload behavior

### US-005: Update LLM to handle multiple documents (Backend Service)
**Description:** As a user, I want the AI to consider all my uploaded documents when answering questions so I can get cross-document insights.

**Acceptance Criteria:**
- [ ] `chat_with_document()` is renamed to `chat_with_documents()` accepting `documents: list[tuple[str, str]]` (filename, text pairs)
- [ ] Each document is wrapped in `<document filename="...">` XML tags in the prompt
- [ ] System prompt instructs the AI to always cite document filenames alongside page numbers
- [ ] System prompt instructs the AI to note cross-document observations (e.g., "The indemnification clause in lease.pdf conflicts with Section 4 of addendum.pdf")
- [ ] If combined document text exceeds 150,000 characters, the largest documents are truncated from the end with a `[Document truncated due to length]` note
- [ ] When no documents are uploaded, the AI tells the user to upload a document (same as current behavior)
- [ ] Typecheck/lint passes
- [ ] Tests verify multi-document prompt construction, truncation logic, and no-documents fallback

### US-006: Update message streaming to pass all documents (Backend Router)
**Description:** As a developer, I need the message endpoint to load all documents and pass them to the LLM so that responses consider the full document set.

**Acceptance Criteria:**
- [ ] `send_message()` calls `get_documents_for_conversation()` to load all documents
- [ ] Collects `(filename, extracted_text)` pairs for each document
- [ ] Passes the list to `chat_with_documents()` instead of a single text string
- [ ] Typecheck/lint passes
- [ ] Tests verify multiple documents are passed through to the LLM service

### US-007: Update frontend types and API client
**Description:** As a frontend developer, I need updated TypeScript types and API functions to work with the new multi-document backend responses.

**Acceptance Criteria:**
- [ ] `Conversation.has_document` replaced with `document_count: number` in types
- [ ] `ConversationDetail.document?` replaced with `documents: Document[]` in types
- [ ] New `fetchDocuments(conversationId)` API function added
- [ ] New `deleteDocument(conversationId, documentId)` API function added
- [ ] Typecheck/lint passes
- [ ] Tests cover new API functions (correct URL, method, error handling)

### US-008: Create useDocuments hook (Frontend Hook)
**Description:** As a user, I need the app to track multiple documents per conversation with selection state so I can switch between documents in the viewer.

**Acceptance Criteria:**
- [ ] New `useDocuments(conversationId)` hook replaces `useDocument`
- [ ] Manages `documents: Document[]`, `selectedDocumentId`, `uploading`, `error` state
- [ ] Exposes `selectedDocument` (derived), `canUpload` (true when < 10 docs)
- [ ] `selectDocument(id)` updates selection
- [ ] `upload(file)` appends new document and auto-selects it
- [ ] `remove(id)` deletes document, removes from array, auto-selects the next available doc (or null)
- [ ] On conversation change: refreshes documents, auto-selects first document
- [ ] Typecheck/lint passes
- [ ] Tests cover all state transitions, auto-selection logic, error paths

### US-009: Add document thumbnail strip to DocumentViewer (Frontend Component)
**Description:** As a user, I want to see all uploaded documents as clickable cards at the top of the reader panel so I can switch between them.

**Acceptance Criteria:**
- [ ] Horizontal strip of document cards at the top of the right panel
- [ ] Each card shows a PDF icon and truncated filename (max ~15 characters with ellipsis)
- [ ] Selected card has a highlighted border/ring
- [ ] Each card has a small X (delete) button
- [ ] Clicking a card switches the PDF viewer to that document
- [ ] A `+` button at the end of the strip opens a file picker for uploading additional documents
- [ ] The `+` button is disabled with tooltip "Maximum documents reached" when at 10 documents
- [ ] Strip scrolls horizontally when documents overflow the available width
- [ ] When no documents exist, the existing empty state ("No document uploaded") is shown
- [ ] Page resets to 1 when switching between documents
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-010: Add delete confirmation dialog (Frontend Component)
**Description:** As a user, I want a confirmation dialog before deleting a document so I don't accidentally remove documents the AI has already referenced.

**Acceptance Criteria:**
- [ ] Clicking the X button on a document card opens a Radix Dialog
- [ ] Dialog shows "Delete {filename}?" with explanatory text "This cannot be undone. The AI's previous answers may have referenced this document."
- [ ] Dialog has "Cancel" and "Delete" buttons
- [ ] Confirming calls `onDeleteDocument(id)` and closes the dialog
- [ ] Canceling closes the dialog without action
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-011: Update ChatInput for multi-document upload (Frontend Component)
**Description:** As a user, I want the paperclip upload button to remain active after the first upload so I can add more documents mid-conversation.

**Acceptance Criteria:**
- [ ] Paperclip button is always enabled (no more "Document already uploaded" disabled state)
- [ ] Paperclip button is disabled only when the 10-document limit is reached
- [ ] Tooltip shows "Maximum documents reached" when disabled at limit
- [ ] Tooltip shows "Attach PDF document" (or similar) when enabled
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-012: Wire multi-document state through App.tsx (Frontend Integration)
**Description:** As a developer, I need to connect the new `useDocuments` hook and updated component props throughout the application.

**Acceptance Criteria:**
- [ ] `App.tsx` uses `useDocuments(selectedId)` instead of `useDocument(selectedId)`
- [ ] `DocumentViewer` receives `documents`, `selectedDocument`, `onSelectDocument`, `onDeleteDocument`, `onUpload`, `canUpload`
- [ ] `ChatInput` receives `canUpload` instead of `hasDocument`
- [ ] `ChatSidebar` displays `document_count` instead of `has_document` indicator
- [ ] `ChatWindow`/`EmptyState` uses `documents.length === 0` for empty state logic
- [ ] Upload from either ChatInput or DocumentViewer `+` button works end-to-end
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: The system must allow up to 10 PDF documents per conversation
- FR-2: The system must allow document uploads at any point during a conversation (before or after messages)
- FR-3: Documents can be uploaded from the chat input paperclip button or the `+` button in the document panel
- FR-4: The document panel must display a horizontal strip of document cards showing PDF icon and truncated filename
- FR-5: Clicking a document card must switch the PDF viewer to display that document
- FR-6: The selected document card must have a visually distinct highlighted state (border/ring)
- FR-7: Each document card must have a delete (X) button that triggers a confirmation dialog
- FR-8: The confirmation dialog must warn that deletion cannot be undone and previous AI answers may reference the document
- FR-9: When a new document is uploaded, the viewer must automatically switch to display it
- FR-10: When the currently viewed document is deleted, the viewer must auto-select the next available document or show the empty state
- FR-11: The page number must reset to 1 when switching between documents
- FR-12: The upload button must be disabled with explanatory tooltip when the 10-document limit is reached
- FR-13: The AI must consider all uploaded documents when answering questions
- FR-14: The AI must cite document filenames alongside page numbers in every reference (e.g., "In lease-agreement.pdf, page 3...")
- FR-15: The AI must explicitly note observations that span multiple documents (e.g., conflicts, related clauses)
- FR-16: If combined document text exceeds 150,000 characters, the largest documents must be truncated with a clear `[Document truncated due to length]` note
- FR-17: The conversation list sidebar must show `document_count` instead of a boolean document indicator
- FR-18: Previously uploaded documents must persist when new ones are added
- FR-19: The `GET /api/conversations/{id}` endpoint must return a `documents` array
- FR-20: The `GET /api/conversations` endpoint must return `document_count` per conversation
- FR-21: A `DELETE /api/conversations/{cid}/documents/{did}` endpoint must exist and return 204 on success, 404 if not found

## Non-Goals (Out of Scope)

- **Side-by-side document comparison view** -- viewing two documents simultaneously is not included in v1
- **Document annotations or highlights** -- no ability to mark up or annotate documents
- **Document versioning** -- uploading a new version of the same document is treated as a new upload, not a version
- **Drag-to-reorder documents** -- documents are ordered by upload time, not user-defined order
- **Document search or filter within the panel** -- no search bar to filter the document list
- **Non-PDF file types** -- only PDFs are supported (same as current)
- **Smart/selective document context for AI** -- all documents are sent to the AI every time; no embedding-based retrieval or selective context
- **@filename mention syntax in chat** -- the AI always considers all documents; no syntax to focus on a specific one

## Design Considerations

- **Thumbnail strip**: Horizontal row of small cards (PDF icon + truncated filename), selected card has `ring-2 ring-primary` highlight, horizontally scrollable with `overflow-x-auto`
- **Delete confirmation**: Use existing Radix `Dialog` component (already in `components/ui/dialog.tsx`)
- **Existing components to reuse**: `Button`, `Tooltip`, `Dialog`, `ScrollArea` from `components/ui/`
- **Resize handle**: Keep the existing panel resize functionality (280-700px range)
- **Layout unchanged**: Three-panel layout stays the same; only the right panel's internal structure changes

## Technical Considerations

- **No database migration needed**: The `documents` table already has a non-unique FK to `conversations.id`, supporting multiple rows per conversation
- **Optional index**: Consider adding an index on `documents.conversation_id` for query performance with many documents
- **Breaking API change**: `document` -> `documents` and `has_document` -> `document_count` are breaking changes, but frontend and backend deploy together in Docker with no external consumers
- **LLM context window**: Claude Haiku's context window is the limiting factor. The 150k character truncation threshold (~37k tokens) plus conversation history must fit within the model's context window
- **File storage**: With 10 docs at 25MB max each, a single conversation could use up to 250MB of disk space. This is acceptable for the target user base
- **Document text extraction**: PyMuPDF extracts text per page with `--- Page N ---` delimiters; this format is preserved within each `<document>` XML block
- **SSE streaming**: No changes needed to the streaming mechanism itself; only the data passed to the LLM changes
- **Test infrastructure**: Backend tests use SQLite in-memory (not PostgreSQL); frontend tests mock `react-pdf` and use jsdom

## Success Metrics

- Users can upload, view, and switch between multiple documents without errors
- AI responses accurately cite the correct document filename and page number for each reference
- AI explicitly identifies and calls out cross-document observations in at least 80% of relevant queries
- No degradation in single-document response quality (measured by source citation accuracy)
- Average multi-document conversations contain 2+ documents (indicating the feature is used)
- Upload-to-first-question latency is under 3 seconds for the second and subsequent documents
- Zero increase in error rate for the chat endpoint when multiple documents are loaded

## Open Questions

- Should there be a visual indicator in the chat messages showing which documents were available when a message was sent? (Useful if a user uploads a new doc and wonders if earlier AI responses considered it)
- Should the AI proactively summarize newly uploaded documents when they're added mid-conversation? (e.g., "I see you've uploaded addendum.pdf. It contains 5 pages covering...")
- What is the optimal character truncation threshold? 150k is a starting point, but may need tuning based on observed prompt sizes and Claude Haiku's actual context limits
- Should the document thumbnail strip also be visible as a collapsed indicator when the right panel is at minimum width?
