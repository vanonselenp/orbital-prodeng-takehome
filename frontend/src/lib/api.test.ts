import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createConversation,
	deleteConversation,
	fetchConversation,
	fetchConversations,
	fetchMessages,
	getDocumentUrl,
	sendMessage,
	uploadDocument,
} from "./api";

const mockFetch = vi.fn();

beforeEach(() => {
	vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
	vi.restoreAllMocks();
});

function okJson(data: unknown) {
	return new Response(JSON.stringify(data), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}

describe("fetchConversations", () => {
	it("calls GET /api/conversations", async () => {
		mockFetch.mockResolvedValue(okJson([]));
		const result = await fetchConversations();
		expect(result).toEqual([]);
		expect(mockFetch).toHaveBeenCalledWith("/api/conversations");
	});

	it("throws on error response", async () => {
		mockFetch.mockResolvedValue(
			new Response("Not Found", { status: 404 }),
		);
		await expect(fetchConversations()).rejects.toThrow("API error 404");
	});
});

describe("createConversation", () => {
	it("calls POST /api/conversations", async () => {
		const conv = { id: "abc", title: "New conversation" };
		mockFetch.mockResolvedValue(okJson(conv));
		const result = await createConversation();
		expect(result).toEqual(conv);
		expect(mockFetch).toHaveBeenCalledWith("/api/conversations", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title: "New conversation" }),
		});
	});
});

describe("deleteConversation", () => {
	it("calls DELETE with correct URL", async () => {
		mockFetch.mockResolvedValue(new Response(null, { status: 204 }));
		await deleteConversation("test-id");
		expect(mockFetch).toHaveBeenCalledWith("/api/conversations/test-id", {
			method: "DELETE",
		});
	});

	it("throws on error", async () => {
		mockFetch.mockResolvedValue(
			new Response("Not found", { status: 404 }),
		);
		await expect(deleteConversation("bad")).rejects.toThrow(
			"API error 404",
		);
	});
});

describe("fetchConversation", () => {
	it("calls GET with correct URL", async () => {
		const detail = { id: "abc", title: "Test" };
		mockFetch.mockResolvedValue(okJson(detail));
		const result = await fetchConversation("abc");
		expect(result).toEqual(detail);
		expect(mockFetch).toHaveBeenCalledWith("/api/conversations/abc");
	});
});

describe("fetchMessages", () => {
	it("calls GET with correct URL", async () => {
		mockFetch.mockResolvedValue(okJson([]));
		await fetchMessages("conv-1");
		expect(mockFetch).toHaveBeenCalledWith(
			"/api/conversations/conv-1/messages",
		);
	});
});

describe("sendMessage", () => {
	it("calls POST with content body", async () => {
		mockFetch.mockResolvedValue(new Response("ok", { status: 200 }));
		await sendMessage("conv-1", "hello");
		expect(mockFetch).toHaveBeenCalledWith(
			"/api/conversations/conv-1/messages",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ content: "hello" }),
			},
		);
	});

	it("throws on error", async () => {
		mockFetch.mockResolvedValue(
			new Response("Server error", { status: 500 }),
		);
		await expect(sendMessage("conv-1", "hi")).rejects.toThrow(
			"API error 500",
		);
	});
});

describe("uploadDocument", () => {
	it("calls POST with FormData", async () => {
		const doc = { id: "doc-1", filename: "test.pdf" };
		mockFetch.mockResolvedValue(okJson(doc));
		const file = new File(["content"], "test.pdf", {
			type: "application/pdf",
		});
		const result = await uploadDocument("conv-1", file);
		expect(result).toEqual(doc);

		const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
		const [url, opts] = lastCall;
		expect(url).toBe("/api/conversations/conv-1/documents");
		expect(opts.method).toBe("POST");
		expect(opts.body).toBeInstanceOf(FormData);
	});
});

describe("getDocumentUrl", () => {
	it("returns correct URL", () => {
		expect(getDocumentUrl("doc-1")).toBe("/api/documents/doc-1/content");
	});
});
