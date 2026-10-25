/**
 * plan-quota.service.ts — what is left of an account's plan, asked of the
 * vendor's own tool and recorded for the account's quota groups.
 */
import type { IProviderAccount } from '@delendai/core/contracts';

import {
	PERCENT_LIMIT,
	PLAN_QUOTA_READERS,
	PLAN_QUOTA_READ_TIMEOUT_MS,
} from '../contracts/constants/plan-quota-reader.constant';
import type {
	IPlanQuotaFormat,
	IPlanQuotaRunner,
} from '../contracts/interfaces/plan-quota-reader.interface';
import type { IQuotaGroupWindow } from '../contracts/interfaces/quota-reservation.interface';
import { recordGroupObservation } from '../quota';
import { accountEnvironment } from './account-environment.service';

/** The pool every model of a MiniMax plan draws on. */
const MMX_GENERAL_POOL = 'general';

interface IMmxRemain {
	readonly model_name?: unknown;
	readonly end_time?: unknown;
	readonly weekly_end_time?: unknown;
	readonly current_interval_remaining_percent?: unknown;
	readonly current_weekly_remaining_percent?: unknown;
}

const percentWindow = (
	window: IQuotaGroupWindow['window'],
	remaining: unknown,
	endsAt: unknown,
): readonly IQuotaGroupWindow[] =>
	typeof remaining === 'number' && Number.isFinite(remaining)
		? [
				{
					window,
					unit: 'subscription-usage',
					limit: PERCENT_LIMIT,
					used:
						PERCENT_LIMIT -
						Math.max(0, Math.min(PERCENT_LIMIT, remaining)),
					resetAt:
						typeof endsAt === 'number' && Number.isFinite(endsAt)
							? new Date(endsAt).toISOString()
							: null,
				},
			]
		: [];

/**
 * `mmx quota show --output json`: the general pool's short window (five
 * hours, kept as the `hourly` window with its own reset) and its weekly
 * one, as percentages left. Anything else says nothing.
 */
export const parseMmxModelRemains = (
	output: string,
): readonly IQuotaGroupWindow[] => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(output);
	} catch {
		return [];
	}
	const remains = (parsed as { model_remains?: unknown } | null)
		?.model_remains;
	if (!Array.isArray(remains)) return [];
	const pools = remains as readonly IMmxRemain[];
	const general =
		pools.find((pool) => pool.model_name === MMX_GENERAL_POOL) ?? pools[0];
	if (general === undefined) return [];
	return [
		...percentWindow(
			'hourly',
			general.current_interval_remaining_percent,
			general.end_time,
		),
		...percentWindow(
			'weekly',
			general.current_weekly_remaining_percent,
			general.weekly_end_time,
		),
	];
};

const PARSERS: Readonly<
	Record<IPlanQuotaFormat, (output: string) => readonly IQuotaGroupWindow[]>
> = { 'mmx-model-remains': parseMmxModelRemains };

/**
 * Ask the account's vendor tool what is left and record it for the
 * account's groups. Runs in the environment a hop on the account would
 * have, so the tool reads that account's login. Returns whether anything
 * was recorded; a missing tool, a refusal or an unreadable answer records
 * nothing and never throws.
 */
export const observePlanQuota = async (input: {
	readonly account: IProviderAccount;
	readonly quotasPath: string;
	readonly parentEnv: Readonly<Record<string, string | undefined>>;
	readonly run: IPlanQuotaRunner;
	/** The workspace whose declared clients the reader's command is matched to. */
	readonly workspaceRoot: string;
	readonly now?: Date;
}): Promise<boolean> => {
	const { account } = input;
	const reader = PLAN_QUOTA_READERS.find(
		(each) => each.vendor === account.vendor,
	);
	if (reader === undefined || account.quotaGroups.length === 0) return false;
	const environment = accountEnvironment({
		command: reader.command,
		args: reader.args,
		account,
		accountId: account.accountId,
		parentEnv: input.parentEnv,
		workspaceRoot: input.workspaceRoot,
	});
	if (environment.kind === 'refused') return false;
	try {
		const answer = await input.run(
			reader.command,
			reader.args,
			environment.kind === 'isolated' ? environment.env : undefined,
			PLAN_QUOTA_READ_TIMEOUT_MS,
		);
		if (answer.code !== 0) return false;
		const windows = PARSERS[reader.format](answer.output);
		if (windows.length === 0) return false;
		await recordGroupObservation(
			input.quotasPath,
			account.quotaGroups,
			windows,
			input.now,
		);
		return true;
	} catch {
		return false;
	}
};
