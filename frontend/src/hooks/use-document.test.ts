import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDocument } from "./use-document";

vi.mock("../lib/api", () => ({
	fetchConversation: vi.fn(),
	uploadDocument: vi.fn(),
}));

import * as api from "../lib/api";

const mockFetchConversation = vi.mocked(api.fetchConversation);
const mockUploadDocument = vi.mocked(api.uploadDocument);

const mockDocument = {
	id: "doc-1",
	conversation_id: "conv-1",
	filename: "test.pdf",
	page_count: 5,
	uploaded_at: "2024-01-01T00:00:00Z",
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe("useDocument", () => {
	it("sets document to null when conversationId is null", async () => {
		const { result } = renderHook(() => useDocument(null));
		await waitFor(() => {
			expect(result.current.document).toBeNull();
		});
		expect(mockFetchConversation).not.toHaveBeenCalled();
	});

	it("loads document on mount when conversationId is provided", async () => {
		mockFetchConversation.mockResolvedValue({
			id: "conv-1",
			title: "Test",
			created_at: "2024-01-01",
			updated_at: "2024-01-01",
			document_count: 1,
			documents: [mockDocument],
		});

		const { result } = renderHook(() => useDocument("conv-1"));

		await waitFor(() => {
			expect(result.current.document).toEqual(mockDocument);
		});
		expect(mockFetchConversation).toHaveBeenCalledWith("conv-1");
	});

	it("sets document to null when conversation has no document", async () => {
		mockFetchConversation.mockResolvedValue({
			id: "conv-1",
			title: "Test",
			created_at: "2024-01-01",
			updated_at: "2024-01-01",
			document_count: 0,
			documents: [],
		});

		const { result } = renderHook(() => useDocument("conv-1"));

		await waitFor(() => {
			expect(mockFetchConversation).toHaveBeenCalled();
		});
		expect(result.current.document).toBeNull();
	});

	it("sets error on fetch failure", async () => {
		mockFetchConversation.mockRejectedValue(new Error("Network error"));

		const { result } = renderHook(() => useDocument("conv-1"));

		await waitFor(() => {
			expect(result.current.error).toBe("Network error");
		});
	});

	it("sets generic error for non-Error throws", async () => {
		mockFetchConversation.mockRejectedValue("something went wrong");

		const { result } = renderHook(() => useDocument("conv-1"));

		await waitFor(() => {
			expect(result.current.error).toBe("Failed to load document");
		});
	});

	it("uploads a document successfully", async () => {
		mockFetchConversation.mockResolvedValue({
			id: "conv-1",
			title: "Test",
			created_at: "2024-01-01",
			updated_at: "2024-01-01",
			document_count: 0,
			documents: [],
		});
		mockUploadDocument.mockResolvedValue(mockDocument);

		const { result } = renderHook(() => useDocument("conv-1"));
		await waitFor(() => {
			expect(mockFetchConversation).toHaveBeenCalled();
		});

		const file = new File(["content"], "test.pdf", {
			type: "application/pdf",
		});

		let doc: typeof mockDocument | null = null;
		await act(async () => {
			doc = await result.current.upload(file);
		});

		expect(doc).toEqual(mockDocument);
		expect(result.current.document).toEqual(mockDocument);
		expect(result.current.uploading).toBe(false);
	});

	it("returns null from upload when conversationId is null", async () => {
		const { result } = renderHook(() => useDocument(null));

		const file = new File(["content"], "test.pdf", {
			type: "application/pdf",
		});

		let doc: unknown;
		await act(async () => {
			doc = await result.current.upload(file);
		});

		expect(doc).toBeNull();
	});

	it("sets error on upload failure", async () => {
		mockFetchConversation.mockResolvedValue({
			id: "conv-1",
			title: "Test",
			created_at: "2024-01-01",
			updated_at: "2024-01-01",
			document_count: 0,
			documents: [],
		});
		mockUploadDocument.mockRejectedValue(new Error("Upload failed"));

		const { result } = renderHook(() => useDocument("conv-1"));
		await waitFor(() => {
			expect(mockFetchConversation).toHaveBeenCalled();
		});

		const file = new File(["content"], "test.pdf", {
			type: "application/pdf",
		});

		let doc: unknown;
		await act(async () => {
			doc = await result.current.upload(file);
		});

		expect(doc).toBeNull();
		expect(result.current.error).toBe("Upload failed");
		expect(result.current.uploading).toBe(false);
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

		const { result } = renderHook(() => useDocument("conv-1"));
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

	it("refreshes document data", async () => {
		mockFetchConversation.mockResolvedValue({
			id: "conv-1",
			title: "Test",
			created_at: "2024-01-01",
			updated_at: "2024-01-01",
			document_count: 0,
			documents: [],
		});

		const { result } = renderHook(() => useDocument("conv-1"));
		await waitFor(() => {
			expect(mockFetchConversation).toHaveBeenCalledTimes(1);
		});

		mockFetchConversation.mockResolvedValue({
			id: "conv-1",
			title: "Test",
			created_at: "2024-01-01",
			updated_at: "2024-01-01",
			document_count: 1,
			documents: [mockDocument],
		});

		await act(async () => {
			await result.current.refresh();
		});

		expect(result.current.document).toEqual(mockDocument);
	});
});
