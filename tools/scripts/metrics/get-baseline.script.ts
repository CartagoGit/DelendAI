#!/usr/bin/env bun
/**
 * get-baseline.script.ts — fetch the metrics snapshot attached to the
 * previous GitHub release, so the regression gate (`diff-snapshots.script.ts`)
 * has something to compare the current run against.
 *
 * Why a separate module from the diff logic
 * ------------------------------------------
 * Single Responsibility: this module's only job is "resolve a baseline
 * snapshot from the network/filesystem". It knows nothing about diffing or
 * thresholds — that lives in `diff-snapshots.script.ts`. Keeping the two
 * apart means the diff logic can be unit-tested with hand-crafted fixtures
 * (no network), and this module can be unit-tested by injecting a fake
 * fetcher (no real GitHub call).
 *
 * Contract
 * --------
 * - `getBaselineSnapshot` never throws on "no previous release yet" — it
 *   returns `{ ok: false, reason: 'no-previous-release' }` so the CI job can
 *   skip the gate gracefully on the very first tagged release (see f00027
 *   risk R1).
 * - Any other failure (rate limit, malformed JSON, network error) also
 *   resolves rather than throws, with a `reason` the caller can log; the
 *   gate script decides whether that is fatal.
 */
import { dirname } from 'node:path';

/** A single tool's recorded metrics inside a persisted snapshot. */
export interface IMetricSnapshotEntry {
	readonly calls: number;
	readonly errors: number;
	readonly totalMs: number;
	readonly maxMs: number;
	readonly totalBytes: number;
}

/** Shape persisted by `metrics { persist: true }` (see `metrics-tool.ts`). */
export interface IMetricsSnapshotFile {
	readonly at: string;
	readonly tools: Readonly<Record<string, IMetricSnapshotEntry>>;
	readonly totals: {
		readonly calls: number;
		readonly errors: number;
		readonly totalMs: number;
		readonly totalBytes: number;
	};
}

export type IBaselineResult =
	| {
			readonly ok: true;
			readonly tag: string;
			readonly snapshot: IMetricsSnapshotFile;
	  }
	| {
			readonly ok: false;
			readonly reason:
				| 'no-previous-release'
				| 'rate-limited'
				| 'malformed-json'
				| 'network-error'
				| 'no-snapshot-asset';
			readonly detail?: string;
	  };

/** Minimal shape of the GitHub releases API response this module needs. */
interface IGitHubRelease {
	readonly tag_name: string;
	readonly assets: ReadonlyArray<{
		readonly name: string;
		readonly browser_download_url: string;
	}>;
}

/** Injectable fetcher so tests never hit the real network. */
export type IFetchLike = (
	url: string,
	init?: {
		readonly signal?: AbortSignal;
		readonly headers?: Record<string, string>;
	},
) => Promise<{
	readonly ok: boolean;
	readonly status: number;
	json(): Promise<unknown>;
	text(): Promise<string>;
}>;

const ASSET_NAME = 'metrics-baseline.json';
const TIMEOUT_MS = 5000;

const withTimeout = async <T>(
	fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> => {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		return await fn(controller.signal);
	} finally {
		clearTimeout(timer);
	}
};

/**
 * Resolve the metrics snapshot attached to the latest GitHub release of
 * `owner/repo`. Returns a discriminated result rather than throwing so the
 * CI gate can distinguish "no baseline yet" (pass) from "baseline fetch
 * broke" (the caller decides whether that is fatal).
 */
export const getBaselineSnapshot = async (
	owner: string,
	repo: string,
	fetchImpl: IFetchLike = fetch as unknown as IFetchLike,
): Promise<IBaselineResult> => {
	let releaseRes: Awaited<ReturnType<IFetchLike>>;
	try {
		releaseRes = await withTimeout((signal) =>
			fetchImpl(
				`https://api.github.com/repos/${owner}/${repo}/releases/latest`,
				{
					signal,
					headers: { Accept: 'application/vnd.github+json' },
				},
			),
		);
	} catch (err) {
		return { ok: false, reason: 'network-error', detail: String(err) };
	}

	if (releaseRes.status === 404) {
		return { ok: false, reason: 'no-previous-release' };
	}
	if (releaseRes.status === 403 || releaseRes.status === 429) {
		return { ok: false, reason: 'rate-limited' };
	}
	if (!releaseRes.ok) {
		return {
			ok: false,
			reason: 'network-error',
			detail: `HTTP ${releaseRes.status}`,
		};
	}

	let release: IGitHubRelease;
	try {
		release = (await releaseRes.json()) as IGitHubRelease;
	} catch (err) {
		return { ok: false, reason: 'malformed-json', detail: String(err) };
	}

	const asset = release.assets?.find((a) => a.name === ASSET_NAME);
	if (asset === undefined) {
		return { ok: false, reason: 'no-snapshot-asset' };
	}

	let assetRes: Awaited<ReturnType<IFetchLike>>;
	try {
		assetRes = await withTimeout((signal) =>
			fetchImpl(asset.browser_download_url, { signal }),
		);
	} catch (err) {
		return { ok: false, reason: 'network-error', detail: String(err) };
	}
	if (!assetRes.ok) {
		return {
			ok: false,
			reason: 'network-error',
			detail: `HTTP ${assetRes.status}`,
		};
	}

	let snapshot: IMetricsSnapshotFile;
	try {
		snapshot = (await assetRes.json()) as IMetricsSnapshotFile;
	} catch (err) {
		return { ok: false, reason: 'malformed-json', detail: String(err) };
	}
	if (typeof snapshot.tools !== 'object' || snapshot.tools === null) {
		return {
			ok: false,
			reason: 'malformed-json',
			detail: 'missing "tools" field',
		};
	}

	return { ok: true, tag: release.tag_name, snapshot };
};

const isMainModule = (): boolean => {
	const entry = process.argv[1];
	return entry !== undefined && import.meta.url === `file://${entry}`;
};

if (isMainModule()) {
	const [owner, repo] = (
		process.env.GITHUB_REPOSITORY ?? 'CartagoGit/mcp-vertex'
	).split('/');
	if (owner === undefined || repo === undefined) {
		console.error('✖ get-baseline: GITHUB_REPOSITORY must be "owner/repo"');
		process.exit(1);
	}
	getBaselineSnapshot(owner, repo)
		.then(async (result) => {
			if (!result.ok) {
				console.log(
					`ℹ get-baseline: no usable baseline (${result.reason}${result.detail ? `: ${result.detail}` : ''})`,
				);
				return;
			}
			const { writeFileAtomic } = await import(
				'../../../packages/core/src/lib/shared/atomic-write.ts'
			);
			const outFile =
				process.env.METRICS_BASELINE_OUT ?? 'metrics-baseline.json';
			const { mkdir } = await import('node:fs/promises');
			await mkdir(dirname(outFile), { recursive: true }).catch(
				() => undefined,
			);
			await writeFileAtomic(
				outFile,
				`${JSON.stringify(result.snapshot, null, 2)}\n`,
			);
			console.log(
				`✓ get-baseline: wrote ${outFile} (from release ${result.tag})`,
			);
		})
		.catch((err: unknown) => {
			console.error(
				`✖ get-baseline failed: ${err instanceof Error ? err.message : String(err)}`,
			);
			process.exit(1);
		});
}
