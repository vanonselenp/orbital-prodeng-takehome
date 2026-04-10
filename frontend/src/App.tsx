import { useCallback, useState } from "react";
import { ChatSidebar } from "./components/ChatSidebar";
import { ChatWindow } from "./components/ChatWindow";
import { DocumentViewer } from "./components/DocumentViewer";
import { TooltipProvider } from "./components/ui/tooltip";
import { useConversations } from "./hooks/use-conversations";
import { useDocuments } from "./hooks/use-documents";
import { useMessages } from "./hooks/use-messages";
import type { Citation } from "./types";

export default function App() {
	const [targetCitation, setTargetCitation] = useState<{
		citation: Citation;
		requestId: number;
	} | null>(null);

	const {
		conversations,
		selectedId,
		loading: conversationsLoading,
		create,
		select,
		remove,
		refresh: refreshConversations,
	} = useConversations();

	const {
		messages,
		loading: messagesLoading,
		error: messagesError,
		streaming,
		streamingContent,
		send,
	} = useMessages(selectedId);

	const {
		documents,
		selectedDocument,
		canUpload,
		error: documentError,
		upload,
		remove: removeDocument,
		selectDocument,
	} = useDocuments(selectedId);

	const handleSend = useCallback(
		async (content: string) => {
			setTargetCitation(null);
			await send(content);
			refreshConversations();
		},
		[send, refreshConversations],
	);

	const handleUpload = useCallback(
		async (file: File) => {
			setTargetCitation(null);
			const doc = await upload(file);
			if (doc) {
				refreshConversations();
			}
		},
		[upload, refreshConversations],
	);

	const handleDeleteDocument = useCallback(
		async (id: string) => {
			setTargetCitation((current) =>
				current?.citation.document_id === id ? null : current,
			);
			await removeDocument(id);
			refreshConversations();
		},
		[removeDocument, refreshConversations],
	);

	const handleSelectDocument = useCallback(
		(id: string) => {
			setTargetCitation(null);
			selectDocument(id);
		},
		[selectDocument],
	);

	const handleCitationClick = useCallback(
		(citation: Citation) => {
			selectDocument(citation.document_id);
			setTargetCitation((current) => ({
				citation,
				requestId: (current?.requestId ?? 0) + 1,
			}));
		},
		[selectDocument],
	);

	const handleCreate = useCallback(async () => {
		await create();
	}, [create]);

	return (
		<TooltipProvider delayDuration={200}>
			<div className="flex h-screen bg-neutral-50">
				<ChatSidebar
					conversations={conversations}
					selectedId={selectedId}
					loading={conversationsLoading}
					onSelect={select}
					onCreate={handleCreate}
					onDelete={remove}
				/>

				<ChatWindow
					messages={messages}
					loading={messagesLoading}
					error={messagesError}
					streaming={streaming}
					streamingContent={streamingContent}
					hasDocuments={documents.length > 0}
					conversationId={selectedId}
					onSend={handleSend}
					onUpload={handleUpload}
					canUpload={canUpload}
					onCitationClick={handleCitationClick}
				/>

				<DocumentViewer
					documents={documents}
					selectedDocument={selectedDocument}
					error={documentError}
					onSelectDocument={handleSelectDocument}
					onDeleteDocument={handleDeleteDocument}
					onUpload={handleUpload}
					canUpload={canUpload}
					targetPage={
						targetCitation?.citation.document_id === selectedDocument?.id
							? (targetCitation?.citation.page ?? null)
							: null
					}
					targetPageRequestId={targetCitation?.requestId ?? null}
				/>
			</div>
		</TooltipProvider>
	);
}
