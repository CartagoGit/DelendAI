/**
 * rehearsal-time-budget.spec.ts — every wait of the harness has its own cap,
 * and the caps of the longest scenario path of each group, played with a
 * worker per scenario, fit inside the job timeout with a margin.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	REHEARSAL_GROUPING,
	REHEARSAL_JOB_TIMEOUT_MINUTES,
	REHEARSAL_SCAN_WAIT_CAP_SECONDS,
	REHEARSAL_TOKEN_WAIT_SECONDS,
} from '../../../../src/lib/contracts/constants/rehearsal.constant';
import { REHEARSAL_CATALOGUE } from '../../../../src/lib/contracts/constants/rehearsal-catalogue.constant';
import {
	allowedRunSeconds,
	planGroupBudget,
	runCapSeconds,
} from '../../../../src/lib/services/rehearsal-budget.helper';
import { partitionScenarios } from '../../../../src/lib/services/rehearsal-groups.helper';
import { scenariosForMode } from '../../../../src/lib/services/rehearsal.service';

const SECONDS_PER_MINUTE = 60;
const MODES = ['fast', 'real'] as const;

const groupsOf = (mode: (typeof MODES)[number]) =>
	partitionScenarios(
		scenariosForMode(REHEARSAL_CATALOGUE, mode),
		REHEARSAL_GROUPING[mode].size,
	);

describe('the rehearsal time budget', () => {
	it.each(MODES)(
		'[<20ms] fits the longest path of every %s group, a worker per scenario, inside the job timeout with a margin',
		(mode) => {
			const { awaitCapSeconds, awaitBudgetSeconds } =
				REHEARSAL_GROUPING[mode];
			for (const group of groupsOf(mode))
				expect(
					runCapSeconds(
						group,
						group.length,
						awaitCapSeconds,
						awaitBudgetSeconds,
					),
				).toBeLessThanOrEqual(allowedRunSeconds());
		},
	);

	it.each(MODES)(
		'[<50ms] runs %s with the budget and cap the plan derives, never hand-picked, and one more second would not fit',
		(mode) => {
			const plan = planGroupBudget(groupsOf(mode).flat());
			expect(REHEARSAL_GROUPING[mode].awaitBudgetSeconds).toBe(
				plan.awaitBudget,
			);
			expect(REHEARSAL_GROUPING[mode].awaitCapSeconds).toBe(
				plan.awaitCap,
			);
			const tight = groupsOf(mode).some(
				(group) =>
					runCapSeconds(
						group,
						group.length,
						plan.awaitBudget + 1,
						plan.awaitBudget + 1,
					) > allowedRunSeconds(),
			);
			expect(tight).toBe(true);
		},
	);

	it('[<20ms] gives a wait at least 600 s in fast mode and 900 s in real mode, the time a queued pull request needs', () => {
		expect(REHEARSAL_GROUPING.fast.awaitCapSeconds).toBeGreaterThanOrEqual(
			600,
		);
		expect(REHEARSAL_GROUPING.real.awaitCapSeconds).toBeGreaterThanOrEqual(
			900,
		);
		for (const mode of MODES)
			expect(
				REHEARSAL_GROUPING[mode].awaitCapSeconds,
			).toBeGreaterThanOrEqual(REHEARSAL_GROUPING[mode].awaitMinSeconds);
	});

	it('[<20ms] cuts fast into 4, 4 and 3 scenarios and real into 3, 3 and 3', () => {
		expect(groupsOf('fast').map((group) => group.length)).toEqual([
			4, 4, 3,
		]);
		expect(groupsOf('real').map((group) => group.length)).toEqual([
			3, 3, 3,
		]);
	});

	it('[<20ms] gives every await a cap below the job timeout, so no wait can run to it', () => {
		const job = REHEARSAL_JOB_TIMEOUT_MINUTES * SECONDS_PER_MINUTE;
		for (const cap of [
			REHEARSAL_GROUPING.fast.awaitBudgetSeconds,
			REHEARSAL_GROUPING.real.awaitBudgetSeconds,
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
		expect(/timeout-minutes:\s*45\b/u.test(workflow)).toBe(true);
		expect(REHEARSAL_JOB_TIMEOUT_MINUTES).toBe(45);
	});
});
