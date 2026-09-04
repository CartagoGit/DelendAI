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

export interface DelendaiDepsDepsAuditOutput {
	tool: string;
	findings: Array<{
		ruleId: string;
		severity: "critical" | "high" | "medium" | "low" | "info";
		message: string;
		fix?: string;
		location?: {
			file: string;
			line?: number;
			endLine?: number;
		};
	}>;
	summary: {
		critical: number;
		high: number;
		medium: number;
		low: number;
		info: number;
	};
	ranAt: string;
	skipped?: boolean;
	note?: string;
	worst: string;
}

export interface DelendaiDepsDepsCheckOutput {
	manifest: string;
	lockfile: {
		present: boolean;
		kind: string;
	};
	findings: {
		kind: string;
		dep?: string;
		detail: string;
	}[];
	healthy: boolean;
}

export interface DelendaiDepsDepsLicensesOutput {
	tool: string;
	findings: Array<{
		ruleId: string;
		severity: "critical" | "high" | "medium" | "low" | "info";
		message: string;
		fix?: string;
		location?: {
			file: string;
			line?: number;
			endLine?: number;
		};
	}>;
	summary: {
		critical: number;
		high: number;
		medium: number;
		low: number;
		info: number;
	};
	worst: string;
}

export interface DelendaiDepsDepsListOutput {
	detail?: "compact" | "normal" | "full";
	manifest: string;
	found: boolean;
	counts: {
		dependencies: number;
		devDependencies: number;
		peerDependencies: number;
		optionalDependencies: number;
	};
	deps: {
		name: string;
		range: string;
		section: string;
	}[];
}

export interface DelendaiDepsDepsOutdatedOutput {
	manifest: string;
	checked: number;
	outdatedCount: number;
	entries: {
		name: string;
		range: string;
		section: string;
		wanted: string;
		latest: string;
		outdated: boolean;
		error?: string;
	}[];
	truncated: boolean;
}

export interface DelendaiDepsDepsPolyglotOutput {
	detail?: "compact" | "normal" | "full";
	manifests: {
		ecosystem: string;
		manifest: string;
		deps: {
			ecosystem: string;
			name: string;
			range: string;
			section: string;
		}[];
	}[];
}

export interface DelendaiDepsDepsTreeOutput {
	manifest: string;
	lockfile: string;
	lockfileFound: boolean;
	root: {
		name: string;
		version: string;
		children: Array<{
			name: string;
			version: string;
			section?: "dependencies" | "devDependencies" | "peerDependencies" | "optionalDependencies";
			children: unknown[];
		}>;
	};
	totalNodes: number;
	maxDepth: number;
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface DepsToolOutputs {
	"delendai_deps_deps_audit": DelendaiDepsDepsAuditOutput;
	"delendai_deps_deps_check": DelendaiDepsDepsCheckOutput;
	"delendai_deps_deps_licenses": DelendaiDepsDepsLicensesOutput;
	"delendai_deps_deps_list": DelendaiDepsDepsListOutput;
	"delendai_deps_deps_outdated": DelendaiDepsDepsOutdatedOutput;
	"delendai_deps_deps_polyglot": DelendaiDepsDepsPolyglotOutput;
	"delendai_deps_deps_tree": DelendaiDepsDepsTreeOutput;
}
