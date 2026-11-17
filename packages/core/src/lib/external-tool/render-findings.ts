/**
 * render-findings.ts — r00012 S2: pure helpers to summarise, sort and
 * render normalized findings, so every scanner's output looks identical in
 * the CLI, the extension and `toolJson`.
 */
import { FINDING_SEVERITY_ORDER } from '../contracts/constants/finding.constant';
import type {
	FindingSeverity,
	IFinding,
	IFindingCounts,
	IScanResult,
} from '../contracts/interfaces/finding.interface';

const severityRank = (severity: FindingSeverity): number =>
	FINDING_SEVERITY_ORDER.indexOf(severity);

/** Count findings per severity band (all bands present, zero-filled). */
export const summarizeFindings = (
	findings: readonly IFinding[],
): IFindingCounts => {
	const counts: Record<FindingSeverity, number> = {
		critical: 0,
		high: 0,
		medium: 0,
		low: 0,
		info: 0,
	};
	for (const finding of findings) counts[finding.severity] += 1;
	return counts;
};

/** The most severe band present, or `undefined` when there are no findings. */
export const worstSeverity = (
	findings: readonly IFinding[],
): FindingSeverity | undefined => {
	let worst: FindingSeverity | undefined;
	for (const finding of findings) {
		if (
			worst === undefined ||
			severityRank(finding.severity) < severityRank(worst)
		) {
			worst = finding.severity;
		}
	}
	return worst;
};

/**
 * Stable finding order: by severity (most severe first), then file, then
 * line. Pure — returns a new array.
 */
export const sortFindings = (
	findings: readonly IFinding[],
): readonly IFinding[] =>
	[...findings].sort((a, b) => {
		const bySeverity = severityRank(a.severity) - severityRank(b.severity);
		if (bySeverity !== 0) return bySeverity;
		const byFile = (a.location?.file ?? '').localeCompare(
			b.location?.file ?? '',
		);
		if (byFile !== 0) return byFile;
		return (a.location?.line ?? 0) - (b.location?.line ?? 0);
	});

/** Build a normalized `IScanResult` from raw findings + tool id. */
export const toScanResult = (
	tool: string,
	findings: readonly IFinding[],
	options?: { skipped?: boolean; note?: string; ranAt?: string },
): IScanResult => ({
	tool,
	findings,
	summary: summarizeFindings(findings),
	ranAt: options?.ranAt ?? new Date().toISOString(),
	...(options?.skipped !== undefined ? { skipped: options.skipped } : {}),
	...(options?.note !== undefined ? { note: options.note } : {}),
});

/** One-line summary like `deps: 3 findings — 1 critical, 2 medium`. */
export const renderFindingSummary = (result: IScanResult): string => {
	if (result.skipped === true) {
		return `${result.tool}: skipped${result.note ? ` (${result.note})` : ''}`;
	}
	const total = result.findings.length;
	if (total === 0) return `${result.tool}: no findings`;
	const parts = FINDING_SEVERITY_ORDER.filter(
		(band) => result.summary[band] > 0,
	).map((band) => `${result.summary[band]} ${band}`);
	return `${result.tool}: ${total} finding${total === 1 ? '' : 's'} — ${parts.join(', ')}`;
};

/** A plain-text table of findings (severity · location · message). */
export const renderFindingsTable = (result: IScanResult): string => {
	const rows = sortFindings(result.findings).map((finding) => {
		const loc = finding.location
			? `${finding.location.file}${finding.location.line ? `:${finding.location.line}` : ''}`
			: '—';
		return `  ${finding.severity.padEnd(8)} ${loc}  ${finding.message}`;
	});
	return [renderFindingSummary(result), ...rows].join('\n');
};
