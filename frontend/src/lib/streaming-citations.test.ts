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

	it("removes repeated complete citations blocks", () => {
		expect(
			stripPartialCitationBlock(
				'Answer\n<citations>[{"filename":"lease.pdf","page":1}]</citations>More\n<citations>[{"filename":"lease.pdf","page":2}]</citations>',
			),
		).toBe("Answer\nMore\n");
	});

	it("removes trailing partial citations markup after a complete block", () => {
		expect(
			stripPartialCitationBlock(
				'Answer\n<citations>[{"filename":"lease.pdf","page":1}]</citations><citations>{bad json}',
			),
		).toBe("Answer\n");
	});
});
