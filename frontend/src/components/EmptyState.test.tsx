import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
	it("renders heading and description", () => {
		render(<EmptyState onUpload={vi.fn()} />);
		expect(
			screen.getByText("Upload a document to get started"),
		).toBeInTheDocument();
		expect(
			screen.getByText(/Ask questions about leases/),
		).toBeInTheDocument();
	});
});
