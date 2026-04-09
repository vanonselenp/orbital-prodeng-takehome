import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocumentUpload } from "./DocumentUpload";

function renderDocumentUpload(
	props: Partial<Parameters<typeof DocumentUpload>[0]> = {},
) {
	const defaultProps = {
		onUpload: vi.fn(),
		uploading: false,
	};
	return render(<DocumentUpload {...defaultProps} {...props} />);
}

describe("DocumentUpload", () => {
	it("renders upload prompt text", () => {
		renderDocumentUpload();
		expect(screen.getByText("Upload a PDF document")).toBeInTheDocument();
		expect(screen.getByText("Click or drag and drop")).toBeInTheDocument();
	});

	it("shows uploading state", () => {
		renderDocumentUpload({ uploading: true });
		expect(screen.getByText("Uploading document...")).toBeInTheDocument();
		expect(
			screen.queryByText("Upload a PDF document"),
		).not.toBeInTheDocument();
	});

	it("triggers file input click on button click", () => {
		renderDocumentUpload();

		const fileInput = document.querySelector(
			'input[type="file"]',
		) as HTMLInputElement;
		const clickSpy = vi.spyOn(fileInput, "click");

		const button = screen.getByRole("button");
		fireEvent.click(button);

		expect(clickSpy).toHaveBeenCalled();
	});

	it("calls onUpload when a file is selected via file input", () => {
		const onUpload = vi.fn();
		renderDocumentUpload({ onUpload });

		const fileInput = document.querySelector(
			'input[type="file"]',
		) as HTMLInputElement;
		const file = new File(["content"], "test.pdf", {
			type: "application/pdf",
		});

		fireEvent.change(fileInput, { target: { files: [file] } });

		expect(onUpload).toHaveBeenCalledWith(file);
	});

	it("resets file input after file selection", () => {
		const onUpload = vi.fn();
		renderDocumentUpload({ onUpload });

		const fileInput = document.querySelector(
			'input[type="file"]',
		) as HTMLInputElement;
		const file = new File(["content"], "test.pdf", {
			type: "application/pdf",
		});

		fireEvent.change(fileInput, { target: { files: [file] } });

		expect(fileInput.value).toBe("");
	});

	it("does not call onUpload when no file selected", () => {
		const onUpload = vi.fn();
		renderDocumentUpload({ onUpload });

		const fileInput = document.querySelector(
			'input[type="file"]',
		) as HTMLInputElement;

		fireEvent.change(fileInput, { target: { files: [] } });

		expect(onUpload).not.toHaveBeenCalled();
	});

	it("handles drag over event", () => {
		renderDocumentUpload();

		const dropZone = screen.getByRole("button");

		fireEvent.dragOver(dropZone);

		// After dragover, the border class should change
		expect(dropZone.className).toContain("border-neutral-400");
	});

	it("handles drag leave event", () => {
		renderDocumentUpload();

		const dropZone = screen.getByRole("button");

		fireEvent.dragOver(dropZone);
		expect(dropZone.className).toContain("border-neutral-400");

		fireEvent.dragLeave(dropZone);
		expect(dropZone.className).toContain("border-neutral-200");
	});

	it("handles drop event with PDF file", () => {
		const onUpload = vi.fn();
		renderDocumentUpload({ onUpload });

		const dropZone = screen.getByRole("button");
		const file = new File(["content"], "test.pdf", {
			type: "application/pdf",
		});

		fireEvent.drop(dropZone, {
			dataTransfer: { files: [file] },
		});

		expect(onUpload).toHaveBeenCalledWith(file);
	});

	it("ignores drop event with non-PDF file", () => {
		const onUpload = vi.fn();
		renderDocumentUpload({ onUpload });

		const dropZone = screen.getByRole("button");
		const file = new File(["content"], "test.txt", {
			type: "text/plain",
		});

		fireEvent.drop(dropZone, {
			dataTransfer: { files: [file] },
		});

		expect(onUpload).not.toHaveBeenCalled();
	});

	it("resets dragOver state after drop", () => {
		renderDocumentUpload();

		const dropZone = screen.getByRole("button");

		fireEvent.dragOver(dropZone);
		expect(dropZone.className).toContain("border-neutral-400");

		const file = new File(["content"], "test.pdf", {
			type: "application/pdf",
		});
		fireEvent.drop(dropZone, {
			dataTransfer: { files: [file] },
		});

		expect(dropZone.className).toContain("border-neutral-200");
	});

	it("accepts only PDF files in file input", () => {
		renderDocumentUpload();

		const fileInput = document.querySelector(
			'input[type="file"]',
		) as HTMLInputElement;
		expect(fileInput.accept).toBe(".pdf");
	});
});
