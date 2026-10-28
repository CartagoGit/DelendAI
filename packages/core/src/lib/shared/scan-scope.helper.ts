/**
 * scan-scope.helper.ts — what a workspace scan never reads, and the one
 * shape a scan reports its ranked findings in, so scanners do not each
 * keep a copy of both.
 */
import type { IFinding } from '../contracts/interfaces/finding.interface';
import {
	summarizeFindings,
	worstSeverity,
} from '../external-tool/render-findings';

/** Path fragments of dependencies, build output, caches and VCS data. */
const OUTSIDE_SCAN_FRAGMENTS = [
	'/node_modules/',
	'/dist/',
	'/build/',
	'/.cache/',
	'/.git/',
	'/coverage/',
	'/.astro/',
];

/** Whether a workspace-relative path is one a scan never reads. */
export const isOutsideScanScope = (rel: string): boolean =>
	OUTSIDE_SCAN_FRAGMENTS.some((fragment) => `/${rel}`.includes(fragment));

/**
 * Ranked findings as a scan reports them: the first `maxReported`, the
 * true total, whether the list was cut, the per-severity summary and the
 * worst severity (`none` when there is none).
 */
export const findingsReport = (
	findings: readonly IFinding[],
	maxReported: number,
) => ({
	total: findings.length,
	findings: findings.slice(0, maxReported),
	truncated: findings.length > maxReported,
	summary: summarizeFindings(findings),
	worst: worstSeverity(findings) ?? 'none',
});
