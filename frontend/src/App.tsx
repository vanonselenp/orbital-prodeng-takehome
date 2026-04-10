import { useCallback } from "react";
import { ChatSidebar } from "./components/ChatSidebar";
import { ChatWindow } from "./components/ChatWindow";
import { DocumentViewer } from "./components/DocumentViewer";
import { TooltipProvider } from "./components/ui/tooltip";
import { useConversations } from "./hooks/use-conversations";
import { useDocuments } from "./hooks/use-documents";
import { useMessages } from "./hooks/use-messages";

export default function App() {
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
		upload,
		remove: removeDocument,
		selectDocument,
	} = useDocuments(selectedId);

	const handleSend = useCallback(
		async (content: string) => {
			await send(content);
			refreshConversations();
		},
		[send, refreshConversations],
	);

	const handleUpload = useCallback(
		async (file: File) => {
			const doc = await upload(file);
			if (doc) {
				refreshConversations();
			}
		},
		[upload, refreshConversations],
	);

	const handleDeleteDocument = useCallback(
		async (id: string) => {
			await removeDocument(id);
			refreshConversations();
		},
		[removeDocument, refreshConversations],
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
				/>

				<DocumentViewer
					documents={documents}
					selectedDocument={selectedDocument}
					onSelectDocument={selectDocument}
					onDeleteDocument={handleDeleteDocument}
					onUpload={handleUpload}
					canUpload={canUpload}
				/>
			</div>
		</TooltipProvider>
	);
}
