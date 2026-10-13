/**
 * read-quota.ts — read the quota snapshot (placeholder for S4).
 *
 * `${cacheDir}/orchestrator-runner/quotas.json` is WRITTEN by the quota
 * tracker in S5 (3-source merge). In S4 the `<prefix>_get_quota` tool only
 * READS it, and must tolerate the file not existing yet (fresh install,
 * bootstrap never run) by returning an empty, well-typed snapshot rather
 * than throwing.
 */
import { readFile } from 'node:fs/promises';

export interface IQuotaWindow {
	readonly window: 'hourly' | 'weekly' | 'monthly';
	readonly limit: number | null;
	readonly used: number | null;
	readonly resetAt: string | null;
}

export interface IQuotaSnapshot {
	readonly present: boolean;
	readonly updatedAt: string | null;
	readonly providers: Readonly<Record<string, readonly IQuotaWindow[]>>;
}

const EMPTY: IQuotaSnapshot = {
	present: false,
	updatedAt: null,
	providers: {},
};

/**
 * Read the quota snapshot. Missing file → `{present:false, providers:{}}`.
 * Corrupt JSON is likewise treated as "no data yet" (never throws): a
 * quota miss must never break a routing conversation.
 */
export const readQuotaSnapshot = async (
	absPath: string,
): Promise<IQuotaSnapshot> => {
	let raw: string;
	try {
		raw = await readFile(absPath, 'utf8');
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') return EMPTY;
		return EMPTY;
	}
	try {
		const parsed = JSON.parse(raw) as Partial<IQuotaSnapshot>;
		return {
			present: true,
			updatedAt:
				typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
			providers:
				parsed.providers && typeof parsed.providers === 'object'
					? (parsed.providers as IQuotaSnapshot['providers'])
					: {},
		};
	} catch {
		return EMPTY;
	}
};
