import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

// Mock the hooks to isolate App component testing
const mockCreate = vi.fn();
const mockSelect = vi.fn();
const mockRemove = vi.fn();
const mockRefreshConversations = vi.fn();
const mockSend = vi.fn();
const mockUpload = vi.fn();
const mockRefreshDocument = vi.fn();

vi.mock("./hooks/use-conversations", () => ({
	useConversations: () => ({
		conversations: [
			{
				id: "conv-1",
				title: "Test Conversation",
				created_at: "2024-01-01",
				updated_at: new Date().toISOString(),
				has_document: false,
			},
		],
		selectedId: "conv-1",
		loading: false,
		create: mockCreate,
		select: mockSelect,
		remove: mockRemove,
		refresh: mockRefreshConversations,
	}),
}));

vi.mock("./hooks/use-messages", () => ({
	useMessages: () => ({
		messages: [],
		loading: false,
		error: null,
		streaming: false,
		streamingContent: "",
		send: mockSend,
	}),
}));

vi.mock("./hooks/use-document", () => ({
	useDocument: () => ({
		document: null,
		upload: mockUpload,
		refresh: mockRefreshDocument,
	}),
}));

// Mock Streamdown
vi.mock("streamdown", () => ({
	Streamdown: ({ children }: { children: string }) => <span>{children}</span>,
}));
vi.mock("streamdown/styles.css", () => ({}));

// Mock react-pdf
vi.mock("react-pdf", () => ({
	Document: ({ children }: { children: React.ReactNode }) => (
		<div data-testid="pdf-document">{children}</div>
	),
	Page: () => <div data-testid="pdf-page" />,
	pdfjs: { GlobalWorkerOptions: { workerSrc: "" } },
}));
vi.mock("react-pdf/dist/Page/AnnotationLayer.css", () => ({}));
vi.mock("react-pdf/dist/Page/TextLayer.css", () => ({}));

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
	AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

beforeEach(() => {
	vi.clearAllMocks();
	mockSend.mockResolvedValue(undefined);
	mockCreate.mockResolvedValue({
		id: "new",
		title: "New conversation",
		created_at: "2024-01-01",
		updated_at: "2024-01-01",
		has_document: false,
	});
	mockUpload.mockResolvedValue(null);
});

describe("App", () => {
	it("renders the main layout with sidebar, chat window, and document viewer", () => {
		render(<App />);
		// Sidebar shows "Chats"
		expect(screen.getByText("Chats")).toBeInTheDocument();
		// Document viewer shows "No document uploaded" since document is null
		expect(screen.getByText("No document uploaded")).toBeInTheDocument();
	});

	it("renders conversation in sidebar", () => {
		render(<App />);
		expect(screen.getByText("Test Conversation")).toBeInTheDocument();
	});

	it("calls create and wraps it in handleCreate", async () => {
		const user = userEvent.setup();
		render(<App />);

		const newChatButton = screen.getByTitle("New chat");
		await user.click(newChatButton);

		expect(mockCreate).toHaveBeenCalled();
	});

	it("calls send and refreshConversations in handleSend", async () => {
		const user = userEvent.setup();
		render(<App />);

		const textarea = screen.getByPlaceholderText(
			"Ask a question about your document...",
		);
		await user.type(textarea, "Hello{Enter}");

		await waitFor(() => {
			expect(mockSend).toHaveBeenCalledWith("Hello");
		});
		await waitFor(() => {
			expect(mockRefreshConversations).toHaveBeenCalled();
		});
	});

	it("calls upload and refreshes on successful handleUpload", async () => {
		const mockDoc = {
			id: "doc-1",
			conversation_id: "conv-1",
			filename: "test.pdf",
			page_count: 1,
			uploaded_at: "2024-01-01",
		};
		mockUpload.mockResolvedValue(mockDoc);

		render(<App />);

		// Find the file input and trigger a file upload
		const fileInput = document.querySelector(
			'input[type="file"]',
		) as HTMLInputElement;
		const file = new File(["content"], "test.pdf", {
			type: "application/pdf",
		});

		await act(async () => {
			// The file input's onChange triggers handleUpload via ChatInput's onUpload -> App's handleUpload
			Object.defineProperty(fileInput, "files", { value: [file] });
			fileInput.dispatchEvent(new Event("change", { bubbles: true }));
		});

		await waitFor(() => {
			expect(mockUpload).toHaveBeenCalledWith(file);
		});
		await waitFor(() => {
			expect(mockRefreshDocument).toHaveBeenCalled();
			expect(mockRefreshConversations).toHaveBeenCalled();
		});
	});

	it("does not refresh when upload returns null (failure)", async () => {
		mockUpload.mockResolvedValue(null);

		render(<App />);

		const fileInput = document.querySelector(
			'input[type="file"]',
		) as HTMLInputElement;
		const file = new File(["content"], "test.pdf", {
			type: "application/pdf",
		});

		await act(async () => {
			Object.defineProperty(fileInput, "files", { value: [file] });
			fileInput.dispatchEvent(new Event("change", { bubbles: true }));
		});

		await waitFor(() => {
			expect(mockUpload).toHaveBeenCalledWith(file);
		});

		expect(mockRefreshDocument).not.toHaveBeenCalled();
		expect(mockRefreshConversations).not.toHaveBeenCalled();
	});
});
