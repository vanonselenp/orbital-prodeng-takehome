**NOTE**: This is a document I would not normally put into a repo. This is here to show how I validated that the work was done correctly. 

# Staff Engineer Review: Multi-Document Conversations

## Summary

All 84 backend tests and 183 frontend tests pass. Backend has 100% line coverage. Frontend has 100% line/statement/function coverage (97.97% branch). The implementation is well-structured and touches the right layers. That said, there are several issues ranging from a potential security bug to design gaps versus the PRD.

---

## Critical Issues

### 1. Security: DELETE endpoint doesn't validate document belongs to conversation

`backend/src/takehome/web/routers/documents.py:120-126` -- The `delete_document_endpoint` accepts both `conversation_id` and `document_id` in the path, but `delete_document()` only looks up by `document_id`. A caller can delete any document by guessing its ID, regardless of which conversation they claim to own. The `conversation_id` is completely ignored.

```python
async def delete_document_endpoint(
    conversation_id: str,
    document_id: str,
    session: AsyncSession = Depends(get_session),
) -> None:
    deleted = await delete_document(session, document_id)
    # conversation_id is never checked
```

Fix: Either verify the document's `conversation_id` matches the path parameter, or query with both `document_id` AND `conversation_id` in `delete_document()`.

### 2. `_truncate_documents` has a fragile notice string duplication

`backend/src/takehome/services/llm.py:59-61` -- When `excess >= len(text) - notice_len`, the entire doc text is replaced with `"[Document truncated due to length]"` (35 chars). But the `total` subtraction uses `len("[Document truncated due to length]")` instead of the actual `truncation_notice` variable (which has a leading newline). The notice string is defined in two places -- once as `truncation_notice` with a leading newline, once as a bare string literal. If someone changes one and not the other, truncation math silently breaks.

---

## PRD Gaps

### 3. US-005 / FR-16: Truncation sums document text only, not full prompt

The PRD specifies 150,000 characters. The code uses `MAX_DOCUMENT_TEXT_LENGTH = 150000` correctly. However, the truncation function sums only document text lengths, not the full prompt (which includes XML tags, system prompt, conversation history). The PRD says "combined document text", so this is arguably correct, but worth flagging -- a conversation with long history could still exceed context limits.

### 4. US-008: `useDocuments` doesn't use the dedicated `fetchDocuments` endpoint

The PRD's US-007 specifies a `fetchDocuments(conversationId)` API function, and US-008 says `useDocuments` manages document state. The hook (`frontend/src/hooks/use-documents.ts:28`) fetches documents via `fetchConversation()` and reads `detail.documents`, rather than calling the dedicated `GET /api/conversations/{id}/documents` endpoint. The `fetchDocuments()` function exists in `frontend/src/lib/api.ts` but is never imported or used by any production code -- it's dead code. This works, but it means the dedicated list endpoint is untested in integration.

### 5. US-009 / FR-11: Page reset on document switch is untested

The PRD explicitly requires: "Page resets to 1 when switching between documents." The code has a `useEffect` for this in `frontend/src/components/DocumentViewer.tsx:66-72`, but it's entirely wrapped in a `/* v8 ignore start */` block with the comment "ref-based effect; changing selectedDocument id within same mount is not reachable in jsdom". This means:

- The behavior is untested
- The v8 ignore comment admits the code path isn't exercised
- If the effect has a bug, nothing catches it

This is a functional requirement (FR-11) that has zero test coverage.

### 6. US-009: Thumbnail strip uses plain div instead of Radix ScrollArea

The PRD's design considerations specifically mention using Radix `ScrollArea` from `components/ui/`. The implementation uses a plain `div` with `overflow-x-auto` instead. This is minor but diverges from the spec.

### 7. US-011: Tooltip always renders, not just conditionally

`frontend/src/components/ChatInput.tsx` tooltip now always renders content (`"Attach PDF document"` or `"Maximum documents reached"`). Previously the tooltip only showed when disabled. This is actually an improvement over the PRD spec, but worth noting the behavior change -- enabled buttons now show a tooltip on hover.

---

## Code Quality Issues

### 8. `useDocument` hook is now dead code

`frontend/src/hooks/use-document.ts` still exists and its tests are updated to work with the new API shape, but `App.tsx` imports `useDocuments` instead. The old `useDocument` hook is no longer imported by any production code. It should either be removed or intentionally kept for backward compatibility (which seems unlikely given this is a single-app repo).

### 9. Duplicated document-to-DocumentInfo mapping in conversations router

`backend/src/takehome/web/routers/conversations.py:112-120` and `:143-151` have identical list comprehensions mapping `Document` -> `DocumentInfo`. This should be extracted to a helper function.

### 10. Inconsistent v8 ignore usage in `useDocuments` hook

`frontend/src/hooks/use-documents.ts:82-84` -- The `if (!conversationId) return` guard in `remove()` is marked with `v8 ignore` as "defensive guard; UI never calls remove without a conversationId". The same pattern exists in `upload()` at line 60 where `if (!conversationId) return null` is NOT ignored -- and it IS tested. The inconsistency is minor but worth noting.

### 11. `handleFileChange` in DocumentViewer resets input value without test

`frontend/src/components/DocumentViewer.tsx:108` -- `e.target.value = ""` is good practice for re-selecting the same file, but this line has no test coverage for the re-selection scenario.

---

## Testing Observations

### 12. No evidence of red-green-refactor TDD

The AGENTS.md mandates red-green-refactor TDD. The commit is a single commit with all production code and tests together. There's no evidence of the red-green cycle (failing test first, minimal pass, refactor). This is an unverifiable process requirement from a single commit, but worth flagging given the repo conventions.

### 13. `test_upload_at_limit_returns_409` uploads 10 real PDFs

`backend/tests/test_api_documents.py:72-81` -- This test uploads 10 actual PDF files through the full upload path (file I/O, PyMuPDF extraction). It works, but it's slow compared to inserting DB records directly. The service-layer test does the same thing (`test_upload_document_at_limit_raises`). Consider using direct DB inserts for the router-level test.

---

## What's Done Well

- Clean separation of concerns: service layer, router, hook, component changes all follow the existing architecture
- `_truncate_documents` correctly handles the "truncate largest first" algorithm
- The delete confirmation dialog follows the exact PRD copy ("This cannot be undone. The AI's previous answers may have referenced this document.")
- System prompt updates for cross-document citations and filename references are correct
- `canUpload` derived state is properly threaded from hook through App to both ChatInput and DocumentViewer
- The `useDocuments` hook's auto-selection logic (select first on load, select next on delete, auto-select on upload) is well-tested with 20+ test cases

---

## Verdict

The implementation covers ~90% of the PRD requirements and the code quality is generally good. The **DELETE endpoint authorization bypass** is a must-fix before merge. The **untested page-reset behavior** (FR-11) and **dead `fetchDocuments` code** are secondary but should be addressed. The remaining items are polish.
