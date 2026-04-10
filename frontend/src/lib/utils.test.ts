import { describe, expect, it } from "vitest";
import { cn, relativeTime } from "./utils";

describe("cn", () => {
	it("merges tailwind classes", () => {
		expect(cn("px-2", "px-4")).toBe("px-4");
	});

	it("handles conditional classes", () => {
		expect(cn("base", false && "hidden")).toBe("base");
	});

	it("combines non-conflicting classes", () => {
		expect(cn("px-2", "py-4")).toBe("px-2 py-4");
	});
});

describe("relativeTime", () => {
	it("returns 'just now' for recent dates", () => {
		const now = new Date();
		now.setSeconds(now.getSeconds() - 30);
		expect(relativeTime(now.toISOString())).toBe("just now");
	});

	it("returns minutes ago", () => {
		const date = new Date();
		date.setMinutes(date.getMinutes() - 5);
		expect(relativeTime(date.toISOString())).toBe("5m ago");
	});

	it("returns hours ago", () => {
		const date = new Date();
		date.setHours(date.getHours() - 3);
		expect(relativeTime(date.toISOString())).toBe("3h ago");
	});

	it("returns days ago", () => {
		const date = new Date();
		date.setDate(date.getDate() - 2);
		expect(relativeTime(date.toISOString())).toBe("2d ago");
	});

	it("returns locale date string for older dates", () => {
		const date = new Date();
		date.setDate(date.getDate() - 10);
		expect(relativeTime(date.toISOString())).toBe(date.toLocaleDateString());
	});
});
