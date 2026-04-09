import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Message } from "../types";
import { MessageBubble, StreamingBubble } from "./MessageBubble";

// Mock Streamdown which requires browser APIs not available in jsdom
vi.mock("streamdown", () => ({
	Streamdown: ({
		children,
		mode,
	}: { children: string; mode?: string }) => (
		<span data-mode={mode}>{children}</span>
	),
}));
vi.mock("streamdown/styles.css", () => ({}));

// Mock framer-motion
vi.mock("framer-motion", () => ({
	motion: {
		div: ({
			children,
			className,
		}: React.PropsWithChildren<{ className?: string }>) => (
			<div className={className}>{children}</div>
		),
	},
}));

describe("MessageBubble", () => {
	it("renders system message", () => {
		const message: Message = {
			id: "m1",
			conversation_id: "conv-1",
			role: "system",
			content: "System notification",
			sources_cited: 0,
			created_at: "2024-01-01T00:00:00Z",
		};
		render(<MessageBubble message={message} />);
		expect(screen.getByText("System notification")).toBeInTheDocument();
	});

	it("renders user message", () => {
		const message: Message = {
			id: "m2",
			conversation_id: "conv-1",
			role: "user",
			content: "Hello world",
			sources_cited: 0,
			created_at: "2024-01-01T00:00:00Z",
		};
		render(<MessageBubble message={message} />);
		expect(screen.getByText("Hello world")).toBeInTheDocument();
	});

	it("renders assistant message with Streamdown", () => {
		const message: Message = {
			id: "m3",
			conversation_id: "conv-1",
			role: "assistant",
			content: "Assistant response",
			sources_cited: 0,
			created_at: "2024-01-01T00:00:00Z",
		};
		render(<MessageBubble message={message} />);
		expect(screen.getByText("Assistant response")).toBeInTheDocument();
	});

	it("shows sources cited count for assistant message with sources > 0", () => {
		const message: Message = {
			id: "m4",
			conversation_id: "conv-1",
			role: "assistant",
			content: "Response with sources",
			sources_cited: 3,
			created_at: "2024-01-01T00:00:00Z",
		};
		render(<MessageBubble message={message} />);
		expect(screen.getByText("3 sources cited")).toBeInTheDocument();
	});

	it("shows singular 'source' for 1 source cited", () => {
		const message: Message = {
			id: "m5",
			conversation_id: "conv-1",
			role: "assistant",
			content: "Response",
			sources_cited: 1,
			created_at: "2024-01-01T00:00:00Z",
		};
		render(<MessageBubble message={message} />);
		expect(screen.getByText("1 source cited")).toBeInTheDocument();
	});

	it("does not show sources cited for assistant with 0 sources", () => {
		const message: Message = {
			id: "m6",
			conversation_id: "conv-1",
			role: "assistant",
			content: "No sources response",
			sources_cited: 0,
			created_at: "2024-01-01T00:00:00Z",
		};
		render(<MessageBubble message={message} />);
		expect(screen.queryByText(/\d+ sources? cited/)).not.toBeInTheDocument();
	});
});

describe("StreamingBubble", () => {
	it("renders content when provided", () => {
		render(<StreamingBubble content="Streaming text" />);
		expect(screen.getByText("Streaming text")).toBeInTheDocument();
	});

	it("renders Streamdown in streaming mode", () => {
		render(<StreamingBubble content="Streaming text" />);
		const streamdown = screen.getByText("Streaming text");
		expect(streamdown.getAttribute("data-mode")).toBe("streaming");
	});

	it("renders loading dots when content is empty", () => {
		render(<StreamingBubble content="" />);
		const dots = document.querySelectorAll(".animate-pulse");
		// 3 dots + the cursor
		expect(dots.length).toBeGreaterThanOrEqual(3);
	});

	it("always shows cursor", () => {
		render(<StreamingBubble content="text" />);
		const cursor = document.querySelector(".animate-pulse.bg-neutral-400");
		expect(cursor).toBeInTheDocument();
	});
});
