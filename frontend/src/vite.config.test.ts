// @vitest-environment node

import viteConfig from "../vite.config";
import { describe, expect, it } from "vitest";

describe("vite config", () => {
	it("excludes mermaid but still allows streamdown optimization", () => {
		expect(viteConfig.optimizeDeps?.exclude).toContain("mermaid");
		expect(viteConfig.optimizeDeps?.exclude).not.toContain("streamdown");
	});
});
