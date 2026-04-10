import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDocuments } from "./use-documents";

vi.mock("../lib/api", () => ({
	fetchConversation: vi.fn(),
	uploadDocument: vi.fn(),
	deleteDocument: vi.fn(),
}));

import * as api from "../lib/api";

const mockFetchConversation = vi.mocked(api.fetchConversation);
const mockUploadDocument = vi.mocked(api.uploadDocument);
const mockDeleteDocument = vi.mocked(api.deleteDocument);

const mockDoc1 = {
	id: "doc-1",
	conversation_id: "conv-1",
	filename: "first.pdf",
	page_count: 5,
	uploaded_at: "2024-01-01T00:00:00Z",
};

const mockDoc2 = {
	id: "doc-2",
	conversation_id: "conv-1",
	filename: "second.pdf",
	page_count: 3,
	uploaded_at: "2024-01-02T00:00:00Z",
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe("useDocuments", () => {
	it("initial fetch populates documents and selects first", async () => {
		mockFetchConversation.mockResolvedValue({
			id: "conv-1",
			title: "Test",
			created_at: "2024-01-01",
			updated_at: "2024-01-01",
			document_count: 2,
			documents: [mockDoc1, mockDoc2],
		});

		const { result } = renderHook(() => useDocuments("conv-1"));

		await waitFor(() => {
			expect(result.current.documents).toEqual([mockDoc1, mockDoc2]);
		});
		expect(result.current.selectedDocumentId).toBe("doc-1");
		expect(result.current.selectedDocument).toEqual(mockDoc1);
		expect(mockFetchConversation).toHaveBeenCalledWith("conv-1");
	});

	it("selectDocument updates selectedDocument", async () => {
		mockFetchConversation.mockResolvedValue({
			id: "conv-1",
			title: "Test",
			created_at: "2024-01-01",
			updated_at: "2024-01-01",
			document_count: 2,
			documents: [mockDoc1, mockDoc2],
		});

		const { result } = renderHook(() => useDocuments("conv-1"));

		await waitFor(() => {
			expect(result.current.documents).toHaveLength(2);
		});

		act(() => {
			result.current.selectDocument("doc-2");
		});

		expect(result.current.selectedDocumentId).toBe("doc-2");
		expect(result.current.selectedDocument).toEqual(mockDoc2);
	});

	it("upload appends and auto-selects new doc", async () => {
		mockFetchConversation.mockResolvedValue({
			id: "conv-1",
			title: "Test",
			created_at: "2024-01-01",
			updated_at: "2024-01-01",
			document_count: 1,
			documents: [mockDoc1],
		});
		mockUploadDocument.mockResolvedValue(mockDoc2);

		const { result } = renderHook(() => useDocuments("conv-1"));

		await waitFor(() => {
			expect(result.current.documents).toHaveLength(1);
		});

		const file = new File(["content"], "second.pdf", {
			type: "application/pdf",
		});

		await act(async () => {
			await result.current.upload(file);
		});

		expect(result.current.documents).toHaveLength(2);
		expect(result.current.documents[1]).toEqual(mockDoc2);
		expect(result.current.selectedDocumentId).toBe("doc-2");
		expect(result.current.uploading).toBe(false);
	});

	it("remove deletes and auto-selects next doc", async () => {
		mockFetchConversation.mockResolvedValue({
			id: "conv-1",
			title: "Test",
			created_at: "2024-01-01",
			updated_at: "2024-01-01",
			document_count: 2,
			documents: [mockDoc1, mockDoc2],
		});
		mockDeleteDocument.mockResolvedValue(undefined);

		const { result } = renderHook(() => useDocuments("conv-1"));

		await waitFor(() => {
			expect(result.current.documents).toHaveLength(2);
		});

		await act(async () => {
			await result.current.remove("doc-1");
		});

		expect(mockDeleteDocument).toHaveBeenCalledWith("conv-1", "doc-1");
		expect(result.current.documents).toHaveLength(1);
		expect(result.current.documents[0]).toEqual(mockDoc2);
		expect(result.current.selectedDocumentId).toBe("doc-2");
	});

	it("remove last doc results in null selection", async () => {
		mockFetchConversation.mockResolvedValue({
			id: "conv-1",
			title: "Test",
			created_at: "2024-01-01",
			updated_at: "2024-01-01",
			document_count: 1,
			documents: [mockDoc1],
		});
		mockDeleteDocument.mockResolvedValue(undefined);

		const { result } = renderHook(() => useDocuments("conv-1"));

		await waitFor(() => {
			expect(result.current.documents).toHaveLength(1);
		});

		await act(async () => {
			await result.current.remove("doc-1");
		});

		expect(result.current.documents).toHaveLength(0);
		expect(result.current.selectedDocumentId).toBeNull();
		expect(result.current.selectedDocument).toBeNull();
	});

	it("canUpload is false when documents.length >= 10", async () => {
		const tenDocs = Array.from({ length: 10 }, (_, i) => ({
			id: `doc-${i}`,
			conversation_id: "conv-1",
			filename: `file-${i}.pdf`,
			page_count: 1,
			uploaded_at: "2024-01-01T00:00:00Z",
		}));

		mockFetchConversation.mockResolvedValue({
			id: "conv-1",
			title: "Test",
			created_at: "2024-01-01",
			updated_at: "2024-01-01",
			document_count: 10,
			documents: tenDocs,
		});

		const { result } = renderHook(() => useDocuments("conv-1"));

		await waitFor(() => {
			expect(result.current.documents).toHaveLength(10);
		});

		expect(result.current.canUpload).toBe(false);
	});

	it("canUpload is true when documents.length < 10", async () => {
		mockFetchConversation.mockResolvedValue({
			id: "conv-1",
			title: "Test",
			created_at: "2024-01-01",
			updated_at: "2024-01-01",
			document_count: 1,
			documents: [mockDoc1],
		});

		const { result } = renderHook(() => useDocuments("conv-1"));

		await waitFor(() => {
			expect(result.current.documents).toHaveLength(1);
		});

		expect(result.current.canUpload).toBe(true);
	});

	it("upload error sets error state", async () => {
		mockFetchConversation.mockResolvedValue({
			id: "conv-1",
			title: "Test",
			created_at: "2024-01-01",
			updated_at: "2024-01-01",
			document_count: 0,
			documents: [],
		});
		mockUploadDocument.mockRejectedValue(new Error("Upload failed"));

		const { result } = renderHook(() => useDocuments("conv-1"));

		await waitFor(() => {
			expect(mockFetchConversation).toHaveBeenCalled();
		});

		const file = new File(["content"], "test.pdf", {
			type: "application/pdf",
		});

		await act(async () => {
			await result.current.upload(file);
		});

		expect(result.current.error).toBe("Upload failed");
		expect(result.current.uploading).toBe(false);
	});

	it("remove error sets error state", async () => {
		mockFetchConversation.mockResolvedValue({
			id: "conv-1",
			title: "Test",
			created_at: "2024-01-01",
			updated_at: "2024-01-01",
			document_count: 1,
			documents: [mockDoc1],
		});
		mockDeleteDocument.mockRejectedValue(new Error("Delete failed"));

		const { result } = renderHook(() => useDocuments("conv-1"));

		await waitFor(() => {
			expect(result.current.documents).toHaveLength(1);
		});

		await act(async () => {
			await result.current.remove("doc-1");
		});

		expect(result.current.error).toBe("Delete failed");
		// Documents should not have been removed on error
		expect(result.current.documents).toHaveLength(1);
	});

	it("clears documents and selection when conversationId is null", async () => {
		const { result } = renderHook(() => useDocuments(null));

		await waitFor(() => {
			expect(result.current.documents).toEqual([]);
		});

		expect(result.current.selectedDocumentId).toBeNull();
		expect(result.current.selectedDocument).toBeNull();
		expect(mockFetchConversation).not.toHaveBeenCalled();
	});

	it("resets and refreshes on conversationId change", async () => {
		mockFetchConversation.mockResolvedValue({
			id: "conv-1",
			title: "Test",
			created_at: "2024-01-01",
			updated_at: "2024-01-01",
			document_count: 1,
			documents: [mockDoc1],
		});

		const { result, rerender } = renderHook(
			({ id }: { id: string | null }) => useDocuments(id),
			{ initialProps: { id: "conv-1" } },
		);

		await waitFor(() => {
			expect(result.current.documents).toHaveLength(1);
		});

		mockFetchConversation.mockResolvedValue({
			id: "conv-2",
			title: "Test 2",
			created_at: "2024-01-01",
			updated_at: "2024-01-01",
			document_count: 1,
			documents: [mockDoc2],
		});

		rerender({ id: "conv-2" });

		await waitFor(() => {
			expect(result.current.documents).toEqual([mockDoc2]);
		});

		expect(result.current.selectedDocumentId).toBe("doc-2");
	});

	it("upload returns null when conversationId is null", async () => {
		const { result } = renderHook(() => useDocuments(null));

		const file = new File(["content"], "test.pdf", {
			type: "application/pdf",
		});

		let doc: unknown;
		await act(async () => {
			doc = await result.current.upload(file);
		});

		expect(doc).toBeNull();
	});

	it("sets generic error on upload with non-Error throw", async () => {
		mockFetchConversation.mockResolvedValue({
			id: "conv-1",
			title: "Test",
			created_at: "2024-01-01",
			updated_at: "2024-01-01",
			document_count: 0,
			documents: [],
		});
		mockUploadDocument.mockRejectedValue("bad");

		const { result } = renderHook(() => useDocuments("conv-1"));

		await waitFor(() => {
			expect(mockFetchConversation).toHaveBeenCalled();
		});

		const file = new File(["content"], "test.pdf", {
			type: "application/pdf",
		});

		await act(async () => {
			await result.current.upload(file);
		});

		expect(result.current.error).toBe("Failed to upload document");
	});

	it("sets generic error on remove with non-Error throw", async () => {
		mockFetchConversation.mockResolvedValue({
			id: "conv-1",
			title: "Test",
			created_at: "2024-01-01",
			updated_at: "2024-01-01",
			document_count: 1,
			documents: [mockDoc1],
		});
		mockDeleteDocument.mockRejectedValue("bad");

		const { result } = renderHook(() => useDocuments("conv-1"));

		await waitFor(() => {
			expect(result.current.documents).toHaveLength(1);
		});

		await act(async () => {
			await result.current.remove("doc-1");
		});

		expect(result.current.error).toBe("Failed to delete document");
	});

	it("sets error on refresh failure", async () => {
		mockFetchConversation.mockRejectedValue(new Error("Fetch failed"));

		const { result } = renderHook(() => useDocuments("conv-1"));

		await waitFor(() => {
			expect(result.current.error).toBe("Fetch failed");
		});
	});

	it("sets generic error on refresh failure with non-Error", async () => {
		mockFetchConversation.mockRejectedValue("bad");

		const { result } = renderHook(() => useDocuments("conv-1"));

		await waitFor(() => {
			expect(result.current.error).toBe("Failed to load documents");
		});
	});

	it("removing a non-selected doc keeps current selection", async () => {
		mockFetchConversation.mockResolvedValue({
			id: "conv-1",
			title: "Test",
			created_at: "2024-01-01",
			updated_at: "2024-01-01",
			document_count: 2,
			documents: [mockDoc1, mockDoc2],
		});
		mockDeleteDocument.mockResolvedValue(undefined);

		const { result } = renderHook(() => useDocuments("conv-1"));

		await waitFor(() => {
			expect(result.current.documents).toHaveLength(2);
		});

		// Select doc-2
		act(() => {
			result.current.selectDocument("doc-2");
		});

		expect(result.current.selectedDocumentId).toBe("doc-2");

		// Remove doc-1 (not selected)
		await act(async () => {
			await result.current.remove("doc-1");
		});

		// Selection should remain on doc-2
		expect(result.current.selectedDocumentId).toBe("doc-2");
		expect(result.current.documents).toHaveLength(1);
		expect(result.current.documents[0]).toEqual(mockDoc2);
	});

	it("preserves selectedDocumentId on refresh if still in list", async () => {
		mockFetchConversation.mockResolvedValue({
			id: "conv-1",
			title: "Test",
			created_at: "2024-01-01",
			updated_at: "2024-01-01",
			document_count: 2,
			documents: [mockDoc1, mockDoc2],
		});

		const { result } = renderHook(() => useDocuments("conv-1"));

		await waitFor(() => {
			expect(result.current.documents).toHaveLength(2);
		});

		// Select doc-2
		act(() => {
			result.current.selectDocument("doc-2");
		});

		expect(result.current.selectedDocumentId).toBe("doc-2");

		// Refresh (doc-2 still in list)
		await act(async () => {
			await result.current.refresh();
		});

		expect(result.current.selectedDocumentId).toBe("doc-2");
	});
});
