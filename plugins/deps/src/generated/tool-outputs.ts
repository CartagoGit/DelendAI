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

export interface DepsDepsCheckOutput {
	manifest: string;
	lockfile: {
		present: boolean;
		kind: string | null;
	};
	findings: {
		kind: string;
		dep?: string;
		detail: string;
	}[];
	healthy: boolean;
}

export interface DepsDepsListOutput {
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

export interface DepsDepsOutdatedOutput {
	manifest: string;
	checked: number;
	outdatedCount: number;
	entries: Array<{
		name: string;
		range: string;
		section: string;
		wanted: string | null;
		latest: string | null;
		outdated: boolean;
		error?: string;
	}>;
	truncated: boolean;
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface DepsToolOutputs {
	"deps_deps_check": DepsDepsCheckOutput;
	"deps_deps_list": DepsDepsListOutput;
	"deps_deps_outdated": DepsDepsOutdatedOutput;
}
