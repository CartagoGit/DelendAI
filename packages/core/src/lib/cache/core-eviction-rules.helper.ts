/**
 * core-eviction-rules.helper.ts — what the core owns at the cache root and
 * removes once nobody needs it.
 *
 * Plugins register rules for their own namespaces; the cache root had
 * none, so two kinds of file stayed forever: logs a writer rotated aside
 * (`hydrate-candidates.log.1`), and scratch files a one-off run left
 * named after its proposal (`f00282-type-gate.log`,
 * `r00046-gate-filesets.json`). Both are matched by name only, never by
 * age alone: a record the runtime still reads is never at risk.
 */
import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

import {
	CORE_EVICTION_DAY_MS,
	ROTATED_LOG_MAX_AGE_DAYS,
	SCRATCH_FILE_MAX_AGE_DAYS,
} from '../contracts/constants/core-eviction.constant';
import type { ICacheEvictionRule } from '../contracts/interfaces/cache-eviction.interface';

const ROTATED_LOG = /\.log\.\d+$/u;
const PROPOSAL_SCRATCH = /^[a-z]\d{5}-[\w.-]+\.(?:log|json|txt)$/u;

const removeOlderMatching =
	(pattern: RegExp, maxAgeDays: number, now: () => number = Date.now) =>
	async (cacheRoot: string, dryRun: boolean): Promise<readonly string[]> => {
		const removed: string[] = [];
		const names = await readdir(cacheRoot).catch(() => [] as string[]);
		for (const name of names.filter((entry) => pattern.test(entry))) {
			const path = join(cacheRoot, name);
			const info = await stat(path).catch(() => undefined);
			if (info === undefined || !info.isFile()) continue;
			if (now() - info.mtimeMs < maxAgeDays * CORE_EVICTION_DAY_MS)
				continue;
			if (!dryRun) await rm(path, { force: true });
			removed.push(name);
		}
		return removed;
	};

export const coreEvictionRules = (
	now?: () => number,
): readonly ICacheEvictionRule[] => [
	{
		id: 'core-rotated-logs',
		owner: 'core',
		path: '.',
		when: {
			kind: 'custom',
			run: removeOlderMatching(
				ROTATED_LOG,
				ROTATED_LOG_MAX_AGE_DAYS,
				now,
			),
		},
	},
	{
		id: 'core-proposal-scratch',
		owner: 'core',
		path: '.',
		when: {
			kind: 'custom',
			run: removeOlderMatching(
				PROPOSAL_SCRATCH,
				SCRATCH_FILE_MAX_AGE_DAYS,
				now,
			),
		},
	},
];
