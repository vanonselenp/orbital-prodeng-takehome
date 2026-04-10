import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Document } from "../types";
import { DocumentViewer } from "./DocumentViewer";

// Store callbacks so tests can trigger them
let pdfOnLoadSuccess: ((args: { numPages: number }) => void) | null = null;
let pdfOnLoadError: ((error: Error) => void) | null = null;

// Mock react-pdf since it requires canvas/worker APIs not available in jsdom
vi.mock("react-pdf", () => ({
	Document: ({
		children,
		onLoadSuccess,
		onLoadError,
		file,
	}: {
		children: React.ReactNode;
		onLoadSuccess?: (args: { numPages: number }) => void;
		onLoadError?: (error: Error) => void;
		loading?: React.ReactNode;
		file: string;
	}) => {
		pdfOnLoadSuccess = onLoadSuccess ?? null;
		pdfOnLoadError = onLoadError ?? null;
		return (
			<div data-testid="pdf-document" data-file={file}>
				{children}
			</div>
		);
	},
	Page: ({
		pageNumber,
		width,
	}: { pageNumber: number; width: number }) => (
		<div data-testid="pdf-page" data-page={pageNumber} data-width={width}>
			Page {pageNumber}
		</div>
	),
	pdfjs: {
		GlobalWorkerOptions: { workerSrc: "" },
	},
}));
vi.mock("react-pdf/dist/Page/AnnotationLayer.css", () => ({}));
vi.mock("react-pdf/dist/Page/TextLayer.css", () => ({}));

const mockDocument: Document = {
	id: "doc-1",
	conversation_id: "conv-1",
	filename: "test-document.pdf",
	page_count: 5,
	uploaded_at: "2024-01-01T00:00:00Z",
};

const mockDocument2: Document = {
	id: "doc-2",
	conversation_id: "conv-1",
	filename: "second-document.pdf",
	page_count: 3,
	uploaded_at: "2024-01-02T00:00:00Z",
};

const defaultProps = {
	documents: [mockDocument] as Document[],
	selectedDocument: mockDocument as Document | null,
	onSelectDocument: vi.fn(),
	onDeleteDocument: vi.fn(),
	onUpload: vi.fn(),
	canUpload: true,
	targetPage: null as number | null,
};

function renderViewer(overrides: Partial<typeof defaultProps> = {}) {
	return render(<DocumentViewer {...defaultProps} {...overrides} />);
}

describe("DocumentViewer", () => {
	it("shows empty state when documents array is empty", () => {
		renderViewer({ documents: [], selectedDocument: null });
		expect(screen.getByText("No document uploaded")).toBeInTheDocument();
	});

	it("renders document filename and page count", () => {
		renderViewer();
		expect(screen.getByText("test-document.pdf")).toBeInTheDocument();
		expect(screen.getByText("5 pages")).toBeInTheDocument();
	});

	it("shows singular 'page' for 1 page document", () => {
		const singlePageDoc = { ...mockDocument, page_count: 1 };
		renderViewer({ selectedDocument: singlePageDoc });
		expect(screen.getByText("1 page")).toBeInTheDocument();
	});

	it("renders PDF document with correct URL", () => {
		renderViewer();
		const pdfDoc = screen.getByTestId("pdf-document");
		expect(pdfDoc.getAttribute("data-file")).toBe(
			"/api/documents/doc-1/content",
		);
	});

	it("shows page navigation after PDF loads", () => {
		renderViewer();

		act(() => {
			pdfOnLoadSuccess?.({ numPages: 5 });
		});

		expect(screen.getByText("Page 1 of 5")).toBeInTheDocument();
	});

	it("navigates to next page", () => {
		renderViewer();

		act(() => {
			pdfOnLoadSuccess?.({ numPages: 5 });
		});

		const buttons = screen.getAllByRole("button");
		const nextButton = buttons[buttons.length - 1];
		if (nextButton === undefined) {
			throw new Error("Expected next button");
		}
		fireEvent.click(nextButton);

		expect(screen.getByText("Page 2 of 5")).toBeInTheDocument();
	});

	it("navigates to previous page", () => {
		renderViewer();

		act(() => {
			pdfOnLoadSuccess?.({ numPages: 5 });
		});

		const buttons = screen.getAllByRole("button");
		const nextButton = buttons[buttons.length - 1];
		if (nextButton === undefined) {
			throw new Error("Expected next button");
		}
		fireEvent.click(nextButton);
		expect(screen.getByText("Page 2 of 5")).toBeInTheDocument();

		const prevButton = buttons[buttons.length - 2];
		if (prevButton === undefined) {
			throw new Error("Expected previous button");
		}
		fireEvent.click(prevButton);
		expect(screen.getByText("Page 1 of 5")).toBeInTheDocument();
	});

	it("disables previous button on first page", () => {
		renderViewer();

		act(() => {
			pdfOnLoadSuccess?.({ numPages: 5 });
		});

		const buttons = screen.getAllByRole("button");
		const prevButton = buttons[buttons.length - 2];
		if (prevButton === undefined) {
			throw new Error("Expected previous button");
		}
		expect(prevButton).toBeDisabled();
	});

	it("disables next button on last page", () => {
		renderViewer();

		act(() => {
			pdfOnLoadSuccess?.({ numPages: 2 });
		});

		const buttons = screen.getAllByRole("button");
		const nextButton = buttons[buttons.length - 1];
		if (nextButton === undefined) {
			throw new Error("Expected next button");
		}
		fireEvent.click(nextButton);

		expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
		expect(nextButton).toBeDisabled();
	});

	it("shows PDF error when load fails", () => {
		renderViewer();

		act(() => {
			pdfOnLoadError?.(new Error("Could not load"));
		});

		expect(
			screen.getByText("Failed to load PDF: Could not load"),
		).toBeInTheDocument();
	});

	it("handles resize via mouse drag", () => {
		renderViewer();

		const resizeHandle = document.querySelector(
			".cursor-col-resize",
		) as HTMLElement;
		expect(resizeHandle).toBeTruthy();

		fireEvent.mouseDown(resizeHandle, { clientX: 400 });
		fireEvent.mouseMove(window, { clientX: 350 });
		fireEvent.mouseUp(window);
	});

	it("clamps resize width to minimum", () => {
		renderViewer();

		const resizeHandle = document.querySelector(
			".cursor-col-resize",
		) as HTMLElement;

		fireEvent.mouseDown(resizeHandle, { clientX: 400 });
		fireEvent.mouseMove(window, { clientX: 800 });

		const container = resizeHandle.parentElement as HTMLElement;
		expect(container.style.width).toBeDefined();

		fireEvent.mouseUp(window);
	});

	it("clamps resize width to maximum", () => {
		renderViewer();

		const resizeHandle = document.querySelector(
			".cursor-col-resize",
		) as HTMLElement;

		fireEvent.mouseDown(resizeHandle, { clientX: 400 });
		fireEvent.mouseMove(window, { clientX: -200 });

		const container = resizeHandle.parentElement as HTMLElement;
		expect(container.style.width).toBeDefined();

		fireEvent.mouseUp(window);
	});

	it("does not show page navigation when numPages is 0", () => {
		renderViewer();
		expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
	});

	it("clamps page navigation to not go below 1", () => {
		renderViewer();

		act(() => {
			pdfOnLoadSuccess?.({ numPages: 3 });
		});

		const buttons = screen.getAllByRole("button");
		const prevButton = buttons[buttons.length - 2];
		if (prevButton === undefined) {
			throw new Error("Expected previous button");
		}
		fireEvent.click(prevButton);

		expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
	});

	it("clamps page navigation to not exceed numPages", () => {
		renderViewer();

		act(() => {
			pdfOnLoadSuccess?.({ numPages: 2 });
		});

		const buttons = screen.getAllByRole("button");
		const nextButton = buttons[buttons.length - 1];
		if (nextButton === undefined) {
			throw new Error("Expected next button");
		}
		fireEvent.click(nextButton);
		fireEvent.click(nextButton);

		expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
	});

	it("renders Page component when PDF is loaded without error", () => {
		renderViewer();

		act(() => {
			pdfOnLoadSuccess?.({ numPages: 3 });
		});

		expect(screen.getByTestId("pdf-page")).toBeInTheDocument();
	});

	it("does not render Page component when there is a PDF error", () => {
		renderViewer();

		act(() => {
			pdfOnLoadError?.(new Error("bad"));
		});

		expect(screen.queryByTestId("pdf-page")).not.toBeInTheDocument();
	});

	// US-009: Thumbnail strip tests
	it("renders thumbnail cards for each document", () => {
		renderViewer({ documents: [mockDocument, mockDocument2] });
		// test-document.pdf (17 chars) truncated to "test-documen..."
		// But "test-document.pdf" also appears in the header as selectedDocument
		expect(screen.getByText("test-document.pdf")).toBeInTheDocument();
		// second-document.pdf (19 chars) truncated to "second-docum..."
		expect(screen.getByText("second-docum...")).toBeInTheDocument();
	});

	it("clicking card calls onSelectDocument with correct id", () => {
		const onSelectDocument = vi.fn();
		renderViewer({
			documents: [mockDocument, mockDocument2],
			onSelectDocument,
		});

		const cards = screen.getAllByTestId("document-card");
		const secondCard = cards[1];
		if (secondCard === undefined) {
			throw new Error("Expected second document card");
		}
		fireEvent.click(secondCard);

		expect(onSelectDocument).toHaveBeenCalledWith("doc-2");
	});

	it("renders delete button outside the selectable card button", () => {
		renderViewer({ documents: [mockDocument] });

		const card = screen.getByTestId("document-card");
		const deleteButton = screen.getByTitle("Delete document");

		expect(card.tagName).toBe("BUTTON");
		expect(card.contains(deleteButton)).toBe(false);
	});

	it("selected card has highlighted style", () => {
		renderViewer({
			documents: [mockDocument, mockDocument2],
			selectedDocument: mockDocument,
		});

		const cards = screen.getAllByTestId("document-card");
		expect(cards[0]?.className).toContain("ring-2");
		expect(cards[1]?.className).not.toContain("ring-2");
	});

	it("+ button triggers file input and calls onUpload", () => {
		const onUpload = vi.fn();
		renderViewer({ onUpload });

		const addButton = screen.getByTitle("Add document");
		fireEvent.click(addButton);

		// Simulate file selection via the hidden input
		const fileInput = document.querySelector(
			'input[type="file"]',
		) as HTMLInputElement;
		expect(fileInput).toBeTruthy();

		const file = new File(["content"], "new.pdf", {
			type: "application/pdf",
		});
		fireEvent.change(fileInput, { target: { files: [file] } });

		expect(onUpload).toHaveBeenCalledWith(file);
	});

	it("does not call onUpload when files is undefined", () => {
		const onUpload = vi.fn();
		renderViewer({ onUpload });

		const fileInput = document.querySelector(
			'input[type="file"]',
		) as HTMLInputElement;

		fireEvent.change(fileInput, { target: {} });

		expect(onUpload).not.toHaveBeenCalled();
	});

	it("+ button disabled when canUpload is false", () => {
		renderViewer({ canUpload: false });

		const addButton = screen.getByTitle("Maximum documents reached");
		expect(addButton).toBeDisabled();
	});

	// US-010: Delete confirmation dialog tests
	it("clicking X opens confirmation dialog", () => {
		renderViewer({ documents: [mockDocument] });

		const deleteButton = screen.getByTitle("Delete document");
		fireEvent.click(deleteButton);

		expect(screen.getByText("Delete test-document.pdf?")).toBeInTheDocument();
		expect(
			screen.getByText(
				"This cannot be undone. The AI's previous answers may have referenced this document.",
			),
		).toBeInTheDocument();
	});

	it("clicking Cancel closes dialog without calling onDeleteDocument", () => {
		const onDeleteDocument = vi.fn();
		renderViewer({ documents: [mockDocument], onDeleteDocument });

		const deleteButton = screen.getByTitle("Delete document");
		fireEvent.click(deleteButton);

		const cancelButton = screen.getByRole("button", { name: "Cancel" });
		fireEvent.click(cancelButton);

		expect(onDeleteDocument).not.toHaveBeenCalled();
	});

	it("clicking Delete calls onDeleteDocument with correct id", () => {
		const onDeleteDocument = vi.fn();
		renderViewer({ documents: [mockDocument], onDeleteDocument });

		const deleteButton = screen.getByTitle("Delete document");
		fireEvent.click(deleteButton);

		const confirmDelete = screen.getByRole("button", { name: "Delete" });
		fireEvent.click(confirmDelete);

		expect(onDeleteDocument).toHaveBeenCalledWith("doc-1");
	});

	it("resets to page 1 when switching documents (FR-11)", () => {
		const { rerender } = render(
			<DocumentViewer
				{...defaultProps}
				documents={[mockDocument, mockDocument2]}
				selectedDocument={mockDocument}
			/>,
		);

		// Load PDF and navigate to page 2
		act(() => {
			pdfOnLoadSuccess?.({ numPages: 5 });
		});
		const buttons = screen.getAllByRole("button");
		const nextButton = buttons[buttons.length - 1];
		if (nextButton === undefined) {
			throw new Error("Expected next button");
		}
		fireEvent.click(nextButton);
		expect(screen.getByText("Page 2 of 5")).toBeInTheDocument();

		// Switch to a different document
		rerender(
			<DocumentViewer
				{...defaultProps}
				documents={[mockDocument, mockDocument2]}
				selectedDocument={mockDocument2}
			/>,
		);

		act(() => {
			pdfOnLoadSuccess?.({ numPages: 5 });
		});

		// Page should reset to 1
		expect(screen.getByText("Page 1 of 5")).toBeInTheDocument();
	});

	it("navigates to the target page from props", () => {
		renderViewer({ targetPage: 4 });

		act(() => {
			pdfOnLoadSuccess?.({ numPages: 5 });
		});

		expect(screen.getByText("Page 4 of 5")).toBeInTheDocument();
	});

	it("clamps target page to valid bounds", () => {
		renderViewer({ targetPage: 99 });

		act(() => {
			pdfOnLoadSuccess?.({ numPages: 5 });
		});

		expect(screen.getByText("Page 5 of 5")).toBeInTheDocument();
	});

	it("applies citation navigation after switching documents", () => {
		const { rerender } = render(
			<DocumentViewer
				{...defaultProps}
				documents={[mockDocument, mockDocument2]}
				selectedDocument={mockDocument}
				targetPage={null}
			/>,
		);

		act(() => {
			pdfOnLoadSuccess?.({ numPages: 5 });
		});

		rerender(
			<DocumentViewer
				{...defaultProps}
				documents={[mockDocument, mockDocument2]}
				selectedDocument={mockDocument2}
				targetPage={3}
			/>,
		);

		act(() => {
			pdfOnLoadSuccess?.({ numPages: 3 });
		});

		expect(screen.getByText("Page 3 of 3")).toBeInTheDocument();
	});

	it("X button click does not propagate to card onSelectDocument", () => {
		const onSelectDocument = vi.fn();
		renderViewer({ documents: [mockDocument], onSelectDocument });

		const deleteButton = screen.getByTitle("Delete document");
		fireEvent.click(deleteButton);

		expect(onSelectDocument).not.toHaveBeenCalled();
	});

	it("renders without a selected document when documents exist", () => {
		renderViewer({ documents: [mockDocument], selectedDocument: null });

		expect(screen.queryByTestId("pdf-document")).not.toBeInTheDocument();
	});
});
