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

		vi.advanceTimersByTime(149);
		await Promise.resolve();
		expect(refresh).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		await Promise.resolve();
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
		vi.advanceTimersByTime(200);
		await Promise.resolve();
		expect(refresh).toHaveBeenCalledTimes(1);

		debouncer.schedule();
		debouncer.schedule();
		vi.advanceTimersByTime(500);
		await Promise.resolve();
		expect(refresh).toHaveBeenCalledTimes(1);

		resolveRefresh?.();
		await Promise.resolve();
		vi.advanceTimersByTime(199);
		await Promise.resolve();
		expect(refresh).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(1);
		await Promise.resolve();
		expect(refresh).toHaveBeenCalledTimes(2);
	});

	it('cancel clears a pending timer before it fires', async () => {
		vi.useFakeTimers();
		const refresh = vi.fn(async () => undefined);
		const debouncer = createFreshnessDebouncer(refresh, { waitMs: 150 });

		debouncer.schedule();
		expect(vi.getTimerCount()).toBe(1);
		debouncer.cancel();
		expect(vi.getTimerCount()).toBe(0);
		vi.advanceTimersByTime(150);
		await Promise.resolve();
		expect(refresh).not.toHaveBeenCalled();
	});
});
