import "@testing-library/jest-dom";

// Polyfill ResizeObserver for jsdom (required by Radix ScrollArea)
global.ResizeObserver = class ResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
};
