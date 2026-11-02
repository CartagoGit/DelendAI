/**
 * Serialize asynchronous page paints while coalescing rapid navigation to the
 * latest requested view. A slow page may finish, but it can never be the final
 * repaint when the user selected another view while it was loading.
 */
export function createLatestTaskQueue<T>(runner: (value: T) => Promise<void>) {
	let pending: T | undefined;
	let running: Promise<void> | undefined;

	const drain = async (): Promise<void> => {
		while (pending !== undefined) {
			const next = pending;
			pending = undefined;
			await runner(next);
		}
	};

	return (value: T): Promise<void> => {
		pending = value;
		if (running === undefined) {
			running = drain().finally(() => {
				running = undefined;
			});
		}
		return running;
	};
}
