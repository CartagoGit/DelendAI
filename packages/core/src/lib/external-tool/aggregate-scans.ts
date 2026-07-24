/**
 * aggregate-scans.ts — r00012: fold several scanner results into one ranked
 * backlog. Pure; the basis of a "self-audit" that runs every scanner and
 * hands back a single prioritised "fix this next" list. Skipped scans are
 * carried separately so the caller can surface which tools were unavailable.
 */
import type {
	IAggregatedScan,
	IScanResult,
	IScanSkip,
} from '../contracts/interfaces/finding.interface';
import { sortFindings, summarizeFindings } from './render-findings';

/**
 * Merge scan results: concatenate the findings of every non-skipped scan,
 * sort them most-severe-first (then file, then line), and derive the totals.
 * The `worst` band is the first finding's severity (or 'none' when empty).
 */
export const aggregateScans = (
	results: readonly IScanResult[],
): IAggregatedScan => {
	const active = results.filter((result) => result.skipped !== true);
	const skipped: IScanSkip[] = results
		.filter((result) => result.skipped === true)
		.map((result) => ({
			tool: result.tool,
			...(result.note !== undefined ? { note: result.note } : {}),
		}));
	const findings = sortFindings(active.flatMap((result) => result.findings));
	return {
		tools: active.map((result) => result.tool),
		findings,
		summary: summarizeFindings(findings),
		worst: findings[0]?.severity ?? 'none',
		skipped,
	};
};
