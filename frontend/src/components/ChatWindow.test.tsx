import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Message } from "../types";
import { ChatWindow } from "./ChatWindow";

// Mock Streamdown which requires browser APIs not available in jsdom
vi.mock("streamdown", () => ({
	Streamdown: ({ children }: { children: string }) => <span>{children}</span>,
}));
vi.mock("streamdown/styles.css", () => ({}));

// Mock framer-motion to simplify component testing
vi.mock("framer-motion", () => ({
	motion: {
		div: ({
			children,
			...props
		}: React.PropsWithChildren<Record<string, unknown>>) => (
			<div {...filterMotionProps(props)}>{children}</div>
		),
	},
	AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// Filter out framer-motion specific props to avoid DOM warnings
function filterMotionProps(props: Record<string, unknown>) {
	const {
		initial,
		animate,
		exit,
		transition,
		whileHover,
		whileTap,
		layout,
		...rest
	} = props;
	return rest;
}

// Wrap in TooltipProvider since ChatWindow renders ChatInput which uses Tooltip
import { TooltipProvider } from "./ui/tooltip";

const messages: Message[] = [
	{
		id: "m1",
		conversation_id: "conv-1",
		role: "user",
		content: "Hello",
		sources_cited: 0,
		created_at: "2024-01-01T00:00:00Z",
	},
	{
		id: "m2",
		conversation_id: "conv-1",
		role: "assistant",
		content: "Hi there!",
		sources_cited: 2,
		created_at: "2024-01-01T00:00:01Z",
	},
];

function renderChatWindow(
	props: Partial<Parameters<typeof ChatWindow>[0]> = {},
) {
	const defaultProps = {
		messages: [] as Message[],
		loading: false,
		error: null as string | null,
		streaming: false,
		streamingContent: "",
		hasDocuments: false,
		conversationId: "conv-1" as string | null,
		onSend: vi.fn(),
		onUpload: vi.fn(),
		canUpload: true,
	};
	return render(
		<TooltipProvider>
			<ChatWindow {...defaultProps} {...props} />
		</TooltipProvider>,
	);
}

describe("ChatWindow", () => {
	it("shows empty state prompt when no conversation is selected", () => {
		renderChatWindow({ conversationId: null });
		expect(
			screen.getByText("Select a conversation or create a new one"),
		).toBeInTheDocument();
	});

	it("shows loading spinner when loading", () => {
		renderChatWindow({ loading: true });
		// The Loader2 icon is rendered when loading
		const spinner = document.querySelector(".animate-spin");
		expect(spinner).toBeInTheDocument();
	});

	it("shows EmptyState when no messages, not streaming, and no document", () => {
		renderChatWindow({ messages: [], hasDocuments: false });
		expect(
			screen.getByText("Upload a document to get started"),
		).toBeInTheDocument();
	});

	it("shows 'Document uploaded' prompt when no messages but has document", () => {
		renderChatWindow({ messages: [], hasDocuments: true });
		expect(
			screen.getByText("Document uploaded. Ask a question to get started."),
		).toBeInTheDocument();
	});

	it("renders messages when present", () => {
		renderChatWindow({ messages });
		expect(screen.getByText("Hello")).toBeInTheDocument();
		expect(screen.getByText("Hi there!")).toBeInTheDocument();
	});

	it("shows streaming bubble when streaming", () => {
		renderChatWindow({
			messages,
			streaming: true,
			streamingContent: "Streaming text...",
		});
		expect(screen.getByText("Streaming text...")).toBeInTheDocument();
	});

	it("shows streaming bubble with loading dots when streamingContent is empty", () => {
		renderChatWindow({
			messages,
			streaming: true,
			streamingContent: "",
		});
		// The loading dots have animate-pulse class
		const dots = document.querySelectorAll(".animate-pulse");
		expect(dots.length).toBeGreaterThan(0);
	});

	it("shows error message when error is set", () => {
		renderChatWindow({
			messages,
			error: "Something went wrong",
		});
		expect(screen.getByText("Something went wrong")).toBeInTheDocument();
	});

	it("renders ChatInput at the bottom of messages view", () => {
		renderChatWindow({ messages });
		expect(
			screen.getByPlaceholderText("Ask a question about your document..."),
		).toBeInTheDocument();
	});

	it("renders ChatInput in empty state with document uploaded", () => {
		renderChatWindow({ messages: [], hasDocuments: true });
		expect(
			screen.getByPlaceholderText("Ask a question about your document..."),
		).toBeInTheDocument();
	});

	it("renders ChatInput in empty state without document", () => {
		renderChatWindow({ messages: [], hasDocuments: false });
		// ChatInput is rendered inside EmptyState layout
		expect(
			screen.getByPlaceholderText("Ask a question about your document..."),
		).toBeInTheDocument();
	});

	it("shows sources cited for assistant messages", () => {
		renderChatWindow({ messages });
		expect(screen.getByText("2 sources cited")).toBeInTheDocument();
	});

	it("renders system messages", () => {
		const systemMessage: Message = {
			id: "m3",
			conversation_id: "conv-1",
			role: "system",
			content: "System notification",
			sources_cited: 0,
			created_at: "2024-01-01T00:00:02Z",
		};
		renderChatWindow({ messages: [systemMessage] });
		expect(screen.getByText("System notification")).toBeInTheDocument();
	});

	it("shows singular 'source' for 1 source cited", () => {
		const msgWith1Source: Message = {
			id: "m4",
			conversation_id: "conv-1",
			role: "assistant",
			content: "Answer",
			sources_cited: 1,
			created_at: "2024-01-01T00:00:03Z",
		};
		renderChatWindow({ messages: [msgWith1Source] });
		expect(screen.getByText("1 source cited")).toBeInTheDocument();
	});

	it("does not show sources cited when 0", () => {
		const msgWith0Sources: Message = {
			id: "m5",
			conversation_id: "conv-1",
			role: "assistant",
			content: "Answer here",
			sources_cited: 0,
			created_at: "2024-01-01T00:00:04Z",
		};
		renderChatWindow({ messages: [msgWith0Sources] });
		expect(screen.queryByText(/\d+ sources? cited/)).not.toBeInTheDocument();
	});
});
