const DEFAULT_WAIT_MS = 250;
const MIN_WAIT_MS = 100;
const MAX_WAIT_MS = 500;

const clampWaitMs = (value?: number): number => {
	if (!Number.isFinite(value)) return DEFAULT_WAIT_MS;
	return Math.max(
		MIN_WAIT_MS,
		Math.min(MAX_WAIT_MS, Math.floor(value ?? DEFAULT_WAIT_MS)),
	);
};

/**
 * Coalesce repeated freshness invalidations into one async refresh.
 * If invalidations arrive while a refresh is running, exactly one
 * follow-up refresh is scheduled once the in-flight one settles.
 */
export const createFreshnessDebouncer = (
	refresh: () => Promise<void>,
	options: {
		waitMs?: number;
		setTimer?: typeof setTimeout;
		clearTimer?: typeof clearTimeout;
	} = {},
) => {
	const waitMs = clampWaitMs(options.waitMs);
	const setTimer = options.setTimer ?? setTimeout;
	const clearTimer = options.clearTimer ?? clearTimeout;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let refreshInFlight: Promise<void> | null = null;
	let rerunAfterFlight = false;

	const clearPendingTimer = (): void => {
		if (timer !== undefined) {
			clearTimer(timer);
			timer = undefined;
		}
	};

	const runRefresh = (): Promise<void> => {
		clearPendingTimer();
		rerunAfterFlight = false;
		const promise = Promise.resolve(refresh()).finally(() => {
			refreshInFlight = null;
			if (rerunAfterFlight) schedule();
		});
		refreshInFlight = promise;
		return promise;
	};

	const schedule = (): void => {
		if (refreshInFlight !== null) {
			rerunAfterFlight = true;
			return;
		}
		clearPendingTimer();
		timer = setTimer(() => {
			void runRefresh();
		}, waitMs);
	};

	return {
		schedule,
		flush: async (): Promise<void> => {
			if (timer !== undefined) {
				await runRefresh();
				return;
			}
			await refreshInFlight;
		},
		cancel: (): void => {
			clearPendingTimer();
			rerunAfterFlight = false;
		},
	};
};
