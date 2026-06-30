/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Typed `structuredContent` shapes for this package's MCP tools
 * (leaf module). Contains only the 3 tools registered by
 * `@mcp-vertex/audit`. The cross-plugin umbrella module lives at
 * `packages/core/src/generated/tool-outputs.ts` and contains all 196
 * tools across 16 plugins under `McpVertexToolOutputs`.
 *
 * Prefer importing this file for type lookups scoped to the audit
 * plugin (smaller, zero resolution cost) — fall back to the umbrella
 * only when you need to index tools across multiple plugins.
 *
 * Regenerate with:
 *
 *     bun run types:generate
 *
 * The drift guard in the test suite fails if this file is stale, so
 * any change to a tool's `outputSchema` must be accompanied by a
 * regenerate.
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
		worstSeverity: "FATAL" | "BAD" | "MINOR" | "OK" | "GOOD" | "PERFECT" | "EXEMPLARY";
		files: string[];
		seenBy: string[];
	}>;
	topActions: string[];
	markdown: string;
	proposals:
		| {
				scaffolded: Array<{
					id: string;
					filename: string;
					severity: string;
					files: string[];
				}>;
				reason?: string;
			}
		| { skipped: string }
		| { disabled: true };
}

export interface AuditAuditPlanOutput {
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

export interface AuditAuditRunOutput {
	scope: string;
	mode: "general" | "specific" | "monorepo";
	date: string;
	saved: Array<{
		provider: string;
		model: string;
		path: string;
		bytes: number;
		elapsedMs: number;
	}>;
	failed: Array<{
		provider: string;
		model: string;
		error: string;
		elapsedMs: number;
	}>;
	consolidation: {
		auditsFound: number;
		skipped: Array<{
			path: string;
			reason: string;
		}>;
		findings: unknown[];
		topActions: string[];
		markdown: string;
	};
	proposals:
		| {
				scaffolded: Array<{
					id: string;
					filename: string;
					severity: string;
					files: string[];
				}>;
			}
		| { skipped: string }
		| { disabled: true };
	projects: string[];
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface AuditToolOutputs {
	"audit_audit_consolidate": AuditAuditConsolidateOutput;
	"audit_audit_plan": AuditAuditPlanOutput;
	"audit_audit_run": AuditAuditRunOutput;
}
