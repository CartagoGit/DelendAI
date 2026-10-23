/**
 * plan-quota.service.spec.ts — what a vendor's own tool says is left of a
 * plan, read in the account's environment and recorded for its groups.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { IProviderAccount } from '@delendai/core/contracts';
import { describe, expect, it } from 'vitest';

import type { IPlanQuotaRunner } from '../../../../src/lib/contracts/interfaces/plan-quota-reader.interface';
import {
	observePlanQuota,
	parseMmxModelRemains,
} from '../../../../src/lib/services/plan-quota.service';
import { nodeCliSpawner } from '../../../../src/lib/invoke/build-manager';
import { planQuotaRunnerOver } from '../../../../src/lib/services/plan-quota-runner.service';

const runPlanQuotaReader = planQuotaRunnerOver(nodeCliSpawner);

const FIVE_HOURS_END = Date.parse('2026-10-20T15:00:00.000Z');
const WEEK_END = Date.parse('2026-10-26T00:00:00.000Z');

/** The shape `mmx quota show --output json` answered on 2026-10-20. */
const mmxAnswer = (interval: number, weekly: number): string =>
	JSON.stringify({
		model_remains: [
			{
				model_name: 'video',
				current_interval_remaining_percent: 5,
				current_weekly_remaining_percent: 5,
			},
			{
				model_name: 'general',
				start_time: FIVE_HOURS_END - 5 * 3_600_000,
				end_time: FIVE_HOURS_END,
				weekly_end_time: WEEK_END,
				current_interval_remaining_percent: interval,
				current_weekly_remaining_percent: weekly,
			},
		],
	});

const account = (over: Partial<IProviderAccount> = {}): IProviderAccount => ({
	accountId: 'minimax-plan',
	vendor: 'minimax',
	credentialMode: 'official-subscription-login',
	billingMode: 'subscription-included',
	quotaGroups: ['minimax-5h'],
	permittedAutomation: true,
	...over,
});

describe('parseMmxModelRemains', () => {
	it('reads the general pool as percentages left, with their resets', () => {
		expect(parseMmxModelRemains(mmxAnswer(100, 73))).toEqual([
			{
				window: 'hourly',
				unit: 'subscription-usage',
				limit: 100,
				used: 0,
				resetAt: new Date(FIVE_HOURS_END).toISOString(),
			},
			{
				window: 'weekly',
				unit: 'subscription-usage',
				limit: 100,
				used: 27,
				resetAt: new Date(WEEK_END).toISOString(),
			},
		]);
	});

	it('says nothing from an answer it cannot read', () => {
		expect(parseMmxModelRemains('not json')).toEqual([]);
		expect(parseMmxModelRemains('{"model_remains": 3}')).toEqual([]);
		expect(parseMmxModelRemains('{"model_remains": []}')).toEqual([]);
	});
});

describe('observePlanQuota', () => {
	const run =
		(output: string, code = 0, seen: unknown[] = []): IPlanQuotaRunner =>
		async (command, args, env) => {
			seen.push({ command, args, env });
			return { code, output };
		};
	const quotas = () =>
		join(mkdtempSync(join(tmpdir(), 'plan-quota-')), 'q.json');

	it('records what is left for the account groups', async () => {
		const quotasPath = quotas();
		const seen: unknown[] = [];
		expect(
			await observePlanQuota({
				account: account(),
				quotasPath,
				parentEnv: { PATH: '/bin', HOME: '/h', SECRET_ELSEWHERE: 'x' },
				run: run(mmxAnswer(40, 90), 0, seen),
			}),
		).toBe(true);
		const written = JSON.parse(readFileSync(quotasPath, 'utf8')) as {
			groups: Record<string, { windows: { used: number }[] }>;
		};
		expect(
			written.groups['minimax-5h']?.windows.map((w) => w.used),
		).toEqual([60, 10]);
		// The tool runs with the account's environment, not the server's.
		expect(JSON.stringify(seen)).not.toContain('SECRET_ELSEWHERE');
		expect(JSON.stringify(seen)).toContain('"quota","show"');
	});

	it('records nothing for a vendor with no reader, a refused account or a failed answer', async () => {
		const quotasPath = quotas();
		const answer = run(mmxAnswer(40, 90));
		for (const each of [
			account({ vendor: 'anthropic' }),
			account({ permittedAutomation: false }),
			account({ quotaGroups: [] }),
		]) {
			expect(
				await observePlanQuota({
					account: each,
					quotasPath,
					parentEnv: {},
					run: answer,
				}),
			).toBe(false);
		}
		expect(
			await observePlanQuota({
				account: account(),
				quotasPath,
				parentEnv: {},
				run: run('', 1),
			}),
		).toBe(false);
		expect(
			await observePlanQuota({
				account: account(),
				quotasPath,
				parentEnv: {},
				run: async () => {
					throw new Error('spawn failed');
				},
			}),
		).toBe(false);
	});
});

describe('runPlanQuotaReader', () => {
	it('returns what the child printed and how it exited', async () => {
		expect(
			await runPlanQuotaReader(
				process.execPath,
				['-e', 'process.stdout.write("ok")'],
				undefined,
				10_000,
			),
		).toEqual({ code: 0, output: 'ok' });
		const failed = await runPlanQuotaReader(
			process.execPath,
			['-e', 'process.exit(3)'],
			{ PATH: process.env.PATH ?? '' },
			10_000,
		);
		expect(failed.code).toBe(3);
		expect(
			(
				await runPlanQuotaReader(
					'no-such-command-xyz',
					[],
					undefined,
					10_000,
				)
			).code,
		).not.toBe(0);
	});

	it('kills a reader that outlives its deadline', async () => {
		const answer = await runPlanQuotaReader(
			process.execPath,
			['-e', 'setTimeout(() => {}, 60_000)'],
			undefined,
			200,
		);
		expect(answer.code).toBe(1);
	});
});
