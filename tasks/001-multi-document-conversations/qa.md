**NOTE**: This is a document I would not normally put into a repo. This is here to show how I validated that the work was done correctly. 

# QA: Multi-Document Conversations

## Prerequisites

- Run `just dev` and wait for all containers to be healthy
- Frontend at `http://localhost:5173`
- Valid `ANTHROPIC_API_KEY` in `.env` for AI chat steps
- Sample PDFs in `sample-docs/`:
  - `title-report-lot-7.pdf`
  - `commercial-lease-100-bishopsgate.pdf`
  - `environmental-assessment-manchester.pdf`

---

## Multi-upload (FR-1, FR-2, FR-3, FR-18)

- [ ] Create a new conversation
- [ ] Upload `title-report-lot-7.pdf` via the **paperclip** button in the chat input
- [ ] Verify the document appears in the viewer and in the thumbnail strip
- [ ] Upload `commercial-lease-100-bishopsgate.pdf` via the **+ button** in the document panel
- [ ] Verify both documents appear as cards in the thumbnail strip
- [ ] Upload `environmental-assessment-manchester.pdf` via the **paperclip** again
- [ ] Verify all three are visible — the first two should still be there (FR-18)

## Document switching (FR-4, FR-5, FR-6, FR-11)

- [ ] Click the first document card — PDF viewer should show that document
- [ ] Click a different card — viewer should switch, and **page should reset to 1** (FR-11)
- [ ] Verify the selected card has a highlighted border/ring (FR-6)
- [ ] Verify filenames are truncated with ellipsis if longer than ~15 characters (FR-4)

## Document deletion (FR-7, FR-8, FR-9, FR-10)

- [ ] Click the **X** on a document card — a confirmation dialog should appear
- [ ] Verify it says "Delete {filename}?" with a warning about AI references (FR-8)
- [ ] Click **Cancel** — dialog closes, document remains
- [ ] Click **X** again, then click **Delete** — document should be removed
- [ ] If you deleted the currently-selected document, the viewer should auto-select the next one (FR-10)
- [ ] Delete all documents — viewer should show the empty state ("No document uploaded")

## Upload limit (FR-1, FR-12)

- [ ] Upload documents until you reach 10 total (reuse the same PDF if needed)
- [ ] Verify the **+** button and **paperclip** are both disabled
- [ ] Verify tooltip says "Maximum documents reached" on hover
- [ ] Delete one document, verify the buttons re-enable

## Sidebar (FR-17, FR-20)

- [ ] Check the conversation list sidebar — it should show a document count badge (e.g., "3")
- [ ] Upload another document — badge count should increment
- [ ] Delete a document — badge count should decrement
- [ ] Conversation with 0 documents should show no badge

## AI multi-document behavior (FR-13, FR-14, FR-15)

- [ ] With 2+ documents uploaded, ask: "What are the key differences between these documents?"
- [ ] Verify the AI **cites filenames** alongside page numbers (e.g., "In commercial-lease-100-bishopsgate.pdf, page 3...") (FR-14)
- [ ] Verify the AI **notes cross-document observations** — conflicts, related clauses, complementary info (FR-15)
- [ ] Ask a question about a specific document to verify it references the right file

## No-document fallback

- [ ] Create a new conversation with no documents
- [ ] Ask a question — the AI should tell you to upload a document first

## Auto-select on upload (FR-9)

- [ ] Upload a document while viewing a different one — viewer should switch to the newly uploaded document

## API spot-checks (optional)

```sh
# List conversations — check document_count field (FR-20)
curl -s http://localhost:8000/api/conversations | python3 -m json.tool

# Get single conversation — check documents array (FR-19)
curl -s http://localhost:8000/api/conversations/{id} | python3 -m json.tool

# List documents for a conversation
curl -s http://localhost:8000/api/conversations/{id}/documents | python3 -m json.tool

# Delete a document — should return 204 (FR-21)
curl -X DELETE -w "%{http_code}" http://localhost:8000/api/conversations/{cid}/documents/{did}

# Delete non-existent — should return 404 (FR-21)
curl -X DELETE -w "%{http_code}" http://localhost:8000/api/conversations/{cid}/documents/fake-id

# Upload at limit — should return 409
# (upload 10 docs first, then attempt an 11th)
```
