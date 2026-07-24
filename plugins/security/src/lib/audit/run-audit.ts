/**
 * run-audit.ts — the security-posture aggregator: run a set of scanners and
 * fold their results into one ranked backlog via the shared `aggregateScans`
 * (r00012). Scanners are passed in as result-producing functions, so this
 * stays pure and unit-testable and new scanners drop in without touching this
 * file. The tool wires the real secret + dep-CVE + license runners.
 */
import { aggregateScans } from '@mcp-vertex/core/public';
import type { IAggregatedScan, IScanResult } from '@mcp-vertex/core/public';

/** A scanner: a function that produces one `IScanResult` when run. */
type ScanRunner = () => Promise<IScanResult>;

/** Run every scanner and aggregate the results into one ranked backlog. */
export const runSecurityAudit = async (
	scans: readonly ScanRunner[],
): Promise<IAggregatedScan> =>
	aggregateScans(await Promise.all(scans.map((run) => run())));
