/**
 * default-scanners.ts — the scanners the public `self_audit` registration
 * runs when the host injects none: the secret scan and the dependency CVE
 * audit, each tagged with the capability a caller can filter by.
 */
import { toScanResult } from '@delendai/core/public';
import { runDepsAudit } from '@delendai/deps/public';
import { realScanDeps, runSecretScan } from '@delendai/security/public';

import type { ISelfAuditScannerEntry } from '../contracts/interfaces/self-audit.interface';

/** Build the secret + dependency scanners over the given workspace root. */
export const buildDefaultScanners = (): ReadonlyMap<
	string,
	ISelfAuditScannerEntry
> =>
	new Map<string, ISelfAuditScannerEntry>([
		[
			'secrets',
			{
				ref: {
					id: 'secrets',
					label: 'Secret scan',
					capability: 'security',
				},
				run: async (workspaceRootAbs) => {
					const outcome = await runSecretScan(
						realScanDeps(workspaceRootAbs),
						{ scope: 'tracked', includeTests: false },
					);
					return toScanResult('secrets', outcome.findings);
				},
			},
		],
		[
			'deps-audit',
			{
				ref: {
					id: 'deps-audit',
					label: 'Dependency CVE audit',
					capability: 'deps',
				},
				run: (workspaceRootAbs) => runDepsAudit(workspaceRootAbs),
			},
		],
	]);
