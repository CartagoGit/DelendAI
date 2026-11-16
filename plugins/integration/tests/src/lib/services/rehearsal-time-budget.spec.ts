/**
 * rehearsal-time-budget.spec.ts — every wait of the harness has its own cap,
 * and the caps of the longest scenario path, played at the default
 * concurrency, fit inside the job timeout with a margin.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	REHEARSAL_AWAIT_CAP_SECONDS,
	REHEARSAL_DEFAULT_CONCURRENCY,
	REHEARSAL_JOB_MARGIN_MINUTES,
	REHEARSAL_JOB_TIMEOUT_MINUTES,
	REHEARSAL_SCAN_WAIT_CAP_SECONDS,
	REHEARSAL_SETTLE_SECONDS,
	REHEARSAL_STEP_OVERHEAD_SECONDS,
	REHEARSAL_TOKEN_WAIT_SECONDS,
} from '../../../../src/lib/contracts/constants/rehearsal.constant';
import { REHEARSAL_CATALOGUE } from '../../../../src/lib/contracts/constants/rehearsal-catalogue.constant';
import type {
	IRehearsalScenario,
	IRehearsalStep,
} from '../../../../src/lib/contracts/interfaces/rehearsal.interface';

const SECONDS_PER_MINUTE = 60;

/** The longest a step can take: its own wait cap plus the allowance for its forge calls. */
const stepCapSeconds = (step: IRehearsalStep): number =>
	REHEARSAL_STEP_OVERHEAD_SECONDS +
	(step.kind === 'await'
		? REHEARSAL_AWAIT_CAP_SECONDS
		: step.kind === 'token-push' || step.kind === 'token-open'
			? REHEARSAL_TOKEN_WAIT_SECONDS
			: 0);

/** The longest a scenario can take: every step at its cap, then the settle read. */
const scenarioCapSeconds = (scenario: IRehearsalScenario): number =>
	scenario.steps.reduce((sum, step) => sum + stepCapSeconds(step), 0) +
	REHEARSAL_SETTLE_SECONDS;

/**
 * The longest a run can take with every wait at its cap: `limit` workers
 * list-scheduling the scenarios take at most the mean load plus the longest
 * job's share (Graham's bound), then the one log scan.
 */
const runCapSeconds = (
	scenarios: readonly IRehearsalScenario[],
	limit: number,
): number => {
	const caps = scenarios.map(scenarioCapSeconds);
	const sum = caps.reduce((total, one) => total + one, 0);
	const width = Math.min(limit, scenarios.length);
	return (
		sum / width +
		Math.max(...caps) * (1 - 1 / width) +
		REHEARSAL_SCAN_WAIT_CAP_SECONDS
	);
};

describe('the rehearsal time budget', () => {
	it('[<20ms] fits the longest scenario path, at the default concurrency, inside the job timeout with a margin', () => {
		const worst = runCapSeconds(
			REHEARSAL_CATALOGUE,
			REHEARSAL_DEFAULT_CONCURRENCY,
		);
		const allowed =
			(REHEARSAL_JOB_TIMEOUT_MINUTES - REHEARSAL_JOB_MARGIN_MINUTES) *
			SECONDS_PER_MINUTE;
		expect(worst).toBeLessThanOrEqual(allowed);
	});

	it('[<20ms] gives every await a cap below the job timeout, so no wait can run to it', () => {
		const job = REHEARSAL_JOB_TIMEOUT_MINUTES * SECONDS_PER_MINUTE;
		for (const cap of [
			REHEARSAL_AWAIT_CAP_SECONDS,
			REHEARSAL_SCAN_WAIT_CAP_SECONDS,
			REHEARSAL_TOKEN_WAIT_SECONDS,
		])
			expect(cap).toBeLessThan(job);
	});

	it('[<20ms] states the job timeout the workflow file carries', async () => {
		const workflow = await readFile(
			resolve(
				import.meta.dirname,
				'../../../../../../.github/workflows/rehearsal.yml',
			),
			'utf8',
		);
		expect(/timeout-minutes:\s*(\d+)/u.exec(workflow)?.[1]).toBe(
			String(REHEARSAL_JOB_TIMEOUT_MINUTES),
		);
	});
});
