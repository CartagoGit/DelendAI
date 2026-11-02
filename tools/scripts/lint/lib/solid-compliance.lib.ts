/**
 * solid-compliance.lib.ts — x00156 S4.
 *
 * Pure baseline-filter helper for `solid-compliance.script.ts`. Split
 * out so the CLI shell stays an orchestrator (SRP) and the filter
 * logic is unit-testable without touching the filesystem.
 *
 * A baseline entry is written as `<ruleId>:<relPath>:<line>`, but it is
 * MATCHED as a per-`(ruleId, relPath)` budget: a file may carry as many
 * findings of a given rule as the baseline recorded, no more.
 *
 * Matching the line number exactly used to be the rule, and it made the
 * gate fail on edits that changed nothing but line offsets — adding one
 * import above a baselined finding "reintroduced" every finding below
 * it. In a repository where many agents commit concurrently that turned
 * a ratchet into a coin flip, and because `bun run validate` is the
 * evidence `close_slice` / `proposal_transition` require, a red
 * `lint:solid` blocked every proposal from closing. The budget keeps the
 * ratchet honest (a genuinely NEW violation raises its file's count and
 * still fails) while ignoring pure line drift.
 *
 * The on-disk format is unchanged, so existing baseline files keep
 * working and `--write-baseline` output stays reviewable line by line.
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
 * The line-insensitive identity a finding is budgeted under. Derived from
 * a baseline entry by dropping its trailing `:<line>` segment.
 */
export const solidFindingBudgetKey = (
	finding: Pick<ISolidFinding, 'id' | 'relPath'>,
): string => `${finding.id}:${finding.relPath}`;

const budgetKeyOfEntry = (entry: string): string =>
	entry.slice(0, entry.lastIndexOf(':'));

/** Count how many findings each `(ruleId, relPath)` pair may still carry. */
export const buildSolidBudget = (
	baseline: ISolidBaseline,
): ReadonlyMap<string, number> => {
	const budget = new Map<string, number>();
	for (const entry of baseline.entries) {
		const key = budgetKeyOfEntry(entry);
		if (key === '') continue;
		budget.set(key, (budget.get(key) ?? 0) + 1);
	}
	return budget;
};

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
	const remaining = new Map(buildSolidBudget(baseline));
	const newFindings: ISolidFinding[] = [];
	let baselinedCount = 0;
	for (const finding of findings) {
		const key = solidFindingBudgetKey(finding);
		const left = remaining.get(key) ?? 0;
		if (left > 0) {
			remaining.set(key, left - 1);
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
