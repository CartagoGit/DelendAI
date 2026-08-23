/**
 * solid-compliance.lib.ts — x00156 S4.
 *
 * Pure baseline-filter helper for `solid-compliance.script.ts`. Split
 * out so the CLI shell stays an orchestrator (SRP) and the filter
 * logic is unit-testable without touching the filesystem.
 *
 * A baseline entry is `<ruleId>:<relPath>:<line>` — matching by the
 * full triple (not just path:line) avoids one rule's baselined
 * finding accidentally suppressing an unrelated rule's NEW finding
 * that happens to land on the same line.
 *
 * Baselines are line-number snapshots: an unrelated edit that shifts
 * a baselined finding's line number makes it look "new" again. That is
 * a known, accepted trade-off for a hermetic regex-based lint with no
 * AST — re-running `--write-baseline` after a legitimate refactor is
 * the expected maintenance step (mirrors `proposal-files-exist`'s own
 * baseline file in this repo).
 */
import type {
	ISolidFinding,
	ISolidScanResult,
} from '../solid-compliance.script';

export interface ISolidBaseline {
	readonly entries: readonly string[];
}

export const EMPTY_SOLID_BASELINE: ISolidBaseline = { entries: [] };

export const solidFindingBaselineKey = (finding: ISolidFinding): string =>
	`${finding.id}:${finding.relPath}:${finding.line}`;

/**
 * Split a scan result's findings into those already accepted by the
 * baseline and those that are new (would fail the gate).
 */
export const partitionSolidFindings = (
	findings: readonly ISolidFinding[],
	baseline: ISolidBaseline,
): {
	readonly newFindings: readonly ISolidFinding[];
	readonly baselinedCount: number;
} => {
	const known = new Set(baseline.entries);
	const newFindings: ISolidFinding[] = [];
	let baselinedCount = 0;
	for (const finding of findings) {
		if (known.has(solidFindingBaselineKey(finding))) {
			baselinedCount += 1;
		} else {
			newFindings.push(finding);
		}
	}
	return { newFindings, baselinedCount };
};

/** Build a baseline snapshot (every current finding) for `--write-baseline`. */
export const buildSolidBaseline = (
	result: ISolidScanResult,
): ISolidBaseline => ({
	entries: [...result.findings.map(solidFindingBaselineKey)].sort(),
});

export const parseSolidBaseline = (raw: string): ISolidBaseline => {
	const parsed = JSON.parse(raw) as { entries?: unknown };
	if (!Array.isArray(parsed.entries)) {
		throw new Error(
			'solid-compliance baseline: expected { "entries": string[] }',
		);
	}
	return { entries: parsed.entries.filter((e) => typeof e === 'string') };
};

export const formatSolidBaseline = (baseline: ISolidBaseline): string =>
	`${JSON.stringify({ entries: baseline.entries }, null, '\t')}\n`;
