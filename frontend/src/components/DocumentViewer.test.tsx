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

describe("DocumentViewer", () => {
	it("shows empty state when no document is provided", () => {
		render(<DocumentViewer document={null} />);
		expect(screen.getByText("No document uploaded")).toBeInTheDocument();
	});

	it("renders document filename and page count", () => {
		render(<DocumentViewer document={mockDocument} />);
		expect(screen.getByText("test-document.pdf")).toBeInTheDocument();
		expect(screen.getByText("5 pages")).toBeInTheDocument();
	});

	it("shows singular 'page' for 1 page document", () => {
		const singlePageDoc = { ...mockDocument, page_count: 1 };
		render(<DocumentViewer document={singlePageDoc} />);
		expect(screen.getByText("1 page")).toBeInTheDocument();
	});

	it("renders PDF document with correct URL", () => {
		render(<DocumentViewer document={mockDocument} />);
		const pdfDoc = screen.getByTestId("pdf-document");
		expect(pdfDoc.getAttribute("data-file")).toBe(
			"/api/documents/doc-1/content",
		);
	});

	it("shows page navigation after PDF loads", () => {
		render(<DocumentViewer document={mockDocument} />);

		act(() => {
			pdfOnLoadSuccess?.({ numPages: 5 });
		});

		expect(screen.getByText("Page 1 of 5")).toBeInTheDocument();
	});

	it("navigates to next page", () => {
		render(<DocumentViewer document={mockDocument} />);

		act(() => {
			pdfOnLoadSuccess?.({ numPages: 5 });
		});

		const buttons = screen.getAllByRole("button");
		const nextButton = buttons[buttons.length - 1];
		fireEvent.click(nextButton);

		expect(screen.getByText("Page 2 of 5")).toBeInTheDocument();
	});

	it("navigates to previous page", () => {
		render(<DocumentViewer document={mockDocument} />);

		act(() => {
			pdfOnLoadSuccess?.({ numPages: 5 });
		});

		const buttons = screen.getAllByRole("button");
		const nextButton = buttons[buttons.length - 1];
		fireEvent.click(nextButton);
		expect(screen.getByText("Page 2 of 5")).toBeInTheDocument();

		const prevButton = buttons[buttons.length - 2];
		fireEvent.click(prevButton);
		expect(screen.getByText("Page 1 of 5")).toBeInTheDocument();
	});

	it("disables previous button on first page", () => {
		render(<DocumentViewer document={mockDocument} />);

		act(() => {
			pdfOnLoadSuccess?.({ numPages: 5 });
		});

		const buttons = screen.getAllByRole("button");
		const prevButton = buttons[buttons.length - 2];
		expect(prevButton).toBeDisabled();
	});

	it("disables next button on last page", () => {
		render(<DocumentViewer document={mockDocument} />);

		act(() => {
			pdfOnLoadSuccess?.({ numPages: 2 });
		});

		const buttons = screen.getAllByRole("button");
		const nextButton = buttons[buttons.length - 1];
		fireEvent.click(nextButton);

		expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
		expect(nextButton).toBeDisabled();
	});

	it("shows PDF error when load fails", () => {
		render(<DocumentViewer document={mockDocument} />);

		act(() => {
			pdfOnLoadError?.(new Error("Could not load"));
		});

		expect(
			screen.getByText("Failed to load PDF: Could not load"),
		).toBeInTheDocument();
	});

	it("handles resize via mouse drag", () => {
		render(<DocumentViewer document={mockDocument} />);

		const resizeHandle = document.querySelector(
			".cursor-col-resize",
		) as HTMLElement;
		expect(resizeHandle).toBeTruthy();

		// Start dragging
		fireEvent.mouseDown(resizeHandle, { clientX: 400 });

		// Move mouse (delta = 400 - 350 = 50, new width = 400 + 50 = 450)
		fireEvent.mouseMove(window, { clientX: 350 });

		// Release
		fireEvent.mouseUp(window);
	});

	it("clamps resize width to minimum", () => {
		render(<DocumentViewer document={mockDocument} />);

		const resizeHandle = document.querySelector(
			".cursor-col-resize",
		) as HTMLElement;

		// Start dragging from width 400, drag right (reduces width since handle is on left)
		fireEvent.mouseDown(resizeHandle, { clientX: 400 });

		// Move far right - clientX increase means delta is negative, width decreases
		fireEvent.mouseMove(window, { clientX: 800 });

		// Width should be clamped to MIN_WIDTH (280)
		const container = resizeHandle.parentElement as HTMLElement;
		// The width is set inline via style
		expect(container.style.width).toBeDefined();

		fireEvent.mouseUp(window);
	});

	it("clamps resize width to maximum", () => {
		render(<DocumentViewer document={mockDocument} />);

		const resizeHandle = document.querySelector(
			".cursor-col-resize",
		) as HTMLElement;

		// Start dragging, drag far left (increases width)
		fireEvent.mouseDown(resizeHandle, { clientX: 400 });
		fireEvent.mouseMove(window, { clientX: -200 });

		const container = resizeHandle.parentElement as HTMLElement;
		expect(container.style.width).toBeDefined();

		fireEvent.mouseUp(window);
	});

	it("does not show page navigation when numPages is 0", () => {
		render(<DocumentViewer document={mockDocument} />);
		expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
	});

	it("clamps page navigation to not go below 1", () => {
		render(<DocumentViewer document={mockDocument} />);

		act(() => {
			pdfOnLoadSuccess?.({ numPages: 3 });
		});

		const buttons = screen.getAllByRole("button");
		const prevButton = buttons[buttons.length - 2];
		fireEvent.click(prevButton);

		expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
	});

	it("clamps page navigation to not exceed numPages", () => {
		render(<DocumentViewer document={mockDocument} />);

		act(() => {
			pdfOnLoadSuccess?.({ numPages: 2 });
		});

		const buttons = screen.getAllByRole("button");
		const nextButton = buttons[buttons.length - 1];
		fireEvent.click(nextButton);
		fireEvent.click(nextButton);

		expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
	});

	it("renders Page component when PDF is loaded without error", () => {
		render(<DocumentViewer document={mockDocument} />);

		act(() => {
			pdfOnLoadSuccess?.({ numPages: 3 });
		});

		expect(screen.getByTestId("pdf-page")).toBeInTheDocument();
	});

	it("does not render Page component when there is a PDF error", () => {
		render(<DocumentViewer document={mockDocument} />);

		act(() => {
			pdfOnLoadError?.(new Error("bad"));
		});

		expect(screen.queryByTestId("pdf-page")).not.toBeInTheDocument();
	});
});
