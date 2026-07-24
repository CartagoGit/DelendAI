/**
 * run-audit.ts — the security-posture aggregator: run every available scanner
 * and fold the results into one ranked backlog via the shared `aggregateScans`
 * (r00012). The two scanners are passed in as functions, so this stays pure and
 * unit-testable; the tool wires the real secret + dep-CVE runners.
 */
import { aggregateScans, toScanResult } from '@mcp-vertex/core/public';
import type { IAggregatedScan, IScanResult } from '@mcp-vertex/core/public';

import type { ISecretScanOutcome } from '../contracts/interfaces/secrets.interface';

/** Aggregate a secret scan + a dependency-CVE scan into one ranked backlog. */
export const runSecurityAudit = async (
	runSecrets: () => Promise<ISecretScanOutcome>,
	runDeps: () => Promise<IScanResult>,
): Promise<{ aggregate: IAggregatedScan; scanned: number }> => {
	const secrets = await runSecrets();
	const deps = await runDeps();
	return {
		aggregate: aggregateScans([
			toScanResult('secrets', secrets.findings),
			deps,
		]),
		scanned: secrets.scanned,
	};
};
