import { describe, expect, it, vi } from "vitest";

interface PromiseWithResolversResult<T> {
	promise: Promise<T>;
	resolve: (value: T | PromiseLike<T>) => void;
	reject: (reason?: unknown) => void;
}

interface PromiseConstructorWithResolvers {
	withResolvers?: <T>() => PromiseWithResolversResult<T>;
}

describe("installPromiseWithResolversPolyfill", () => {
	it("installs Promise.withResolvers when it is missing", async () => {
		const promiseConstructor = Promise as PromiseConstructorWithResolvers;
		const original = promiseConstructor.withResolvers;
		const restore = vi.fn(() => {
			if (original) {
				promiseConstructor.withResolvers = original;
			} else {
				Reflect.deleteProperty(promiseConstructor, "withResolvers");
			}
		});

		Reflect.deleteProperty(promiseConstructor, "withResolvers");
		const { installPromiseWithResolversPolyfill } = await import(
			"./promise-with-resolvers"
		);

		installPromiseWithResolversPolyfill();

		const withResolvers = promiseConstructor.withResolvers;
		if (!withResolvers) {
			restore();
			throw new Error("Expected Promise.withResolvers to be defined");
		}

		const { promise, resolve } = withResolvers<string>();
		resolve("ok");

		await expect(promise).resolves.toBe("ok");
		restore();
	});

	it("leaves an existing Promise.withResolvers implementation untouched", async () => {
		const promiseConstructor = Promise as PromiseConstructorWithResolvers;
		const original = promiseConstructor.withResolvers;
		const nativeImpl = vi.fn(() => ({
			promise: Promise.resolve("native"),
			resolve: vi.fn(),
			reject: vi.fn(),
		})) as PromiseConstructorWithResolvers["withResolvers"];

		promiseConstructor.withResolvers = nativeImpl;
		const { installPromiseWithResolversPolyfill } = await import(
			"./promise-with-resolvers"
		);

		installPromiseWithResolversPolyfill();

		expect(promiseConstructor.withResolvers).toBe(nativeImpl);

		if (original) {
			promiseConstructor.withResolvers = original;
		} else {
			Reflect.deleteProperty(promiseConstructor, "withResolvers");
		}
	});
});
