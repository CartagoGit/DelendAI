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

export interface McpVertexQualityPolicyQualityPolicyOutput {
	tests?: {
		summary: string;
		mode?: string;
		source?: string;
		guidance?: string[];
		runner?: string;
		mockApi?: string;
		evidence?: string;
		scopes?: string[];
		presets?: {
			area: string;
			presetId: string;
			reason: string;
		}[];
		sampledPaths?: {
			path: string;
			role: string;
		}[];
		roleCounts?: Record<string, number>;
		strict?: boolean;
		exactOptionalPropertyTypes?: boolean;
		noUncheckedIndexedAccess?: boolean;
		noImplicitOverride?: boolean;
		tsconfigChain?: string[];
		coverageThreshold?: {
			lines: number;
			functions: number;
			branches: number;
			statements: number;
		};
		static?: boolean;
	};
	conventions?: {
		summary: string;
		mode?: string;
		source?: string;
		guidance?: string[];
		runner?: string;
		mockApi?: string;
		evidence?: string;
		scopes?: string[];
		presets?: {
			area: string;
			presetId: string;
			reason: string;
		}[];
		sampledPaths?: {
			path: string;
			role: string;
		}[];
		roleCounts?: Record<string, number>;
		strict?: boolean;
		exactOptionalPropertyTypes?: boolean;
		noUncheckedIndexedAccess?: boolean;
		noImplicitOverride?: boolean;
		tsconfigChain?: string[];
		coverageThreshold?: {
			lines: number;
			functions: number;
			branches: number;
			statements: number;
		};
		static?: boolean;
	};
	lint?: {
		summary: string;
		mode?: string;
		source?: string;
		guidance?: string[];
		runner?: string;
		mockApi?: string;
		evidence?: string;
		scopes?: string[];
		presets?: {
			area: string;
			presetId: string;
			reason: string;
		}[];
		sampledPaths?: {
			path: string;
			role: string;
		}[];
		roleCounts?: Record<string, number>;
		strict?: boolean;
		exactOptionalPropertyTypes?: boolean;
		noUncheckedIndexedAccess?: boolean;
		noImplicitOverride?: boolean;
		tsconfigChain?: string[];
		coverageThreshold?: {
			lines: number;
			functions: number;
			branches: number;
			statements: number;
		};
		static?: boolean;
	};
	types?: {
		summary: string;
		mode?: string;
		source?: string;
		guidance?: string[];
		runner?: string;
		mockApi?: string;
		evidence?: string;
		scopes?: string[];
		presets?: {
			area: string;
			presetId: string;
			reason: string;
		}[];
		sampledPaths?: {
			path: string;
			role: string;
		}[];
		roleCounts?: Record<string, number>;
		strict?: boolean;
		exactOptionalPropertyTypes?: boolean;
		noUncheckedIndexedAccess?: boolean;
		noImplicitOverride?: boolean;
		tsconfigChain?: string[];
		coverageThreshold?: {
			lines: number;
			functions: number;
			branches: number;
			statements: number;
		};
		static?: boolean;
	};
	coverage?: {
		summary: string;
		mode?: string;
		source?: string;
		guidance?: string[];
		runner?: string;
		mockApi?: string;
		evidence?: string;
		scopes?: string[];
		presets?: {
			area: string;
			presetId: string;
			reason: string;
		}[];
		sampledPaths?: {
			path: string;
			role: string;
		}[];
		roleCounts?: Record<string, number>;
		strict?: boolean;
		exactOptionalPropertyTypes?: boolean;
		noUncheckedIndexedAccess?: boolean;
		noImplicitOverride?: boolean;
		tsconfigChain?: string[];
		coverageThreshold?: {
			lines: number;
			functions: number;
			branches: number;
			statements: number;
		};
		static?: boolean;
	};
	dependsOn: string[];
	bytes: number;
	truncated: boolean;
	originalBytes?: number;
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface QualityPolicyToolOutputs {
	"mcp-vertex_quality-policy_quality_policy": McpVertexQualityPolicyQualityPolicyOutput;
}
