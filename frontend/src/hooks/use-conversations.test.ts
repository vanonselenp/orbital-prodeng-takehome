import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useConversations } from "./use-conversations";

vi.mock("../lib/api", () => ({
	fetchConversations: vi.fn(),
	createConversation: vi.fn(),
	deleteConversation: vi.fn(),
}));

import * as api from "../lib/api";

const mockFetch = vi.mocked(api.fetchConversations);
const mockCreate = vi.mocked(api.createConversation);
const mockDelete = vi.mocked(api.deleteConversation);

const conv1 = {
	id: "1",
	title: "First",
	created_at: "2024-01-01",
	updated_at: "2024-01-01",
	has_document: false,
};
const conv2 = {
	id: "2",
	title: "Second",
	created_at: "2024-01-02",
	updated_at: "2024-01-02",
	has_document: true,
};

beforeEach(() => {
	vi.clearAllMocks();
	mockFetch.mockResolvedValue([conv1, conv2]);
});

describe("useConversations", () => {
	it("loads conversations on mount", async () => {
		const { result } = renderHook(() => useConversations());
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.conversations).toEqual([conv1, conv2]);
	});

	it("sets error on fetch failure", async () => {
		mockFetch.mockRejectedValue(new Error("Network error"));
		const { result } = renderHook(() => useConversations());
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.error).toBe("Network error");
	});

	it("creates a conversation", async () => {
		const newConv = { ...conv1, id: "new" };
		mockCreate.mockResolvedValue(newConv);
		const { result } = renderHook(() => useConversations());
		await waitFor(() => expect(result.current.loading).toBe(false));

		await act(async () => {
			await result.current.create();
		});

		expect(result.current.conversations[0].id).toBe("new");
		expect(result.current.selectedId).toBe("new");
	});

	it("selects a conversation", async () => {
		const { result } = renderHook(() => useConversations());
		await waitFor(() => expect(result.current.loading).toBe(false));

		act(() => result.current.select("1"));
		expect(result.current.selectedId).toBe("1");
		expect(result.current.selected?.id).toBe("1");
	});

	it("removes a conversation", async () => {
		mockDelete.mockResolvedValue(undefined);
		const { result } = renderHook(() => useConversations());
		await waitFor(() => expect(result.current.loading).toBe(false));

		act(() => result.current.select("1"));
		await act(async () => {
			await result.current.remove("1");
		});

		expect(result.current.conversations).toHaveLength(1);
		expect(result.current.selectedId).toBeNull();
	});

	it("sets error on create failure", async () => {
		mockCreate.mockRejectedValue(new Error("Create failed"));
		const { result } = renderHook(() => useConversations());
		await waitFor(() => expect(result.current.loading).toBe(false));

		let created: unknown;
		await act(async () => {
			created = await result.current.create();
		});

		expect(created).toBeNull();
		expect(result.current.error).toBe("Create failed");
	});

	it("sets generic error on create failure with non-Error", async () => {
		mockCreate.mockRejectedValue("something");
		const { result } = renderHook(() => useConversations());
		await waitFor(() => expect(result.current.loading).toBe(false));

		await act(async () => {
			await result.current.create();
		});

		expect(result.current.error).toBe("Failed to create conversation");
	});

	it("sets error on delete failure", async () => {
		mockDelete.mockRejectedValue(new Error("Delete failed"));
		const { result } = renderHook(() => useConversations());
		await waitFor(() => expect(result.current.loading).toBe(false));

		await act(async () => {
			await result.current.remove("1");
		});

		expect(result.current.error).toBe("Delete failed");
	});

	it("sets generic error on delete failure with non-Error", async () => {
		mockDelete.mockRejectedValue("something");
		const { result } = renderHook(() => useConversations());
		await waitFor(() => expect(result.current.loading).toBe(false));

		await act(async () => {
			await result.current.remove("1");
		});

		expect(result.current.error).toBe("Failed to delete conversation");
	});

	it("sets generic error on fetch failure with non-Error", async () => {
		mockFetch.mockRejectedValue("non-error");
		const { result } = renderHook(() => useConversations());
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.error).toBe("Failed to load conversations");
	});

	it("does not clear selectedId when removing a different conversation", async () => {
		mockDelete.mockResolvedValue(undefined);
		const { result } = renderHook(() => useConversations());
		await waitFor(() => expect(result.current.loading).toBe(false));

		act(() => result.current.select("1"));
		await act(async () => {
			await result.current.remove("2");
		});

		expect(result.current.selectedId).toBe("1");
		expect(result.current.conversations).toHaveLength(1);
	});

	it("refreshes conversations", async () => {
		const { result } = renderHook(() => useConversations());
		await waitFor(() => expect(result.current.loading).toBe(false));

		mockFetch.mockResolvedValue([conv2]);
		await act(async () => {
			await result.current.refresh();
		});

		expect(result.current.conversations).toEqual([conv2]);
	});
});
