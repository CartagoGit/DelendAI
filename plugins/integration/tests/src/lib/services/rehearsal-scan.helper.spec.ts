import { describe, expect, it } from 'vitest';

import type { IRehearsalRun } from '../../../../src/lib/contracts/interfaces/rehearsal.interface';
import { scanStarted } from '../../../../src/lib/services/rehearsal-scan.helper';

const run = (over: Partial<IRehearsalRun>): IRehearsalRun => ({
	id: 1,
	workflow: 'rehearsal-scan',
	event: 'push',
	headBranch: 'b',
	headSha: 'tip',
	status: 'completed',
	actor: 'bot',
	createdAt: '2026-11-12T10:00:00Z',
	updatedAt: '2026-11-12T10:00:00Z',
	...over,
});

describe('scanStarted', () => {
	it('[<5ms] is true for the scan workflow pushed at the sha', () => {
		expect(scanStarted([run({})], 'tip')).toBe(true);
	});

	it('[<5ms] is false when only another workflow, another event or another sha ran', () => {
		expect(scanStarted([run({ workflow: 'land' })], 'tip')).toBe(false);
		expect(scanStarted([run({ event: 'pull_request' })], 'tip')).toBe(
			false,
		);
		expect(scanStarted([run({ headSha: 'other' })], 'tip')).toBe(false);
	});
});
