/**
 * plan-quota-reader.constant.ts — the vendor tools that read a plan's
 * quota without spending any of it.
 *
 * A window was observed only when a hop came back (rate-limit headers, a
 * 429). MiniMax's own CLI answers what is left of the plan's 5-hour and
 * weekly windows for free (`mmx quota show`), so the hold can judge the
 * account before its first hop. The tools themselves are core's
 * `PLAN_TOOLS` (the offer of accounts reads the same entries); a vendor
 * is added there, and here only a parser for a new format.
 */
import { PLAN_TOOLS } from '@delendai/core/contracts';

import type {
	IPlanQuotaFormat,
	IPlanQuotaReader,
} from '../interfaces/plan-quota-reader.interface';

const FORMATS: readonly IPlanQuotaFormat[] = ['mmx-model-remains'];

const isFormat = (format: string): format is IPlanQuotaFormat =>
	FORMATS.some((known) => known === format);

/** Core's plan tools that say what is left, in a format this runner reads. */
export const PLAN_QUOTA_READERS: readonly IPlanQuotaReader[] =
	PLAN_TOOLS.flatMap((tool) =>
		tool.quota !== undefined && isFormat(tool.quota.format)
			? [
					{
						vendor: tool.vendor,
						command: tool.command,
						args: tool.quota.args,
						format: tool.quota.format,
					},
				]
			: [],
	);

/** How long a reader may take before the hold goes on without it. */
export const PLAN_QUOTA_READ_TIMEOUT_MS = 20_000;

/** A percentage reading is kept as `used` of a limit of this. */
export const PERCENT_LIMIT = 100;
