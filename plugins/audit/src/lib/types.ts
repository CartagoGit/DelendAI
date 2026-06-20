/**
 * Central types for `@mcp-vertex/audit` (p99, alcance A).
 *
 * The audit pipeline has three shapes:
 *
 * - `IAuditFinding`  — one actionable item reported by a single model.
 *                       Severity comes from the canonical 5-band scale the
 *                       repo's prior audits use (FATAL → PERFECTO).
 * - `IAuditScore`    — one row of the per-dimension scoring table the
 *                       model appends at the end of its report.
 * - `IAuditDocument` — the parsed representation of one audit file
 *                       (one per model).
 *
 * The types are deliberately narrow: each one answers exactly one question
 * the consolidation step needs (what was found? how was the model scored?
 * which file produced these answers?). Wider shapes would force the
 * consolidator to branch on `kind`-style discriminators.
 */

/** Severity bands the repo's audits use, in decreasing order of urgency. */
export type AuditSeverity =
	| 'FATAL'
	| 'MUY_MAL'
	| 'MEJORABLE'
	| 'OK'
	| 'MUY_BIEN'
	| 'PERFECTO';

/** Ordered list, used by the consolidator to rank tables. */
export const SEVERITY_ORDER: readonly AuditSeverity[] = [
	'FATAL',
	'MUY_MAL',
	'MEJORABLE',
	'OK',
	'MUY_BIEN',
	'PERFECTO',
];

/** A single finding a model reports. */
export interface IAuditFinding {
	/** Stable id within the audit document, e.g. `fatal-1`, `mejorable-7`. */
	readonly id: string;
	/** Short, imperative title (`<area>: <verb> <noun>`). */
	readonly title: string;
	/** Severity band the model assigned. */
	readonly severity: AuditSeverity;
	/** Repository-relative file paths cited in the finding, if any. */
	readonly files: readonly string[];
	/** One-paragraph explanation. Markdown is allowed. */
	readonly detail: string;
}

/** One row of the per-dimension scoring table. */
export interface IAuditScore {
	/** Dimension name (e.g. `Arquitectura`, `Tests`, `Seguridad operacional`). */
	readonly dimension: string;
	/** Score on a 0–10 scale. `null` when the model explicitly declined to grade. */
	readonly score: number | null;
	/** One-line comment, often empty. */
	readonly comment: string;
}

/** Identifier of the model that produced one audit. */
export interface IAuditSource {
	/** Display name (`Sonnet 4.6`, `Gemini 3.5 Flash`, `Opus 4.8`, …). */
	readonly model: string;
	/** Host the model ran under (`Antigravity`, `Claude Code`, `Codex`, …). */
	readonly host: string;
	/** Date of the audit in ISO format (`YYYY-MM-DD`). */
	readonly date: string;
}

/** Parsed representation of one audit file (one per model). */
export interface IAuditDocument {
	/** Absolute path of the source file. */
	readonly path: string;
	/** Display name from the file name (slug without date). */
	readonly slug: string;
	/** Identifier of the model and host that wrote the audit. */
	readonly source: IAuditSource;
	/** First three paragraphs of the executive summary. */
	readonly summary: string;
	/** Findings, ordered as they appear in the source. */
	readonly findings: readonly IAuditFinding[];
	/** Per-dimension scoring rows. */
	readonly scores: readonly IAuditScore[];
	/** Top-level note the model added at the end (often a final score). */
	readonly note: string;
}

/** Aggregated view of an audit. Returned by `consolidate`. */
export interface IConsolidation {
	/** Number of audit documents successfully parsed. */
	readonly auditsFound: number;
	/** Paths the consolidator could not parse (with reason). */
	readonly skipped: readonly {
		readonly path: string;
		readonly reason: string;
	}[];
	/** Per-dimension consensus scores (one row per dimension found). */
	readonly consensus: readonly {
		readonly dimension: string;
		readonly scores: ReadonlyArray<{
			readonly model: string;
			readonly score: number | null;
		}>;
		readonly average: number | null;
	}[];
	/** Findings deduplicated across documents, grouped by canonical id. */
	readonly findings: readonly {
		/** Stable id: `fatal-<slug-derived>` for new findings, `consensus-<n>` for shared ones. */
		readonly id: string;
		/** The titles the model used (one per source). */
		readonly titles: readonly string[];
		/** Worst severity across all sources that reported the finding. */
		readonly worstSeverity: AuditSeverity;
		/** Files cited by at least one model. */
		readonly files: readonly string[];
		/** Models that flagged this finding. */
		readonly seenBy: readonly string[];
	}[];
	/** Top-N actionable items the consolidator recommends. */
	readonly topActions: readonly string[];
}
