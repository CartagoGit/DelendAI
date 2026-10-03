/**
 * rank.ts — f00139 S2: pure backlog ranker for aggregated self-audit
 * findings. Re-exports the peer's contract verbatim so the shared
 * spec continues to pass; this file adds the S2 entry point that
 * composes the existing building blocks.
 *
 * Scoring buckets (deterministic):
 *  - severity: critical=4, high=3, medium=2, low=1, info=0
 *  - blast radius: location.file=1, location.line=+0.5, capped at 1.5
 *  - effort: cve-* / aws-* = 0.25, bundle-* = 1.0, else = 0.5
 *
 * Final score:
 *   severity * weights.severity
 *   + blastRadius * weights.blastRadius
 *   - effort * weights.effort
 *
 * Tie-breaker: same score -> lexicographic ruleId wins.
 */
import type { FindingSeverity, IFinding } from '@delendai/core/public';

import {
	DEFAULT_BACKLOG_WEIGHTS,
	type IBacklog,
	type IBacklogItem,
	type IBacklogWeights,
} from '../contracts/interfaces/backlog.interface';

const SEVERITY_WEIGHTS: Readonly<Record<FindingSeverity, number>> = {
	critical: 4,
	high: 3,
	medium: 2,
	low: 1,
	info: 0,
};

const blastRadiusFor = (finding: IFinding): number => {
	if (finding.location === undefined) return 0;
	let blastRadius = 0;
	if (finding.location.file.length > 0) blastRadius += 1;
	if (finding.location.line !== undefined) blastRadius += 0.5;
	return Math.min(blastRadius, 1.5);
};

const effortFor = (finding: IFinding): number => {
	if (finding.ruleId.startsWith('cve-')) return 0.25;
	if (finding.ruleId.startsWith('aws-')) return 0.25;
	if (finding.ruleId.startsWith('bundle-')) return 1;
	return 0.5;
};

const scoreFor = (
	finding: IFinding,
	weights: IBacklogWeights,
): Omit<IBacklogItem, 'finding' | 'rank'> => {
	const severity = SEVERITY_WEIGHTS[finding.severity];
	const blastRadius = blastRadiusFor(finding);
	const effort = effortFor(finding);
	const score =
		severity * weights.severity +
		blastRadius * weights.blastRadius -
		effort * weights.effort;
	return {
		score,
		rationale:
			`severity=${finding.severity}(${severity})*${weights.severity} ` +
			`+ blastRadius=${blastRadius}*${weights.blastRadius} ` +
			`- effort=${effort}*${weights.effort} => ${score}`,
	};
};

/**
 * Rank an `IFinding[]` into an ordered backlog. Highest score first;
 * ties broken by lexicographic `ruleId`. Truncated to `limit`
 * (default 20); `limit < 1` throws RangeError.
 */
export const rankFindings = (
	findings: readonly IFinding[],
	opts?: { limit?: number; weights?: IBacklogWeights },
): IBacklog => {
	const limit = opts?.limit ?? 20;
	if (limit < 1) {
		throw new RangeError('limit must be greater than or equal to 1');
	}
	const weights = opts?.weights ?? DEFAULT_BACKLOG_WEIGHTS;
	return findings
		.map((finding) => ({ finding, ...scoreFor(finding, weights) }))
		.sort((left, right) => {
			if (right.score !== left.score) {
				return right.score - left.score;
			}
			return left.finding.ruleId.localeCompare(right.finding.ruleId);
		})
		.slice(0, limit)
		.map((item, index) => ({ ...item, rank: index + 1 }));
};

/** Score one finding — exposed for spec assertions. */
export const scoreFinding = (
	finding: IFinding,
	weights: IBacklogWeights = DEFAULT_BACKLOG_WEIGHTS,
): Omit<IBacklogItem, 'finding' | 'rank'> => scoreFor(finding, weights);

export {
	DEFAULT_BACKLOG_WEIGHTS,
	type IBacklog,
	type IBacklogItem,
	type IBacklogWeights,
};
