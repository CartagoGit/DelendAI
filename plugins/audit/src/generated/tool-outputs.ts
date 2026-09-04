/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Typed `structuredContent` shapes for this package's MCP tools,
 * generated from each tool's Zod `outputSchema` by:
 *
 *     bun run types:generate
 *
 * The drift guard in the test suite fails if this file is stale, so any
 * change to a tool's `outputSchema` must be accompanied by a regenerate.
 * Action-multiplexed tools whose schema is intentionally permissive
 * surface as `Record<string, unknown>`.
 */

export interface DelendaiAuditAuditConsolidateOutput {
	detail: "compact" | "normal" | "full";
	auditType: "plan" | "valuation";
	auditsFound: number;
	skipped: {
		path: string;
		reason: string;
	}[];
	consensus: {
		dimension: string;
		scores: {
			model: string;
			score: number;
		}[];
		average: number;
	}[];
	findings: Array<{
		id: string;
		titles: string[];
		worstSeverity: "FATAL" | "BAD" | "MINOR" | "OK" | "GOOD" | "PERFECT" | "EXEMPLARY";
		files: string[];
		seenBy: string[];
	}>;
	topActions: string[];
	markdown: string;
	proposals: {
		scaffolded: Array<{
			id: string;
			filename: string;
			severity: string;
			files: string[];
			kind: "audit" | "fix" | "plan";
		}>;
		reason?: string;
	} | {
		skipped: string;
	} | {
		disabled: true;
	};
}

export interface DelendaiAuditAuditPlanOutput {
	detail: "compact" | "normal" | "full";
	auditType: "plan" | "valuation";
	scope: string;
	mode: "general" | "specific" | "monorepo";
	markdown: string;
	dimensions: string[];
	availableScopes: Array<{
		name: string;
		label: string;
		kind: "universal" | "layer";
	}>;
	projects: string[];
}

export interface DelendaiAuditAuditRunOutput {
	detail: "compact" | "normal" | "full";
	auditType: "plan" | "valuation";
	scope: string;
	mode: "general" | "specific" | "monorepo";
	date: string;
	saved: {
		provider: string;
		model: string;
		path: string;
		bytes: number;
		elapsedMs: number;
	}[];
	failed: {
		provider: string;
		model: string;
		error: string;
		elapsedMs: number;
	}[];
	consolidation: {
		auditsFound: number;
		skipped: {
			path: string;
			reason: string;
		}[];
		findings: unknown[];
		topActions: string[];
		markdown: string;
	};
	proposals: {
		scaffolded: Array<{
			id: string;
			filename: string;
			severity: string;
			files: string[];
			kind: "audit" | "fix" | "plan";
		}>;
	} | {
		skipped: string;
	} | {
		disabled: true;
	};
	projects: string[];
}

export interface DelendaiAuditSelfAuditOutput {
	ranAt: string;
	worst: "critical" | "high" | "medium" | "low" | "info" | "none";
	summary: {
		critical: number;
		high: number;
		medium: number;
		low: number;
		info: number;
	};
	skipped: {
		id: string;
		note?: string;
	}[];
	scannerCount?: number;
	capabilities?: Record<string, number>;
	backlog: Array<{
		rank: number;
		score: number;
		rationale: string;
		finding: {
			ruleId: string;
			severity: "critical" | "high" | "medium" | "low" | "info";
			message: string;
			location?: {
				file: string;
				line?: number;
				endLine?: number;
			};
			fix?: string;
		};
	}>;
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface AuditToolOutputs {
	"delendai_audit_audit_consolidate": DelendaiAuditAuditConsolidateOutput;
	"delendai_audit_audit_plan": DelendaiAuditAuditPlanOutput;
	"delendai_audit_audit_run": DelendaiAuditAuditRunOutput;
	"delendai_audit_self_audit": DelendaiAuditSelfAuditOutput;
}
