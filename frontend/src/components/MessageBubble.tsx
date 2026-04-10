import { motion } from "framer-motion";
import { Bot } from "lucide-react";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import type { Citation, Message } from "../types";

interface MessageBubbleProps {
	message: Message;
	onCitationClick?: (citation: Citation) => void;
}

const REFUSAL_MESSAGE =
	"I can't answer that from the uploaded documents with a verifiable page citation.";

export function MessageBubble({
	message,
	onCitationClick,
}: MessageBubbleProps) {
	if (message.role === "system") {
		return (
			<motion.div
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: 0.2 }}
				className="flex justify-center py-2"
			>
				<p className="text-xs text-neutral-400">{message.content}</p>
			</motion.div>
		);
	}

	if (message.role === "user") {
		return (
			<motion.div
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.2 }}
				className="flex justify-end py-1.5"
			>
				<div className="max-w-[75%] rounded-2xl rounded-br-md bg-neutral-100 px-4 py-2.5">
					<p className="whitespace-pre-wrap text-sm text-neutral-800">
						{message.content}
					</p>
				</div>
			</motion.div>
		);
	}

	// Assistant message
	const isRefusal =
		message.citations.length === 0 && message.content === REFUSAL_MESSAGE;
	const bubbleClass = isRefusal
		? "rounded-2xl rounded-tl-md bg-amber-50 px-4 py-3 ring-1 ring-amber-200"
		: "";
	const citationCount = message.citations.length;

	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.2 }}
			className="flex gap-3 py-1.5"
		>
			<div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-neutral-900">
				<Bot className="h-4 w-4 text-white" />
			</div>
			<div className="min-w-0 max-w-[80%]">
				<div className={`prose ${bubbleClass}`.trim()}>
					<Streamdown>{message.content}</Streamdown>
				</div>
				{message.citations.length > 0 && (
					<div className="mt-2 flex flex-wrap gap-2">
						{message.citations.map((citation) => (
							<button
								key={`${citation.document_id}-${citation.page}`}
								type="button"
								className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-100"
								onClick={() => onCitationClick?.(citation)}
							>
								{citation.label}
							</button>
						))}
					</div>
				)}
				{citationCount > 0 && (
					<p className="mt-1.5 text-xs text-neutral-400">
						{citationCount} source
						{citationCount !== 1 ? "s" : ""} cited
					</p>
				)}
			</div>
		</motion.div>
	);
}

interface StreamingBubbleProps {
	content: string;
}

export function StreamingBubble({ content }: StreamingBubbleProps) {
	return (
		<div className="flex gap-3 py-1.5">
			<div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-neutral-900">
				<Bot className="h-4 w-4 text-white" />
			</div>
			<div className="min-w-0 max-w-[80%]">
				{content ? (
					<div className="prose">
						<Streamdown mode="streaming">{content}</Streamdown>
					</div>
				) : (
					<div className="flex items-center gap-1 py-2">
						<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400" />
						<span
							className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400"
							style={{ animationDelay: "0.15s" }}
						/>
						<span
							className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400"
							style={{ animationDelay: "0.3s" }}
						/>
					</div>
				)}
				<span className="inline-block h-4 w-0.5 animate-pulse bg-neutral-400" />
			</div>
		</div>
	);
}
