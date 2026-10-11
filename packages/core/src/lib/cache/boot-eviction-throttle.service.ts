import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { CACHE_EVICTION_STAMP_PATH } from '../contracts/constants/cache-layout.constant';
import type {
	ICacheEvictionRegistry,
	ICacheEvictionReport,
} from '../contracts/interfaces/cache-eviction.interface';
import { writeFileAtomic } from '../shared/atomic-write';
import { ensureSelfIgnoringDir } from '../shared/self-ignoring-dir';

/**
 * Whether a boot sweep is due. No interval (or 0) means every boot, which
 * is how the sweep behaved before the throttle existed; a stamp from the
 * future (a clock set back) counts as due rather than silencing the sweep.
 */
export const isBootSweepDue = (input: {
	readonly lastAt: number | null;
	readonly now: number;
	readonly intervalMs: number | undefined;
}): boolean => {
	if (input.intervalMs === undefined || input.intervalMs <= 0) return true;
	if (input.lastAt === null || input.lastAt > input.now) return true;
	return input.now - input.lastAt >= input.intervalMs;
};

const readStamp = async (stampAbs: string): Promise<number | null> => {
	try {
		const parsed: unknown = JSON.parse(await readFile(stampAbs, 'utf8'));
		const at = (parsed as { at?: unknown }).at;
		return typeof at === 'number' && Number.isFinite(at) ? at : null;
	} catch {
		return null;
	}
};

const skippedReport = (now: number): ICacheEvictionReport => ({
	dryRun: true,
	appliedAt: new Date(now).toISOString(),
	totalBytes: 0,
	removed: [],
	skipped: [],
	errors: [],
	rulesEvaluated: 0,
});

/**
 * Run the registry's boot sweep unless one ran within the interval. The
 * stamp is read only when an interval is configured and written only after
 * a sweep ran, so a project that never sets one never gets the file.
 */
export const runThrottledBootSweep = async (input: {
	readonly registry: ICacheEvictionRegistry;
	readonly workspaceRoot: string;
	readonly dryRun: boolean;
	readonly intervalMs: number | undefined;
	readonly now?: () => number;
}): Promise<ICacheEvictionReport> => {
	const now = (input.now ?? Date.now)();
	const throttled = input.intervalMs !== undefined && input.intervalMs > 0;
	const stampAbs = join(input.workspaceRoot, ...CACHE_EVICTION_STAMP_PATH);
	if (throttled) {
		const due = isBootSweepDue({
			lastAt: await readStamp(stampAbs),
			now,
			intervalMs: input.intervalMs,
		});
		if (!due) return skippedReport(now);
	}
	const report = await input.registry.run({ dryRun: input.dryRun });
	if (throttled) {
		await ensureSelfIgnoringDir(dirname(stampAbs));
		await writeFileAtomic(stampAbs, `${JSON.stringify({ at: now })}\n`);
	}
	return report;
};
