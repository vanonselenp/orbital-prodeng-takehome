import {
	ChevronLeft,
	ChevronRight,
	FileText,
	Loader2,
	Plus,
	X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Document as PDFDocument, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { getDocumentUrl } from "../lib/api";
import type { Document } from "../types";
import { Button } from "./ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "./ui/dialog";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
	"pdfjs-dist/build/pdf.worker.min.mjs",
	import.meta.url,
).toString();

const MIN_WIDTH = 280;
const MAX_WIDTH = 700;
const DEFAULT_WIDTH = 400;

interface DocumentViewerProps {
	documents: Document[];
	selectedDocument: Document | null;
	onSelectDocument: (id: string) => void;
	onDeleteDocument: (id: string) => void;
	onUpload: (file: File) => void;
	canUpload: boolean;
	targetPage?: number | null;
}

function truncateFilename(name: string, maxLen = 15): string {
	if (name.length <= maxLen) return name;
	return `${name.slice(0, maxLen - 3)}...`;
}

export function DocumentViewer({
	documents,
	selectedDocument,
	onSelectDocument,
	onDeleteDocument,
	onUpload,
	canUpload,
	targetPage = null,
}: DocumentViewerProps) {
	const [numPages, setNumPages] = useState<number>(0);
	const [currentPage, setCurrentPage] = useState(1);
	const [pdfLoading, setPdfLoading] = useState(true);
	const [pdfError, setPdfError] = useState<string | null>(null);
	const [width, setWidth] = useState(DEFAULT_WIDTH);
	const [dragging, setDragging] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<Document | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	// Reset page when selectedDocument changes
	const selectedDocId = selectedDocument?.id ?? null;
	const prevSelectedDocId = useRef(selectedDocId);
	useEffect(() => {
		if (prevSelectedDocId.current !== selectedDocId) {
			setCurrentPage(1);
			setNumPages(0);
			setPdfLoading(true);
			setPdfError(null);
			prevSelectedDocId.current = selectedDocId;
		}
	});

	useEffect(() => {
		if (selectedDocument === null || targetPage === null) {
			return;
		}

		const maxPage = numPages > 0 ? numPages : selectedDocument.page_count;
		setCurrentPage(Math.min(maxPage, Math.max(1, targetPage)));
	}, [numPages, selectedDocument, targetPage]);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			setDragging(true);

			const startX = e.clientX;
			const startWidth = width;

			const handleMouseMove = (moveEvent: MouseEvent) => {
				const delta = startX - moveEvent.clientX;
				const newWidth = Math.min(
					MAX_WIDTH,
					Math.max(MIN_WIDTH, startWidth + delta),
				);
				setWidth(newWidth);
			};

			const handleMouseUp = () => {
				setDragging(false);
				window.removeEventListener("mousemove", handleMouseMove);
				window.removeEventListener("mouseup", handleMouseUp);
			};

			window.addEventListener("mousemove", handleMouseMove);
			window.addEventListener("mouseup", handleMouseUp);
		},
		[width],
	);

	const handleFileChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (file) {
				onUpload(file);
			}
			// Reset input so the same file can be selected again
			e.target.value = "";
		},
		[onUpload],
	);

	const pdfPageWidth = width - 48; // account for px-4 padding on each side

	if (documents.length === 0) {
		return (
			<div
				style={{ width }}
				className="flex h-full flex-shrink-0 flex-col items-center justify-center border-l border-neutral-200 bg-neutral-50"
			>
				<FileText className="mb-3 h-10 w-10 text-neutral-300" />
				<p className="text-sm text-neutral-400">No document uploaded</p>
			</div>
		);
	}

	const pdfUrl = selectedDocument
		? getDocumentUrl(selectedDocument.id)
		: undefined;

	return (
		<div
			ref={containerRef}
			style={{ width }}
			className="relative flex h-full flex-shrink-0 flex-col border-l border-neutral-200 bg-white"
		>
			{/* Resize handle */}
			<div
				className={`absolute top-0 left-0 z-10 h-full w-1.5 cursor-col-resize transition-colors hover:bg-neutral-300 ${
					dragging ? "bg-neutral-400" : ""
				}`}
				onMouseDown={handleMouseDown}
			/>

			{/* Thumbnail strip */}
			<div className="flex items-center gap-2 overflow-x-auto border-b border-neutral-100 px-4 py-2">
				{documents.map((doc) => (
					<button
						key={doc.id}
						type="button"
						data-testid="document-card"
						className={`relative flex flex-shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition-colors ${
							selectedDocument?.id === doc.id
								? "border-primary ring-2 ring-primary bg-primary/5"
								: "border-neutral-200 hover:border-neutral-300"
						}`}
						onClick={() => onSelectDocument(doc.id)}
					>
						<FileText className="h-3.5 w-3.5 flex-shrink-0 text-neutral-400" />
						<span className="truncate">{truncateFilename(doc.filename)}</span>
						<button
							type="button"
							title="Delete document"
							className="ml-1 flex-shrink-0 rounded-sm p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
							onClick={(e) => {
								e.stopPropagation();
								setDeleteTarget(doc);
							}}
						>
							<X className="h-3 w-3" />
						</button>
					</button>
				))}
				<button
					type="button"
					title={canUpload ? "Add document" : "Maximum documents reached"}
					disabled={!canUpload}
					className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-dashed border-neutral-300 text-neutral-400 transition-colors hover:border-neutral-400 hover:text-neutral-500 disabled:cursor-not-allowed disabled:opacity-50"
					onClick={() => fileInputRef.current?.click()}
				>
					<Plus className="h-4 w-4" />
				</button>
				<input
					ref={fileInputRef}
					type="file"
					accept=".pdf"
					className="hidden"
					onChange={handleFileChange}
				/>
			</div>

			{/* Header */}
			{selectedDocument && (
				<div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
					<div className="min-w-0">
						<p className="truncate text-sm font-medium text-neutral-800">
							{selectedDocument.filename}
						</p>
						<p className="text-xs text-neutral-400">
							{selectedDocument.page_count} page
							{selectedDocument.page_count !== 1 ? "s" : ""}
						</p>
					</div>
				</div>
			)}

			{/* PDF content */}
			{selectedDocument && (
				<div className="flex-1 overflow-y-auto p-4">
					{pdfError && (
						<div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
							{pdfError}
						</div>
					)}

					<PDFDocument
						file={pdfUrl}
						onLoadSuccess={({ numPages: pages }) => {
							setNumPages(pages);
							setPdfLoading(false);
							setPdfError(null);
						}}
						onLoadError={(error) => {
							setPdfError(`Failed to load PDF: ${error.message}`);
							setPdfLoading(false);
						}}
						loading={
							<div className="flex items-center justify-center py-12">
								<Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
							</div>
						}
					>
						{!pdfLoading && !pdfError && (
							<Page
								pageNumber={currentPage}
								width={pdfPageWidth}
								loading={
									<div className="flex items-center justify-center py-12">
										<Loader2 className="h-5 w-5 animate-spin text-neutral-300" />
									</div>
								}
							/>
						)}
					</PDFDocument>
				</div>
			)}

			{/* Page navigation */}
			{numPages > 0 && (
				<div className="flex items-center justify-center gap-3 border-t border-neutral-100 px-4 py-2.5">
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7"
						disabled={currentPage <= 1}
						onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
					>
						<ChevronLeft className="h-4 w-4" />
					</Button>
					<span className="text-xs text-neutral-500">
						Page {currentPage} of {numPages}
					</span>
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7"
						disabled={currentPage >= numPages}
						onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
					>
						<ChevronRight className="h-4 w-4" />
					</Button>
				</div>
			)}

			{/* Delete confirmation dialog */}
			<Dialog
				open={deleteTarget !== null}
				onOpenChange={/* v8 ignore next — Radix internal callback triggered by overlay/escape, not reachable via testing-library */ (open) => {
					if (!open) setDeleteTarget(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete {deleteTarget?.filename}?</DialogTitle>
						<DialogDescription>
							This cannot be undone. The AI&apos;s previous answers may have
							referenced this document.
						</DialogDescription>
					</DialogHeader>
					<div className="flex justify-end gap-2">
						<Button variant="secondary" onClick={() => setDeleteTarget(null)}>
							Cancel
						</Button>
						{/* v8 ignore start -- dialog confirm button only exists when deleteTarget is present; v8 still reports an unreachable branch on the guarded callback */}
						<Button
							variant="destructive"
							onClick={() => {
								if (deleteTarget) {
									onDeleteDocument(deleteTarget.id);
								}
								setDeleteTarget(null);
							}}
						>
							Delete
						</Button>
						{/* v8 ignore stop */}
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
