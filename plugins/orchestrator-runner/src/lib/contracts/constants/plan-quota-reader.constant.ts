/**
 * plan-quota-reader.constant.ts — the vendor tools that read a plan's
 * quota without spending any of it.
 *
 * A window was observed only when a hop came back (rate-limit headers, a
 * 429). MiniMax's own CLI answers what is left of the plan's 5-hour and
 * weekly windows for free (`mmx quota show`), so the hold can judge the
 * account before its first hop. Adding a vendor is one entry here and a
 * parser for its format.
 */
import type { IPlanQuotaReader } from '../interfaces/plan-quota-reader.interface';

export const PLAN_QUOTA_READERS: readonly IPlanQuotaReader[] = [
	{
		vendor: 'minimax',
		command: 'mmx',
		args: ['quota', 'show', '--output', 'json', '--non-interactive'],
		format: 'mmx-model-remains',
	},
];

/** How long a reader may take before the hold goes on without it. */
export const PLAN_QUOTA_READ_TIMEOUT_MS = 20_000;

/** A percentage reading is kept as `used` of a limit of this. */
export const PERCENT_LIMIT = 100;
