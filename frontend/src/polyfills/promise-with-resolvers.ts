interface PromiseWithResolversResult<T> {
	promise: Promise<T>;
	resolve: (value: T | PromiseLike<T>) => void;
	reject: (reason?: unknown) => void;
}

interface PromiseConstructorWithResolvers {
	withResolvers?: <T>() => PromiseWithResolversResult<T>;
}

export function installPromiseWithResolversPolyfill() {
	const promiseConstructor = Promise as PromiseConstructorWithResolvers;

	if (promiseConstructor.withResolvers) {
		return;
	}

	promiseConstructor.withResolvers = function withResolvers<T>() {
		let resolve: (value: T | PromiseLike<T>) => void = () => {
			throw new Error("Promise.withResolvers resolve was used before initialization");
		};
		let reject: (reason?: unknown) => void = () => {
			throw new Error("Promise.withResolvers reject was used before initialization");
		};

		const promise = new Promise<T>((resolvePromise, rejectPromise) => {
			resolve = resolvePromise;
			reject = rejectPromise;
		});

		return {
			promise,
			resolve,
			reject,
		};
	};
}

installPromiseWithResolversPolyfill();
