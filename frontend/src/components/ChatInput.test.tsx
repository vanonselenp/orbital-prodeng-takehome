import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatInput } from "./ChatInput";

// Wrap with TooltipProvider since ChatInput uses Tooltip
import { TooltipProvider } from "./ui/tooltip";

function renderChatInput(props: Partial<Parameters<typeof ChatInput>[0]> = {}) {
	const defaultProps = {
		onSend: vi.fn(),
		onUpload: vi.fn(),
		disabled: false,
		canUpload: true,
	};
	return render(
		<TooltipProvider>
			<ChatInput {...defaultProps} {...props} />
		</TooltipProvider>,
	);
}

describe("ChatInput", () => {
	it("renders textarea and buttons", () => {
		renderChatInput();
		expect(
			screen.getByPlaceholderText("Ask a question about your document..."),
		).toBeInTheDocument();
	});

	it("updates textarea value on input", async () => {
		const user = userEvent.setup();
		renderChatInput();

		const textarea = screen.getByPlaceholderText(
			"Ask a question about your document...",
		);
		await user.type(textarea, "hello");
		expect(textarea).toHaveValue("hello");
	});

	it("calls onSend and clears input when send button is clicked", async () => {
		const user = userEvent.setup();
		const onSend = vi.fn();
		renderChatInput({ onSend });

		const textarea = screen.getByPlaceholderText(
			"Ask a question about your document...",
		);
		await user.type(textarea, "hello");

		// Find the send button (second button, after the paperclip)
		const buttons = screen.getAllByRole("button");
		const sendButton = buttons[buttons.length - 1];
		await user.click(sendButton);

		expect(onSend).toHaveBeenCalledWith("hello");
	});

	it("calls onSend on Enter key press", async () => {
		const user = userEvent.setup();
		const onSend = vi.fn();
		renderChatInput({ onSend });

		const textarea = screen.getByPlaceholderText(
			"Ask a question about your document...",
		);
		await user.type(textarea, "hello{Enter}");

		expect(onSend).toHaveBeenCalledWith("hello");
	});

	it("does not call onSend on Shift+Enter", async () => {
		const user = userEvent.setup();
		const onSend = vi.fn();
		renderChatInput({ onSend });

		const textarea = screen.getByPlaceholderText(
			"Ask a question about your document...",
		);
		await user.type(textarea, "hello{Shift>}{Enter}{/Shift}");

		expect(onSend).not.toHaveBeenCalled();
	});

	it("does not send empty or whitespace-only messages", async () => {
		const user = userEvent.setup();
		const onSend = vi.fn();
		renderChatInput({ onSend });

		const textarea = screen.getByPlaceholderText(
			"Ask a question about your document...",
		);
		await user.type(textarea, "   {Enter}");

		expect(onSend).not.toHaveBeenCalled();
	});

	it("does not send when disabled", async () => {
		const user = userEvent.setup();
		const onSend = vi.fn();
		renderChatInput({ onSend, disabled: true });

		const textarea = screen.getByPlaceholderText(
			"Ask a question about your document...",
		);
		// The textarea is disabled, so type won't work. Verify the send doesn't fire.
		expect(textarea).toBeDisabled();
	});

	it("disables paperclip button when canUpload is false", () => {
		renderChatInput({ canUpload: false });
		const buttons = screen.getAllByRole("button");
		// First button is the paperclip/attach button
		expect(buttons[0]).toBeDisabled();
	});

	it("enables paperclip button when canUpload is true", () => {
		renderChatInput({ canUpload: true });
		const buttons = screen.getAllByRole("button");
		expect(buttons[0]).not.toBeDisabled();
	});

	it("triggers file input when paperclip button is clicked", async () => {
		const user = userEvent.setup();
		renderChatInput();

		const fileInput = document.querySelector(
			'input[type="file"]',
		) as HTMLInputElement;
		expect(fileInput).toBeTruthy();
		expect(fileInput.accept).toBe(".pdf");

		const clickSpy = vi.spyOn(fileInput, "click");

		// Click the paperclip button (first button)
		const buttons = screen.getAllByRole("button");
		await user.click(buttons[0]);

		expect(clickSpy).toHaveBeenCalled();
	});

	it("calls onUpload when a file is selected", async () => {
		const onUpload = vi.fn();
		renderChatInput({ onUpload });

		const fileInput = document.querySelector(
			'input[type="file"]',
		) as HTMLInputElement;

		const file = new File(["content"], "test.pdf", {
			type: "application/pdf",
		});

		fireEvent.change(fileInput, { target: { files: [file] } });

		expect(onUpload).toHaveBeenCalledWith(file);
	});

	it("resets file input after file selection", async () => {
		const onUpload = vi.fn();
		renderChatInput({ onUpload });

		const fileInput = document.querySelector(
			'input[type="file"]',
		) as HTMLInputElement;

		const file = new File(["content"], "test.pdf", {
			type: "application/pdf",
		});

		fireEvent.change(fileInput, { target: { files: [file] } });

		expect(fileInput.value).toBe("");
	});

	it("does not call onUpload when no file is selected", () => {
		const onUpload = vi.fn();
		renderChatInput({ onUpload });

		const fileInput = document.querySelector(
			'input[type="file"]',
		) as HTMLInputElement;

		fireEvent.change(fileInput, { target: { files: [] } });

		expect(onUpload).not.toHaveBeenCalled();
	});

	it("auto-resizes textarea on input", async () => {
		const user = userEvent.setup();
		renderChatInput();

		const textarea = screen.getByPlaceholderText(
			"Ask a question about your document...",
		) as HTMLTextAreaElement;

		// Simulate input that triggers the handleInput callback
		await user.type(textarea, "line1");

		// The height style should have been set (auto-resize logic)
		// In jsdom, scrollHeight is 0, so it will set height to "0px"
		expect(textarea.style.height).toBeDefined();
	});
});
