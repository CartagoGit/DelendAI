/**
 * certify-integration.script.spec.ts — the integration branch's tip is
 * certified once, by a run that runs everything.
 */
import { describe, expect, it } from 'vitest';

import {
	MAX_CANCELLED_FULL_RUNS,
	certificationOf,
	needsCertification,
	type ICertificationRun,
	certificationRecord,
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

describe('a run whose job timed out (x00641 S2)', () => {
	// What the forge reported for a job over its `timeout-minutes`
	// (run 36590926775): the job and the run both end `cancelled`.
	const timedOut = (): ICertificationRun =>
		run({ event: 'workflow_dispatch', conclusion: 'cancelled' });

	it('is run again, not read as red', () => {
		expect(needsCertification([timedOut()], SHA)).toBe(true);
		expect(certificationOf([timedOut()], SHA)).toBe('uncertified');
	});

	it('stops being started once the commit was cancelled the bounded number of times', () => {
		const runs = Array.from({ length: MAX_CANCELLED_FULL_RUNS }, timedOut);
		expect(needsCertification(runs.slice(1), SHA)).toBe(true);
		expect(needsCertification(runs, SHA)).toBe(false);
		expect(certificationOf(runs, SHA)).toBe('red');
	});

	it('lets a run that finished decide, whatever was cancelled before it', () => {
		const cancelled = Array.from(
			{ length: MAX_CANCELLED_FULL_RUNS },
			timedOut,
		);
		expect(certificationOf([...cancelled, run({})], SHA)).toBe('certified');
		expect(
			certificationOf(
				[
					...cancelled,
					run({ status: 'in_progress', conclusion: null }),
				],
				SHA,
			),
		).toBe('pending');
		expect(needsCertification([timedOut(), run({})], SHA)).toBe(false);
	});
});

describe('certificationOf — what the queue waits for', () => {
	it('is uncertified with no full run, as right after a bot merge', () => {
		expect(certificationOf([], SHA)).toBe('uncertified');
		expect(certificationOf([run({ event: 'pull_request' })], SHA)).toBe(
			'uncertified',
		);
	});

	it('is pending while a full run is still going', () => {
		expect(
			certificationOf(
				[
					run({
						event: 'workflow_dispatch',
						status: 'in_progress',
						conclusion: null,
					}),
				],
				SHA,
			),
		).toBe('pending');
	});

	it('is red when every full run finished and none passed', () => {
		expect(certificationOf([run({ conclusion: 'failure' })], SHA)).toBe(
			'red',
		);
	});

	it('is certified by one green full run, whatever else ran', () => {
		expect(
			certificationOf(
				[
					run({ conclusion: 'failure' }),
					run({ event: 'workflow_dispatch', conclusion: 'success' }),
				],
				SHA,
			),
		).toBe('certified');
	});

	it('ignores cancelled runs, pull-request runs and other commits', () => {
		expect(
			certificationOf(
				[
					run({ conclusion: 'cancelled' }),
					run({ event: 'pull_request', conclusion: 'success' }),
					run({ head_sha: 'other', conclusion: 'success' }),
				],
				SHA,
			),
		).toBe('uncertified');
	});
});

describe('a certified integration branch releases the queue (x00637 S4)', () => {
	it('dispatches keep-the-queue-moving after delendai-validate, on non-PR runs only', async () => {
		const { readFileSync } = await import('node:fs');
		const { join } = await import('node:path');
		const workflow = readFileSync(
			join(import.meta.dirname, '../../../.github/workflows/ci.yml'),
			'utf8',
		);
		const job = workflow.slice(workflow.indexOf('    release-the-queue:'));
		expect(job).toContain('needs: [delendai-validate]');
		expect(job).toContain("github.event_name != 'pull_request'");
		expect(job).toContain('actions: write');
		expect(job).toContain('gh workflow run keep-the-queue-moving.yml');
	});
});

describe('certificationRecord', () => {
	const now = new Date('2026-09-26T10:00:00Z');

	it('records a finished run, green or red', () => {
		expect(certificationRecord('', 'abc', 'certified', now)).toBe(
			`${JSON.stringify({ sha: 'abc', state: 'certified', timestamp: now.toISOString() })}\n`,
		);
		expect(certificationRecord('', 'abc', 'red', now)).toContain('"red"');
	});

	it('records nothing for a run still going or never started', () => {
		expect(certificationRecord('', 'abc', 'pending', now)).toBeUndefined();
		expect(
			certificationRecord('', 'abc', 'uncertified', now),
		).toBeUndefined();
	});

	it('records the same verdict for the same commit once, and a change of verdict again', () => {
		const first = certificationRecord('', 'abc', 'red', now) ?? '';
		expect(certificationRecord(first, 'abc', 'red', now)).toBeUndefined();
		expect(certificationRecord(first, 'abc', 'certified', now)).toContain(
			'"certified"',
		);
		expect(certificationRecord(first, 'def', 'red', now)).toContain(
			'"def"',
		);
	});
});
