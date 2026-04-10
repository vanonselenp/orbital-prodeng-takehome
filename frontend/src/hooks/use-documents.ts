import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";
import type { Document } from "../types";

export function useDocuments(conversationId: string | null) {
	const [documents, setDocuments] = useState<Document[]>([]);
	const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(
		null,
	);
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const selectedDocument = useMemo(
		() => documents.find((d) => d.id === selectedDocumentId) ?? null,
		[documents, selectedDocumentId],
	);

	const canUpload = documents.length < 10;

	const refresh = useCallback(async () => {
		if (!conversationId) {
			setDocuments([]);
			setSelectedDocumentId(null);
			return;
		}
		try {
			setError(null);
			const detail = await api.fetchConversation(conversationId);
			setDocuments(detail.documents);
			setSelectedDocumentId((prev) => {
				const ids = detail.documents.map((d) => d.id);
				if (prev && ids.includes(prev)) return prev;
				return detail.documents[0]?.id ?? null;
			});
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to load documents",
			);
		}
	}, [conversationId]);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const selectDocument = useCallback((id: string) => {
		setSelectedDocumentId(id);
	}, []);

	const upload = useCallback(
		async (file: File) => {
			if (!conversationId) return null;
			try {
				setUploading(true);
				setError(null);
				const doc = await api.uploadDocument(conversationId, file);
				setDocuments((prev) => [...prev, doc]);
				setSelectedDocumentId(doc.id);
				return doc;
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to upload document",
				);
				return null;
			} finally {
				setUploading(false);
			}
		},
		[conversationId],
	);

	const remove = useCallback(
		async (id: string) => {
			/* v8 ignore start -- defensive guard; UI never calls remove without a conversationId */
			if (!conversationId) return;
			/* v8 ignore stop */
			try {
				setError(null);
				await api.deleteDocument(conversationId, id);
				setDocuments((prev) => {
					const next = prev.filter((d) => d.id !== id);
					setSelectedDocumentId((currentSelected) => {
						if (currentSelected === id) {
							return next[0]?.id ?? null;
						}
						return currentSelected;
					});
					return next;
				});
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to delete document",
				);
			}
		},
		[conversationId],
	);

	return {
		documents,
		selectedDocumentId,
		selectedDocument,
		canUpload,
		uploading,
		error,
		refresh,
		selectDocument,
		upload,
		remove,
	};
}
