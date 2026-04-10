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
			citations: [],
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
			citations: [],
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
			citations: [],
			created_at: "2024-01-01T00:00:00Z",
		};
		render(<MessageBubble message={message} />);
		expect(screen.getByText("Assistant response")).toBeInTheDocument();
	});

	it("renders clickable citation chips for assistant messages", () => {
		const message: Message = {
			id: "m4",
			conversation_id: "conv-1",
			role: "assistant",
			content: "Response with sources",
			sources_cited: 2,
			citations: [
				{
					document_id: "doc-1",
					filename: "lease.pdf",
					page: 3,
					label: "lease.pdf p.3",
				},
				{
					document_id: "doc-2",
					filename: "addendum.pdf",
					page: 7,
					label: "addendum.pdf p.7",
				},
			],
			created_at: "2024-01-01T00:00:00Z",
		};
		render(<MessageBubble message={message} />);
		expect(screen.getByRole("button", { name: "lease.pdf p.3" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "addendum.pdf p.7" })).toBeInTheDocument();
	});

	it("clicking a citation chip calls onCitationClick", async () => {
		const onCitationClick = vi.fn();
		const message: Message = {
			id: "m5",
			conversation_id: "conv-1",
			role: "assistant",
			content: "Response",
			sources_cited: 1,
			citations: [
				{
					document_id: "doc-1",
					filename: "lease.pdf",
					page: 1,
					label: "lease.pdf p.1",
				},
			],
			created_at: "2024-01-01T00:00:00Z",
		};
		render(
			<MessageBubble message={message} onCitationClick={onCitationClick} />,
		);

		screen.getByRole("button", { name: "lease.pdf p.1" }).click();

		expect(onCitationClick).toHaveBeenCalledWith(message.citations[0]);
	});

	it("does not render citation chips when citations are empty", () => {
		const message: Message = {
			id: "m6",
			conversation_id: "conv-1",
			role: "assistant",
			content: "Response",
			sources_cited: 1,
			citations: [],
			created_at: "2024-01-01T00:00:00Z",
		};
		render(<MessageBubble message={message} />);
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});

	it("shows refusal state styling when assistant has no citations", () => {
		const message: Message = {
			id: "m7",
			conversation_id: "conv-1",
			role: "assistant",
			content:
				"I can't answer that from the uploaded documents with a verifiable page citation.",
			sources_cited: 0,
			citations: [],
			created_at: "2024-01-01T00:00:00Z",
		};
		const { container } = render(<MessageBubble message={message} />);
		expect(container.querySelector(".bg-amber-50")).toBeInTheDocument();
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

	it("does not render a citations block while streaming", () => {
		render(
			<StreamingBubble
				content={
					'Visible answer\n<citations>[{"filename":"lease.pdf","page":1}]</citations>'
				}
			/>,
		);

		expect(screen.getByText(/Visible answer/)).toBeInTheDocument();
		expect(screen.queryByText(/<citations>/)).not.toBeInTheDocument();
	});

	it("always shows cursor", () => {
		render(<StreamingBubble content="text" />);
		const cursor = document.querySelector(".animate-pulse.bg-neutral-400");
		expect(cursor).toBeInTheDocument();
	});
});
