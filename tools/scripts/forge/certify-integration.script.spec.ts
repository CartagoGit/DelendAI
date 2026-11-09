/**
 * certify-integration.script.spec.ts — what the full runs of the
 * integration branch's tip concluded, the promotion's included.
 */
import { describe, expect, it } from 'vitest';

import {
	MAX_CANCELLED_FULL_RUNS,
	certificationOf,
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

describe('a run whose job timed out (x00641 S2)', () => {
	// What the forge reported for a job over its `timeout-minutes`
	// (run 36590926775): the job and the run both end `cancelled`.
	const timedOut = (): ICertificationRun =>
		run({ event: 'workflow_dispatch', conclusion: 'cancelled' });

	it('is not read as red', () => {
		expect(certificationOf([timedOut()], SHA)).toBe('uncertified');
	});

	it('reads red once the commit was cancelled the bounded number of times', () => {
		const runs = Array.from({ length: MAX_CANCELLED_FULL_RUNS }, timedOut);
		expect(certificationOf(runs.slice(1), SHA)).toBe('uncertified');
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
	});
});

describe('certificationOf — the promotion runs everything', () => {
	it("counts the promotion's own run, whose head is the integration branch", () => {
		const promotion = run({
			event: 'pull_request',
			head_branch: 'develop',
			conclusion: 'failure',
		});
		expect(certificationOf([promotion], SHA, 'develop')).toBe('red');
		expect(certificationOf([promotion], SHA)).toBe('uncertified');
		expect(
			certificationOf(
				[run({ event: 'pull_request', head_branch: 'feature' })],
				SHA,
				'develop',
			),
		).toBe('uncertified');
	});
});

describe('certificationOf', () => {
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

describe('a publication that goes green wakes the queue', () => {
	it('dispatches keep-the-queue-moving after a green delendai-validate on its own publication branches only', async () => {
		const { readFileSync } = await import('node:fs');
		const { join } = await import('node:path');
		const workflow = readFileSync(
			join(import.meta.dirname, '../../../.github/workflows/ci.yml'),
			'utf8',
		);
		const start = workflow.indexOf('    wake-the-queue:');
		const whole = workflow.slice(start, start + 1500);
		expect(start).toBeGreaterThan(0);
		expect(whole).toContain('needs: [delendai-validate]');
		expect(whole).toContain("needs.delendai-validate.result == 'success'");
		// A skipped upstream job would skip it without this.
		expect(whole).toContain('!cancelled()');
		expect(whole).toContain("startsWith(github.head_ref, 'delendai/pr/')");
		expect(whole).toContain('head.repo.full_name == github.repository');
		expect(whole).toContain('gh workflow run keep-the-queue-moving.yml');
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
