import { describe, expect, it } from "vitest";
import { stripPartialCitationBlock } from "./streaming-citations";

describe("stripPartialCitationBlock", () => {
	it("removes a complete citations block", () => {
		expect(
			stripPartialCitationBlock(
				'Answer\n<citations>[{"filename":"lease.pdf","page":1}]</citations>',
			),
		).toBe("Answer\n");
	});

	it("removes an open citations tag without a close tag", () => {
		expect(stripPartialCitationBlock("Answer\n<citations>")).toBe("Answer\n");
	});

	it("removes a partial citations tag suffix", () => {
		expect(stripPartialCitationBlock("Answer\n<cit")).toBe("Answer\n");
	});
});
