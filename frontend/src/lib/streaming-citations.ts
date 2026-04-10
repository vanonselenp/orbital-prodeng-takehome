const CITATION_BLOCK_PATTERN = /<citations>\s*(.*?)\s*<\/citations>/gs;
const CITATION_OPEN_TAG = "<citations>";

export function stripPartialCitationBlock(content: string): string {
	const withoutCompleteBlock = content.replace(CITATION_BLOCK_PATTERN, "");
	const tagStart = withoutCompleteBlock.indexOf(CITATION_OPEN_TAG);

	if (tagStart !== -1) {
		return withoutCompleteBlock.slice(0, tagStart);
	}

	for (
		let prefixLength = CITATION_OPEN_TAG.length - 1;
		prefixLength > 0;
		prefixLength -= 1
	) {
		if (
			withoutCompleteBlock.endsWith(CITATION_OPEN_TAG.slice(0, prefixLength))
		) {
			return withoutCompleteBlock.slice(0, -prefixLength);
		}
	}

	return withoutCompleteBlock;
}
