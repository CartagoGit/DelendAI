/**
 * keep-connected.helper.ts — a failed connection is tried again.
 *
 * One attempt at activation left every view on its first answer for the rest
 * of the session: a window reloading among other extensions can miss the
 * window, and nothing asked again.
 */
export const RECONNECT_DELAYS_MS = [
	2_000, 5_000, 15_000, 30_000, 60_000,
] as const;

export const keepConnected = async (input: {
	readonly attempt: () => Promise<void>;
	readonly stopped: () => boolean;
	readonly onConnected: () => void;
	readonly onFailed: (failure: Error) => Promise<void> | void;
	readonly delays?: readonly number[];
	readonly wait?: (ms: number) => Promise<void>;
}): Promise<boolean> => {
	const delays = input.delays ?? RECONNECT_DELAYS_MS;
	const wait =
		input.wait ??
		((ms: number) =>
			new Promise<void>((resolve) => {
				setTimeout(resolve, ms);
			}));
	for (let index = 0; ; index += 1) {
		try {
			await input.attempt();
			input.onConnected();
			return true;
		} catch (error) {
			await input.onFailed(
				error instanceof Error ? error : new Error(String(error)),
			);
		}
		const delay = delays[index];
		if (delay === undefined) return false;
		await wait(delay);
		if (input.stopped()) return false;
	}
};
