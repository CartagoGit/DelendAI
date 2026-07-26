import { aggregateScans, type IScanResult } from '@mcp-vertex/core/public';

import type {
	ISelfAuditOptions,
	ISelfAuditReport,
	ISelfAuditScannerRunner,
	ISelfAuditScannerRef,
} from '../contracts/interfaces/self-audit.interface';

type ISelfAuditScannerEntry = {
	readonly ref: ISelfAuditScannerRef;
	readonly run: ISelfAuditScannerRunner;
};

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

export const defaultScannerMap = (): ReadonlyMap<
	string,
	ISelfAuditScannerEntry
> => new Map();

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
