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
	REHEARSAL_AWAIT_MIN_SECONDS,
	REHEARSAL_JOB_TIMEOUT_MINUTES,
	REHEARSAL_SCAN_WAIT_CAP_SECONDS,
	REHEARSAL_TOKEN_WAIT_SECONDS,
} from '../../../../src/lib/contracts/constants/rehearsal.constant';
import { REHEARSAL_CATALOGUE } from '../../../../src/lib/contracts/constants/rehearsal-catalogue.constant';
import {
	allowedRunSeconds,
	planRehearsalBudget,
	runCapSeconds,
} from '../../../../src/lib/services/rehearsal-budget.helper';
import { DEFAULT_INTEGRATION_OPTIONS } from '@delendai/core/cli';

const SECONDS_PER_MINUTE = 60;

describe('the rehearsal time budget', () => {
	it('[<20ms] fits the longest scenario path, at the default concurrency, inside the job timeout with a margin', () => {
		const worst = runCapSeconds(
			REHEARSAL_CATALOGUE,
			REHEARSAL_DEFAULT_CONCURRENCY,
			REHEARSAL_AWAIT_CAP_SECONDS,
		);
		expect(worst).toBeLessThanOrEqual(allowedRunSeconds());
	});

	it('[<50ms] runs with the await cap and the concurrency the plan derives, never hand-picked', () => {
		const plan = planRehearsalBudget(
			REHEARSAL_CATALOGUE,
			DEFAULT_INTEGRATION_OPTIONS.rehearsal.concurrency,
		);
		expect(REHEARSAL_AWAIT_CAP_SECONDS).toBe(plan.awaitCap);
		expect(REHEARSAL_DEFAULT_CONCURRENCY).toBe(plan.concurrency);
		expect(DEFAULT_INTEGRATION_OPTIONS.rehearsal.concurrency).toBe(
			plan.concurrency,
		);
		expect(plan.awaitCap).toBeGreaterThanOrEqual(
			REHEARSAL_AWAIT_MIN_SECONDS,
		);
	});

	it('[<50ms] takes the fewest workers that allow the least cap, and one more second of cap would not fit', () => {
		const plan = planRehearsalBudget(REHEARSAL_CATALOGUE, 1);
		expect(
			runCapSeconds(
				REHEARSAL_CATALOGUE,
				plan.concurrency,
				plan.awaitCap + 1,
			),
		).toBeGreaterThan(allowedRunSeconds());
		if (plan.concurrency > 1)
			expect(
				planRehearsalBudget(REHEARSAL_CATALOGUE, plan.concurrency - 1)
					.concurrency,
			).toBe(plan.concurrency);
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
