import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Conversation } from "../types";
import { ChatSidebar } from "./ChatSidebar";

const conversations: Conversation[] = [
	{
		id: "1",
		title: "First conversation",
		created_at: "2024-01-01T00:00:00Z",
		updated_at: new Date().toISOString(),
		has_document: false,
	},
	{
		id: "2",
		title: "Second conversation",
		created_at: "2024-01-02T00:00:00Z",
		updated_at: new Date().toISOString(),
		has_document: true,
	},
];

function renderSidebar(
	props: Partial<Parameters<typeof ChatSidebar>[0]> = {},
) {
	const defaultProps = {
		conversations,
		selectedId: null as string | null,
		loading: false,
		onSelect: vi.fn(),
		onCreate: vi.fn(),
		onDelete: vi.fn(),
	};
	return render(<ChatSidebar {...defaultProps} {...props} />);
}

describe("ChatSidebar", () => {
	it("renders the Chats header", () => {
		renderSidebar();
		expect(screen.getByText("Chats")).toBeInTheDocument();
	});

	it("renders conversation titles", () => {
		renderSidebar();
		expect(screen.getByText("First conversation")).toBeInTheDocument();
		expect(screen.getByText("Second conversation")).toBeInTheDocument();
	});

	it("shows loading skeleton when loading with no conversations", () => {
		renderSidebar({ loading: true, conversations: [] });
		const skeletons = document.querySelectorAll(".animate-pulse");
		expect(skeletons.length).toBeGreaterThan(0);
	});

	it("shows empty state message when not loading and no conversations", () => {
		renderSidebar({ loading: false, conversations: [] });
		expect(screen.getByText("No conversations yet")).toBeInTheDocument();
	});

	it("does not show loading skeleton when loading with existing conversations", () => {
		renderSidebar({ loading: true });
		expect(screen.queryByText("No conversations yet")).not.toBeInTheDocument();
		// Should still show conversations
		expect(screen.getByText("First conversation")).toBeInTheDocument();
	});

	it("calls onCreate when new chat button is clicked", async () => {
		const user = userEvent.setup();
		const onCreate = vi.fn();
		renderSidebar({ onCreate });

		const newChatButton = screen.getByTitle("New chat");
		await user.click(newChatButton);

		expect(onCreate).toHaveBeenCalledTimes(1);
	});

	it("calls onSelect when a conversation is clicked", async () => {
		const user = userEvent.setup();
		const onSelect = vi.fn();
		renderSidebar({ onSelect });

		await user.click(screen.getByText("First conversation"));

		expect(onSelect).toHaveBeenCalledWith("1");
	});

	it("highlights selected conversation", () => {
		renderSidebar({ selectedId: "1" });

		const button = screen.getByText("First conversation").closest("button");
		expect(button?.className).toContain("bg-neutral-100");
	});

	it("shows delete button on hover and calls onDelete", async () => {
		const onDelete = vi.fn();
		renderSidebar({ onDelete });

		const convButton = screen.getByText("First conversation").closest("button") as HTMLElement;

		// Use fireEvent for hover since framer-motion animations can interfere with userEvent
		fireEvent.mouseEnter(convButton);

		// Delete button should now be visible
		const deleteButton = screen.getByTitle("Delete conversation");
		expect(deleteButton).toBeInTheDocument();

		fireEvent.click(deleteButton);

		expect(onDelete).toHaveBeenCalledWith("1");
	});

	it("hides delete button on mouse leave", () => {
		renderSidebar();

		const convButton = screen.getByText("First conversation").closest("button") as HTMLElement;

		fireEvent.mouseEnter(convButton);
		expect(screen.getByTitle("Delete conversation")).toBeInTheDocument();

		fireEvent.mouseLeave(convButton);
		expect(screen.queryByTitle("Delete conversation")).not.toBeInTheDocument();
	});

	it("delete click does not trigger onSelect (stopPropagation)", () => {
		const onSelect = vi.fn();
		const onDelete = vi.fn();
		renderSidebar({ onSelect, onDelete });

		const convButton = screen.getByText("First conversation").closest("button") as HTMLElement;
		fireEvent.mouseEnter(convButton);

		const deleteButton = screen.getByTitle("Delete conversation");
		fireEvent.click(deleteButton);

		expect(onDelete).toHaveBeenCalledWith("1");
		// onSelect should not be called because stopPropagation was used
		expect(onSelect).not.toHaveBeenCalled();
	});

	it("displays relative time for conversations", () => {
		renderSidebar();
		// The conversations have updated_at set to now, so they should show "just now"
		const timeElements = screen.getAllByText("just now");
		expect(timeElements.length).toBe(2);
	});
});
