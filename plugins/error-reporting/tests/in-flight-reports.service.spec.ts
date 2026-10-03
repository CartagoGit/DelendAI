import { describe, expect, it } from 'vitest';

import { createInFlightReports } from '../src/lib/in-flight-reports.service';

const deferred = () => {
	let resolve!: () => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<void>((ok, fail) => {
		resolve = ok;
		reject = fail;
	});
	return { promise, resolve, reject };
};

/** Lets every already-settled promise run its continuations. */
const flushed = async (): Promise<void> => {
	for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
};

describe('in-flight reports', () => {
	it('settles at once when nothing was fired', async () => {
		await expect(createInFlightReports().settle()).resolves.toBeUndefined();
	});

	it('waits for every report still in flight, whatever its outcome', async () => {
		const reports = createInFlightReports();
		const slow = deferred();
		const failing = deferred();
		reports.track(slow.promise);
		reports.track(failing.promise);
		let settled = false;
		const done = reports.settle().then(() => {
			settled = true;
		});
		await Promise.resolve();
		expect(settled).toBe(false);
		failing.reject(new Error('the report could not be sent'));
		await Promise.resolve();
		expect(settled).toBe(false);
		slow.resolve();
		await done;
		expect(settled).toBe(true);
	});

	it('also waits for a report fired while it was already settling', async () => {
		const reports = createInFlightReports();
		const first = deferred();
		const late = deferred();
		reports.track(first.promise);
		let settled = false;
		const done = reports.settle().then(() => {
			settled = true;
		});
		reports.track(late.promise);
		first.resolve();
		await flushed();
		expect(settled).toBe(false);
		late.resolve();
		await done;
		expect(settled).toBe(true);
	});
});
