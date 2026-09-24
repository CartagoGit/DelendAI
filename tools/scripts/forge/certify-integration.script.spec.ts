/**
 * certify-integration.script.spec.ts — the integration branch's tip is
 * certified once, by a run that runs everything.
 */
import { describe, expect, it } from 'vitest';

import {
	needsCertification,
	type ICertificationRun,
} from './certify-integration.script';

const SHA = 'abc123';
const run = (over: Partial<ICertificationRun>): ICertificationRun => ({
	event: 'push',
	head_sha: SHA,
	conclusion: 'success',
	status: 'completed',
	...over,
});

describe('needsCertification', () => {
	it('is needed for a tip with no run at all, as after a bot merge', () => {
		expect(needsCertification([], SHA)).toBe(true);
	});

	it('is satisfied by a push or a dispatched run, finished or running', () => {
		expect(needsCertification([run({})], SHA)).toBe(false);
		expect(
			needsCertification(
				[
					run({
						event: 'workflow_dispatch',
						conclusion: null,
						status: 'in_progress',
					}),
				],
				SHA,
			),
		).toBe(false);
	});

	it('is not satisfied by a pull-request run, which may have run only part', () => {
		expect(needsCertification([run({ event: 'pull_request' })], SHA)).toBe(
			true,
		);
	});

	it('is not satisfied by a cancelled run or a run of another commit', () => {
		expect(
			needsCertification([run({ conclusion: 'cancelled' })], SHA),
		).toBe(true);
		expect(needsCertification([run({ head_sha: 'other' })], SHA)).toBe(
			true,
		);
	});
});
