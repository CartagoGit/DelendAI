/**
 * aggregate.ts — f00139 S1: pure self-audit aggregator. Awaits every
 * injected scanner in parallel and folds the results into one ranked
 * `ISelfAuditReport` via the shared `aggregateScans` (r00012).
 *
 * Contract (every scanner is optional, none is fatal):
 *  - `scanners` is optional; missing → empty report.
 *  - Runners that resolve with `{skipped:true}` flow into
 *    `ISelfAuditReport.aggregated.skipped` (note preserved).
 *  - Runners that THROW are converted to a skipped result with the
 *    error message as the note. A failed runner and a runner the host
 *    never installed look the same downstream — both land in `skipped`.
 *  - `capabilities` is a per-capability tally derived from each
 *    scanner ref's `capability` tag.
 *  - The function is pure over its inputs (no fs, no git, no
 *    `Date.now()`); `ranAt` is captured at call time.
 */
import { aggregateScans, type IScanResult } from '@delendai/core/public';

import type {
	ISelfAuditOptions,
	ISelfAuditReport,
	ISelfAuditScannerRef,
	ISelfAuditScannerRunner,
} from '../contracts/interfaces/self-audit.interface';

type ISelfAuditScannerEntry = {
	readonly ref: ISelfAuditScannerRef;
	readonly run: ISelfAuditScannerRunner;
};

/** Build a skipped `IScanResult` carrying `note` (only when defined). */
const toSkippedResult = (
	tool: string,
	note: string | undefined,
	ranAt: string,
): IScanResult => ({
	tool,
	findings: [],
	summary: {
		critical: 0,
		high: 0,
		medium: 0,
		low: 0,
		info: 0,
	},
	ranAt,
	skipped: true,
	...(note !== undefined ? { note } : {}),
});

/** Await one scanner; turn any throw into a skipped result. */
const runScanner = async (
	workspaceRootAbs: string,
	entry: ISelfAuditScannerEntry,
	ranAt: string,
): Promise<IScanResult> => {
	try {
		return await entry.run(workspaceRootAbs);
	} catch (error: unknown) {
		const note = error instanceof Error ? error.message : String(error);
		return toSkippedResult(entry.ref.id, note, ranAt);
	}
};

/** Default empty scanner map — no scanners, the audit is a no-op. */
export const defaultScannerMap = (): ReadonlyMap<
	string,
	ISelfAuditScannerEntry
> => new Map();

/** Run every injected scanner and aggregate into one ranked backlog. */
export const aggregateSelfAudit = async (
	options: ISelfAuditOptions,
): Promise<ISelfAuditReport> => {
	const ranAt = new Date().toISOString();
	const scanners = options.scanners ?? defaultScannerMap();
	const entries = [...scanners.values()];
	const results = await Promise.all(
		entries.map((entry) =>
			runScanner(options.workspaceRootAbs, entry, ranAt),
		),
	);
	const aggregated = aggregateScans(results);
	const capabilities = entries.reduce<Record<string, number>>(
		(counts, entry) => {
			counts[entry.ref.capability] =
				(counts[entry.ref.capability] ?? 0) + 1;
			return counts;
		},
		{},
	);

	return {
		ranAt,
		scannerCount: entries.length,
		skipped: results
			.filter((result) => result.skipped === true)
			.map((result) => ({
				id: result.tool,
				...(result.note !== undefined ? { note: result.note } : {}),
			})),
		aggregated,
		worst: aggregated.worst,
		capabilities,
	};
};
