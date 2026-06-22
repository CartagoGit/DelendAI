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

export interface AuditAuditConsolidateOutput {
	auditsFound: number;
	skipped: {
		path: string;
		reason: string;
	}[];
	consensus: Array<{
		dimension: string;
		scores: Array<{
			model: string;
			score: number | null;
		}>;
		average: number | null;
	}>;
	findings: Array<{
		id: string;
		titles: string[];
		worstSeverity: "FATAL" | "MUY_MAL" | "MEJORABLE" | "OK" | "MUY_BIEN" | "PERFECTO";
		files: string[];
		seenBy: string[];
	}>;
	topActions: string[];
	markdown: string;
}

export interface AuditAuditPlanOutput {
	scope: string;
	markdown: string;
	dimensions: string[];
	availableScopes: Array<{
		name: string;
		label: string;
		kind: "universal" | "layer";
	}>;
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface AuditToolOutputs {
	"audit_audit_consolidate": AuditAuditConsolidateOutput;
	"audit_audit_plan": AuditAuditPlanOutput;
}
