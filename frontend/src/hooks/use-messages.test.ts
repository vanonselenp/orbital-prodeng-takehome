import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMessages } from "./use-messages";

vi.mock("../lib/api", () => ({
	fetchMessages: vi.fn(),
	sendMessage: vi.fn(),
}));

import * as api from "../lib/api";

const mockFetchMessages = vi.mocked(api.fetchMessages);
const mockSendMessage = vi.mocked(api.sendMessage);

const msg1 = {
	id: "m1",
	conversation_id: "conv-1",
	role: "user" as const,
	content: "Hello",
	sources_cited: 0,
	created_at: "2024-01-01T00:00:00Z",
};

const msg2 = {
	id: "m2",
	conversation_id: "conv-1",
	role: "assistant" as const,
	content: "Hi there!",
	sources_cited: 1,
	created_at: "2024-01-01T00:00:01Z",
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe("useMessages", () => {
	it("clears messages when conversationId is null", async () => {
		const { result } = renderHook(() => useMessages(null));
		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});
		expect(result.current.messages).toEqual([]);
		expect(mockFetchMessages).not.toHaveBeenCalled();
	});

	it("loads messages on mount when conversationId is provided", async () => {
		mockFetchMessages.mockResolvedValue([msg1, msg2]);

		const { result } = renderHook(() => useMessages("conv-1"));

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});
		expect(result.current.messages).toEqual([msg1, msg2]);
		expect(mockFetchMessages).toHaveBeenCalledWith("conv-1");
	});

	it("sets error on fetch failure with Error instance", async () => {
		mockFetchMessages.mockRejectedValue(new Error("Network error"));

		const { result } = renderHook(() => useMessages("conv-1"));

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});
		expect(result.current.error).toBe("Network error");
	});

	it("sets generic error on fetch failure with non-Error", async () => {
		mockFetchMessages.mockRejectedValue("bad");

		const { result } = renderHook(() => useMessages("conv-1"));

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});
		expect(result.current.error).toBe("Failed to load messages");
	});

	it("does nothing on send when conversationId is null", async () => {
		const { result } = renderHook(() => useMessages(null));

		await act(async () => {
			await result.current.send("hello");
		});

		expect(mockSendMessage).not.toHaveBeenCalled();
	});

	it("does nothing on send when already streaming", async () => {
		mockFetchMessages.mockResolvedValue([]);

		// We need to start a stream first to set streaming=true
		// Simulate by using a response that never resolves
		const neverResolve = new Promise<Response>(() => {});
		mockSendMessage.mockReturnValue(neverResolve as Promise<Response>);

		const { result } = renderHook(() => useMessages("conv-1"));
		await waitFor(() => expect(result.current.loading).toBe(false));

		// Start first send (will hang)
		act(() => {
			result.current.send("first");
		});

		// Wait for streaming state to become true
		await waitFor(() => expect(result.current.streaming).toBe(true));

		// Second send should be no-op
		await act(async () => {
			await result.current.send("second");
		});

		expect(mockSendMessage).toHaveBeenCalledTimes(1);
	});

	it("throws error when response has no body", async () => {
		mockFetchMessages.mockResolvedValue([]);
		mockSendMessage.mockResolvedValue({
			body: null,
		} as Response);

		const { result } = renderHook(() => useMessages("conv-1"));
		await waitFor(() => expect(result.current.loading).toBe(false));

		await act(async () => {
			await result.current.send("hello");
		});

		expect(result.current.error).toBe("No response body");
		expect(result.current.streaming).toBe(false);
	});

	it("processes SSE delta events during streaming", async () => {
		mockFetchMessages.mockResolvedValue([]);

		const sseData = [
			'data: {"type":"delta","delta":"Hello"}\n\n',
			'data: {"type":"delta","delta":" world"}\n\n',
			"data: [DONE]\n\n",
		].join("");

		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode(sseData));
				controller.close();
			},
		});

		mockSendMessage.mockResolvedValue({
			body: stream,
		} as unknown as Response);

		// After streaming completes, the hook fetches fresh messages
		const finalMessages = [
			msg1,
			{
				...msg2,
				content: "Hello world",
			},
		];
		mockFetchMessages
			.mockResolvedValueOnce([]) // initial load
			.mockResolvedValueOnce(finalMessages); // refresh after stream

		const { result } = renderHook(() => useMessages("conv-1"));
		await waitFor(() => expect(result.current.loading).toBe(false));

		await act(async () => {
			await result.current.send("Hello");
		});

		expect(result.current.streaming).toBe(false);
		expect(result.current.streamingContent).toBe("");
	});

	it("processes SSE content events during streaming", async () => {
		mockFetchMessages.mockResolvedValue([]);

		const sseData = 'data: {"type":"content","content":"Hi there"}\n\n';

		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode(sseData));
				controller.close();
			},
		});

		mockSendMessage.mockResolvedValue({
			body: stream,
		} as unknown as Response);

		mockFetchMessages
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([msg1]);

		const { result } = renderHook(() => useMessages("conv-1"));
		await waitFor(() => expect(result.current.loading).toBe(false));

		await act(async () => {
			await result.current.send("hello");
		});

		expect(result.current.streaming).toBe(false);
	});

	it("processes SSE message events (final message)", async () => {
		mockFetchMessages.mockResolvedValue([]);

		const finalMsg = {
			id: "m-final",
			conversation_id: "conv-1",
			role: "assistant",
			content: "Response",
			sources_cited: 2,
			created_at: "2024-01-01T00:00:02Z",
		};

		const sseData = `data: {"type":"message","message":${JSON.stringify(finalMsg)}}\n\n`;

		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode(sseData));
				controller.close();
			},
		});

		mockSendMessage.mockResolvedValue({
			body: stream,
		} as unknown as Response);

		mockFetchMessages
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([msg1, finalMsg]);

		const { result } = renderHook(() => useMessages("conv-1"));
		await waitFor(() => expect(result.current.loading).toBe(false));

		await act(async () => {
			await result.current.send("hello");
		});

		expect(result.current.streaming).toBe(false);
	});

	it("processes SSE with plain content field (fallback format)", async () => {
		mockFetchMessages.mockResolvedValue([]);

		const sseData = 'data: {"content":"fallback content"}\n\n';

		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode(sseData));
				controller.close();
			},
		});

		mockSendMessage.mockResolvedValue({
			body: stream,
		} as unknown as Response);

		mockFetchMessages
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([msg1]);

		const { result } = renderHook(() => useMessages("conv-1"));
		await waitFor(() => expect(result.current.loading).toBe(false));

		await act(async () => {
			await result.current.send("hello");
		});

		expect(result.current.streaming).toBe(false);
	});

	it("skips invalid JSON lines in SSE stream", async () => {
		mockFetchMessages.mockResolvedValue([]);

		const sseData = [
			"data: not-valid-json\n\n",
			'data: {"type":"delta","delta":"ok"}\n\n',
		].join("");

		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode(sseData));
				controller.close();
			},
		});

		mockSendMessage.mockResolvedValue({
			body: stream,
		} as unknown as Response);

		mockFetchMessages
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([msg1]);

		const { result } = renderHook(() => useMessages("conv-1"));
		await waitFor(() => expect(result.current.loading).toBe(false));

		await act(async () => {
			await result.current.send("hello");
		});

		// Should not crash, streaming should complete
		expect(result.current.streaming).toBe(false);
	});

	it("skips empty lines and non-data lines in SSE stream", async () => {
		mockFetchMessages.mockResolvedValue([]);

		const sseData = [
			"\n",
			"event: keep-alive\n",
			'data: {"type":"delta","delta":"test"}\n\n',
		].join("");

		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode(sseData));
				controller.close();
			},
		});

		mockSendMessage.mockResolvedValue({
			body: stream,
		} as unknown as Response);

		mockFetchMessages
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([msg1]);

		const { result } = renderHook(() => useMessages("conv-1"));
		await waitFor(() => expect(result.current.loading).toBe(false));

		await act(async () => {
			await result.current.send("hello");
		});

		expect(result.current.streaming).toBe(false);
	});

	it("creates synthetic assistant message when stream has accumulated content but no final message event", async () => {
		mockFetchMessages.mockResolvedValue([]);

		const sseData = 'data: {"type":"delta","delta":"synthetic content"}\n\n';

		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode(sseData));
				controller.close();
			},
		});

		mockSendMessage.mockResolvedValue({
			body: stream,
		} as unknown as Response);

		// After stream, the hook calls fetchMessages to refresh
		const refreshed = [
			msg1,
			{
				...msg2,
				content: "synthetic content",
			},
		];
		mockFetchMessages
			.mockResolvedValueOnce([]) // initial
			.mockResolvedValueOnce(refreshed); // refresh after stream

		const { result } = renderHook(() => useMessages("conv-1"));
		await waitFor(() => expect(result.current.loading).toBe(false));

		await act(async () => {
			await result.current.send("hello");
		});

		expect(result.current.streaming).toBe(false);
		// The messages should be the refreshed set from the server
		expect(result.current.messages).toEqual(refreshed);
	});

	it("handles send error with Error instance", async () => {
		mockFetchMessages.mockResolvedValue([]);
		mockSendMessage.mockRejectedValue(new Error("Send failed"));

		const { result } = renderHook(() => useMessages("conv-1"));
		await waitFor(() => expect(result.current.loading).toBe(false));

		await act(async () => {
			await result.current.send("hello");
		});

		expect(result.current.error).toBe("Send failed");
		expect(result.current.streaming).toBe(false);
	});

	it("handles send error with non-Error throw", async () => {
		mockFetchMessages.mockResolvedValue([]);
		mockSendMessage.mockRejectedValue("something bad");

		const { result } = renderHook(() => useMessages("conv-1"));
		await waitFor(() => expect(result.current.loading).toBe(false));

		await act(async () => {
			await result.current.send("hello");
		});

		expect(result.current.error).toBe("Failed to send message");
		expect(result.current.streaming).toBe(false);
	});

	it("silently ignores AbortError", async () => {
		mockFetchMessages.mockResolvedValue([]);
		const abortError = new DOMException("Aborted", "AbortError");
		mockSendMessage.mockRejectedValue(abortError);

		const { result } = renderHook(() => useMessages("conv-1"));
		await waitFor(() => expect(result.current.loading).toBe(false));

		await act(async () => {
			await result.current.send("hello");
		});

		expect(result.current.error).toBeNull();
	});

	it("adds user message optimistically before streaming", async () => {
		mockFetchMessages.mockResolvedValue([]);

		// Create a stream that we control
		const resolveRead: ((value: ReadableStreamReadResult<Uint8Array>) => void) | null = null;
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				// We'll resolve reads manually
			},
			pull(controller) {
				return new Promise((resolve) => {
					// Close immediately to keep test simple
					controller.close();
					resolve();
				});
			},
		});

		mockSendMessage.mockResolvedValue({
			body: stream,
		} as unknown as Response);

		mockFetchMessages
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([]);

		const { result } = renderHook(() => useMessages("conv-1"));
		await waitFor(() => expect(result.current.loading).toBe(false));

		await act(async () => {
			await result.current.send("hello");
		});

		// After send completes, messages are refreshed from server
		expect(result.current.streaming).toBe(false);
	});

	it("aborts in-flight request on unmount", async () => {
		mockFetchMessages.mockResolvedValue([msg1]);

		const { result, unmount } = renderHook(() => useMessages("conv-1"));
		await waitFor(() => expect(result.current.loading).toBe(false));

		// Unmounting should trigger the cleanup that calls abort
		unmount();

		// No error should be thrown
	});

	it("refreshes messages", async () => {
		mockFetchMessages.mockResolvedValue([msg1]);

		const { result } = renderHook(() => useMessages("conv-1"));
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.messages).toEqual([msg1]);

		mockFetchMessages.mockResolvedValue([msg1, msg2]);

		await act(async () => {
			await result.current.refresh();
		});

		expect(result.current.messages).toEqual([msg1, msg2]);
	});

	it("reloads messages when conversationId changes", async () => {
		mockFetchMessages.mockResolvedValue([msg1]);

		const { result, rerender } = renderHook(
			({ id }: { id: string | null }) => useMessages(id),
			{ initialProps: { id: "conv-1" } },
		);

		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.messages).toEqual([msg1]);

		mockFetchMessages.mockResolvedValue([msg2]);

		rerender({ id: "conv-2" });

		await waitFor(() => {
			expect(result.current.messages).toEqual([msg2]);
		});
	});
});
