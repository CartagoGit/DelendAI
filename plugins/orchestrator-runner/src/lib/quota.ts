/**
 * quota.ts — the 3-source quota merge + durable write (f00067 S5).
 *
 * The WRITE-side counterpart to `quota/read-quota.ts` (which only reads).
 * It merges the three quota sources the wiki (`06-bootstrap-and-quotas.md`
 * §4) prescribes, in priority order:
 *
 *   1. `http-header`  — HTTP rate-limit response headers (cheapest, free,
 *      observed per API request; S6 feeds these live).
 *   2. `auth-rpc`     — `account/read` / `auth status` RPCs (5-min cache).
 *   3. `local-count`  — locally counted tokens (imprecise fallback; only
 *      the signal when 1 & 2 are unavailable, e.g. a web subscription).
 *
 * CRITICAL I3: a quota `window` (`hourly` | `weekly` | `monthly`) is
 * MANDATORY on every observation and is NEVER averaged across windows. The
 * merge dedupes per `(provider, window)` pair — a higher-priority source
 * shadows a lower one for the SAME window — but hourly and monthly numbers
 * are kept as distinct entries and never combined into one figure.
 *
 * The snapshot is written in the EXACT shape `read-quota.ts` already parses
 * (`{updatedAt, providers: {<id>: [{window, limit, used, resetAt}]}}`),
 * durably: `withFileMutex` → `redactSecrets` → `writeFileAtomic`.
 */
import { redactSecrets } from '@delendai/core/public';
import { withFileMutex, writeFileAtomic } from '@delendai/core/runtime';

import type {
	IQuotaGroupObservation,
	IQuotaGroupWindow,
} from './contracts/interfaces/quota-reservation.interface';
import { readCacheFile } from './services/read-cache-file.helper';

/** The quota window an observation belongs to. Mandatory (CRITICAL I3). */
export type QuotaWindow = 'hourly' | 'weekly' | 'monthly';

/** Where a quota observation came from, cheapest → most-accurate-fallback. */
export type QuotaSource = 'http-header' | 'auth-rpc' | 'local-count';

/** A single per-window quota reading. Matches `read-quota.ts`'s IQuotaWindow. */
export interface IQuotaObservation {
	readonly window: QuotaWindow;
	readonly limit: number | null;
	readonly used: number | null;
	readonly resetAt: string | null;
}

/** One source's reading(s) for one provider. */
export interface IProviderQuotaSample {
	readonly providerId: string;
	readonly source: QuotaSource;
	readonly windows: readonly IQuotaObservation[];
}

/** The on-disk snapshot shape `read-quota.ts` parses. */
export interface IQuotaSnapshotFile {
	readonly updatedAt: string;
	readonly providers: Readonly<Record<string, readonly IQuotaObservation[]>>;
}

/** Lower number = higher priority (shadows the others for the same window). */
const SOURCE_PRIORITY: Readonly<Record<QuotaSource, number>> = {
	'http-header': 0,
	'auth-rpc': 1,
	'local-count': 2,
};

/** Deterministic window ordering for a stable on-disk snapshot. */
const WINDOW_ORDER: Readonly<Record<QuotaWindow, number>> = {
	hourly: 0,
	weekly: 1,
	monthly: 2,
};

/**
 * Merge every source's samples into one per-provider window list.
 *
 * For each `(provider, window)` pair the highest-priority source wins;
 * distinct windows are ALWAYS kept as separate entries (CRITICAL I3 — an
 * hourly reading is never averaged with a monthly one). Ties (same source
 * priority) keep the first-seen observation.
 */
export const mergeQuotaSources = (
	samples: readonly IProviderQuotaSample[],
): Readonly<Record<string, readonly IQuotaObservation[]>> => {
	const byProvider = new Map<
		string,
		Map<QuotaWindow, { priority: number; obs: IQuotaObservation }>
	>();

	for (const sample of samples) {
		const priority = SOURCE_PRIORITY[sample.source];
		let windows = byProvider.get(sample.providerId);
		if (windows === undefined) {
			windows = new Map();
			byProvider.set(sample.providerId, windows);
		}
		for (const obs of sample.windows) {
			const existing = windows.get(obs.window);
			// Higher priority (lower number) wins; equal priority keeps first.
			if (existing === undefined || priority < existing.priority) {
				windows.set(obs.window, { priority, obs });
			}
		}
	}

	const out: Record<string, readonly IQuotaObservation[]> = {};
	for (const [providerId, windows] of byProvider) {
		out[providerId] = [...windows.values()]
			.map((entry) => entry.obs)
			.sort((a, b) => WINDOW_ORDER[a.window] - WINDOW_ORDER[b.window]);
	}
	return out;
};

/** Merge samples into a timestamped snapshot ready to write. */
export const buildQuotaSnapshot = (
	samples: readonly IProviderQuotaSample[],
	now: Date = new Date(),
): IQuotaSnapshotFile => ({
	updatedAt: now.toISOString(),
	providers: mergeQuotaSources(samples),
});

/**
 * Build a `http-header` sample (source 1) from a rate-limit header set. The
 * `window` is REQUIRED (CRITICAL I3) — headers carry `remaining`/`reset`
 * but not the window they belong to, so the caller must name it. `used` is
 * derived only when both `limit` and `remaining` are known.
 */
export const httpHeaderSample = (
	providerId: string,
	opts: {
		readonly window: QuotaWindow;
		readonly limit?: number | null;
		readonly remaining?: number | null;
		readonly resetSeconds?: number | null;
		readonly now?: Date;
	},
): IProviderQuotaSample => {
	const limit = opts.limit ?? null;
	const used =
		typeof limit === 'number' && typeof opts.remaining === 'number'
			? Math.max(0, limit - opts.remaining)
			: null;
	const resetAt =
		typeof opts.resetSeconds === 'number'
			? new Date(
					(opts.now?.getTime() ?? Date.now()) +
						opts.resetSeconds * 1000,
				).toISOString()
			: null;
	return {
		providerId,
		source: 'http-header',
		windows: [{ window: opts.window, limit, used, resetAt }],
	};
};

/** What is already on disk, as written: unknown keys are kept, never dropped. */
const readRaw = async (absPath: string): Promise<Record<string, unknown>> => {
	try {
		const text = await readCacheFile(absPath);
		if (text === undefined) return {};
		const parsed: unknown = JSON.parse(text);
		return parsed !== null &&
			typeof parsed === 'object' &&
			!Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
};

const persist = async (
	absPath: string,
	value: Record<string, unknown>,
): Promise<void> => {
	const redacted = redactSecrets(JSON.stringify(value, null, '\t'));
	await writeFileAtomic(absPath, `${redacted.text}\n`);
};

/**
 * Persist a provider quota snapshot durably: `withFileMutex` (no lost
 * updates across concurrent agents) → `redactSecrets` → `writeFileAtomic`.
 * It writes `updatedAt` and `providers` only: the quota groups beside them
 * are `recordGroupObservation`'s, and rewriting the whole file dropped them.
 */
export const writeQuotaSnapshot = async (
	absPath: string,
	snapshot: IQuotaSnapshotFile,
): Promise<void> => {
	await withFileMutex(absPath, async () => {
		await persist(absPath, { ...(await readRaw(absPath)), ...snapshot });
	});
};

/**
 * Record what quota groups have left, as just observed: the one writer of
 * `groups`, the pools `quotaHoldFor` reserves from. Each window replaces
 * the same window of the group; other windows and groups stay.
 */
export const recordGroupObservation = async (
	absPath: string,
	groups: readonly string[],
	windows: readonly IQuotaGroupWindow[],
	now: Date = new Date(),
): Promise<void> => {
	if (groups.length === 0 || windows.length === 0) return;
	await withFileMutex(absPath, async () => {
		const raw = await readRaw(absPath);
		const current =
			raw.groups !== null && typeof raw.groups === 'object'
				? (raw.groups as Record<string, IQuotaGroupObservation>)
				: {};
		const next: Record<string, IQuotaGroupObservation> = { ...current };
		for (const group of groups) {
			const kept = (current[group]?.windows ?? []).filter(
				(window) =>
					!windows.some((each) => each.window === window.window),
			);
			next[group] = {
				observedAt: now.toISOString(),
				windows: [...kept, ...windows],
			};
		}
		await persist(absPath, {
			...raw,
			updatedAt: now.toISOString(),
			groups: next,
		});
	});
};

/**
 * A provider sample as the windows of a quota group: rate-limit headers
 * count requests.
 */
export const groupWindowsOf = (
	sample: IProviderQuotaSample,
): readonly IQuotaGroupWindow[] =>
	sample.windows.map((window) => ({ ...window, unit: 'requests' }));
