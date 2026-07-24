/**
 * finding.interface.ts — r00012 S2: the normalized finding + scan-result
 * shape every scanner reports, so security/deps/perf/forge/browser all
 * surface uniformly and one renderer handles CLI + extension + toolJson.
 *
 * Severity is the scanner-standard 5-band scale (critical…info), NOT the
 * audit plugin's quality-rating bands (FATAL…EXEMPLARY) — those rate a
 * whole audit, these rate a single defect.
 */

/** Scanner-standard severity, most severe first. */
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** Where a finding occurs (optional — some findings are project-wide). */
export interface IFindingLocation {
	/** Repo-relative file path. */
	readonly file: string;
	/** 1-indexed start line. */
	readonly line?: number;
	/** 1-indexed end line (defaults to `line`). */
	readonly endLine?: number;
}

/** A single normalized finding from any scanner. */
export interface IFinding {
	/** Stable rule/check id, e.g. "CVE-2024-1234", "aws-access-key". */
	readonly ruleId: string;
	/** Severity band. */
	readonly severity: FindingSeverity;
	/** Human-readable description of the defect. */
	readonly message: string;
	/** Location, when the finding is anchored to a file/line. */
	readonly location?: IFindingLocation;
	/** Suggested one-line fix, when known. */
	readonly fix?: string;
}

/** Per-severity counts, one entry per band (zero-filled). */
export type IFindingCounts = Readonly<Record<FindingSeverity, number>>;

/** A scanner that was skipped (tool unavailable, etc.). */
export interface IScanSkip {
	readonly tool: string;
	readonly note?: string;
}

/** The union of several scanner runs, ranked into one backlog. */
export interface IAggregatedScan {
	/** Tools that actually ran (skipped ones excluded). */
	readonly tools: readonly string[];
	/** All findings across the active scans, most severe first. */
	readonly findings: readonly IFinding[];
	/** Per-severity totals across every active scan. */
	readonly summary: IFindingCounts;
	/** The most severe band present, or 'none'. */
	readonly worst: FindingSeverity | 'none';
	/** Scans that were skipped and why. */
	readonly skipped: readonly IScanSkip[];
}

/** The full result of one scanner run. */
export interface IScanResult {
	/** The scanner/tool id that produced this. */
	readonly tool: string;
	/** All findings, in whatever order the scanner emitted them. */
	readonly findings: readonly IFinding[];
	/** Counts per severity (derived, carried for cheap rendering). */
	readonly summary: IFindingCounts;
	/** ISO timestamp of the run. */
	readonly ranAt: string;
	/** True when the tool was unavailable and the scan was skipped. */
	readonly skipped?: boolean;
	/** Note when skipped (e.g. the install hint) or otherwise noteworthy. */
	readonly note?: string;
}
