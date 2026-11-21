import { join } from 'node:path';

import type { RunnerTestCase } from 'vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestRunner } from 'vitest';

import { fakePartial } from '../../../src/lib/fake-partial.helper';
import {
	CHANGED_ENV,
	LOAD_FACTOR_ENV,
	MIGRATION_ROOT_ENV,
	SOFT_OVERRUN_ENV,
} from '../../../src/contracts/constants/time-budget.constant';

const ROOT = '/repo';
const SPEC = 'packages/x/tests/a.e2e.spec.ts';

/** A runner whose test body "takes" `tookMs` on a clock the body moves. */
const runOver = async (changed: string, tookMs: number) => {
	vi.resetModules();
	let clock = 0;
	vi.spyOn(performance, 'now').mockImplementation(() => clock);
	vi.spyOn(TestRunner, 'getTestFn').mockReturnValue(() => {
		clock = tookMs;
	});
	vi.stubEnv(MIGRATION_ROOT_ENV, ROOT);
	vi.stubEnv(CHANGED_ENV, changed);
	vi.stubEnv(LOAD_FACTOR_ENV, '1');
	vi.stubEnv(SOFT_OVERRUN_ENV, '0');
	const { default: Runner } = await import(
		'../../../src/lib/time-budget/time-budget-runner.helper'
	);
	const runner = new Runner(
		fakePartial<ConstructorParameters<typeof Runner>[0]>({
			experimental: {
				importDurations: {
					print: false,
					limit: 0,
					failOnDanger: false,
					thresholds: { warn: 0, danger: 0 },
				},
				viteModuleRunner: true,
				nodeLoader: false,
				openTelemetry: undefined,
			},
		}),
	);
	const meta: Record<string, unknown> = {};
	const test = fakePartial<RunnerTestCase, 'name' | 'file' | 'meta'>({
		name: '[<50ms] does x',
		file: fakePartial<RunnerTestCase['file']>({
			name: SPEC,
			filepath: join(ROOT, SPEC),
		}),
		meta,
	});
	const run = runner.runTask(test);
	return { run, meta };
};

describe('the time budget runner', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});

	it('[<200ms] reports and passes an e2e overrun in a spec the change does not touch', async () => {
		const { run, meta } = await runOver('other.ts', 500);
		await expect(run).resolves.toBeUndefined();
		const { budgetTookMs } = meta;
		expect(budgetTookMs).toBe(500);
	});

	it('[<200ms] fails an e2e overrun in a spec the change touches', async () => {
		const { run } = await runOver(SPEC, 500);
		await expect(run).rejects.toThrow('e2e tier');
	});
});
