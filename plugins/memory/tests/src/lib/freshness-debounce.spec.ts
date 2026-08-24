import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFreshnessDebouncer } from '../../../src/lib/services/freshness-debounce';

describe('freshness debounce', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('coalesces repeated invalidations into one refresh', async () => {
		vi.useFakeTimers();
		const refresh = vi.fn(async () => undefined);
		const debouncer = createFreshnessDebouncer(refresh, { waitMs: 150 });

		debouncer.schedule();
		debouncer.schedule();
		debouncer.schedule();

		await vi.advanceTimersByTimeAsync(149);
		expect(refresh).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(refresh).toHaveBeenCalledTimes(1);
	});

	it('runs one follow-up refresh after an in-flight invalidation burst', async () => {
		vi.useFakeTimers();
		let resolveRefresh: (() => void) | undefined;
		const refresh = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					resolveRefresh = resolve;
				}),
		);
		const debouncer = createFreshnessDebouncer(refresh, { waitMs: 200 });

		debouncer.schedule();
		await vi.advanceTimersByTimeAsync(200);
		expect(refresh).toHaveBeenCalledTimes(1);

		debouncer.schedule();
		debouncer.schedule();
		await vi.advanceTimersByTimeAsync(500);
		expect(refresh).toHaveBeenCalledTimes(1);

		resolveRefresh?.();
		await Promise.resolve();
		await vi.advanceTimersByTimeAsync(199);
		expect(refresh).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(refresh).toHaveBeenCalledTimes(2);
	});
});
